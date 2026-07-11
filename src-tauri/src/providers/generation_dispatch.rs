//! Generation job dispatch — routes to correct provider based on workflow engine.

use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::db::models::Generation;
use crate::error::{AppError, AppResult};
use crate::providers::comfy_pool::ComfyPool;
use crate::providers::comfy_proxy::{FullSetParams, RemoveBackgroundParams, SimpleImageParams};
use crate::providers::fal_proxy::FalProxy;
use crate::providers::kie_proxy::KieProxy;
use crate::providers::openrouter_proxy::{ImageGenParams, OpenRouterProxy};
use crate::providers::replicate_proxy::ReplicateProxy;
use crate::providers::workflow_manager::{self, Engine, InjectParams};
use crate::services::event_hub::EventHub;
use crate::services::queue::GenerationQueue;
use crate::services::storage::LocalStorage;
use crate::stores::admin_settings;
use crate::stores::generation_store;
use crate::stores::preset_settings;
use crate::utils::ids::new_id;
use crate::utils::time::now_iso;

/// Input for creating a generation.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGenerationInput {
    pub prompt: String,
    pub workflow_id: String,
    pub model_id: Option<String>,
    pub seed: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub aspect_ratio: Option<String>,
    pub batch_size: Option<i64>,
    pub image: Option<String>,
    pub images: Option<Vec<String>>,
    pub workflow_params: Option<serde_json::Value>,
    pub replicate_model: Option<String>,
    pub fal_model: Option<String>,
    pub openrouter_model: Option<String>,
    pub file_input_keys: Option<Vec<String>>,
    pub prompt_field: Option<String>,
    pub preset_id: Option<String>,
}

/// Event payload for generation status updates.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationEvent {
    pub generation_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assets: Option<Vec<crate::db::models::Asset>>,
}

/// Shared state needed by dispatch jobs.
pub struct DispatchContext {
    pub db: sqlx::SqlitePool,
    pub event_hub: EventHub,
    pub storage: Arc<LocalStorage>,
    pub comfy_pool: Arc<ComfyPool>,
    pub generation_queue: Arc<GenerationQueue>,
    pub http_client: reqwest::Client,
    pub config: crate::config::AppConfig,
}

impl DispatchContext {
    pub fn from_state(state: &crate::state::AppState) -> Self {
        Self {
            db: state.db.clone(),
            event_hub: state.event_hub.clone(),
            storage: state.storage.clone(),
            comfy_pool: state.comfy_pool.clone(),
            generation_queue: state.generation_queue.clone(),
            http_client: state.http_client.clone(),
            config: state.config.clone(),
        }
    }
}

/// Create a generation and dispatch it for execution.
pub async fn dispatch_generation(
    ctx: &DispatchContext,
    input: CreateGenerationInput,
) -> AppResult<Generation> {
    // Generate IDs
    let gen_id = new_id("gen");
    let job_id = new_id("job");
    let now = now_iso();

    let seed = input.seed.unwrap_or_else(|| {
        use std::time::{SystemTime, UNIX_EPOCH};
        let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
        (d.as_millis() % 2_147_483_647) as i64
    });

    let batch_size = input.batch_size.unwrap_or(1);

    // Load workflow template
    let template = workflow_manager::load_template(&ctx.db, &input.workflow_id).await?;
    let engine = workflow_manager::detect_engine(&template);
    let meta = workflow_manager::get_meta(&template);

    // Resolve dimensions from aspect ratio if needed
    let (width, height) =
        resolve_dimensions(input.width, input.height, input.aspect_ratio.as_deref());

    // ── Apply preset (prefix, suffix, reference images) ──
    let mut input = input;
    if let Some(ref preset_id) = input.preset_id {
        if let Ok(Some(preset)) =
            preset_settings::get_preset_by_id(&ctx.db, "default", preset_id).await
        {
            // Strip #tag references from the prompt (e.g., "#my-preset" → "")
            let tag_pattern = format!("#{}", slug_for_matching(&preset.name));
            let cleaned_prompt = strip_preset_tags(&input.prompt, &tag_pattern);

            // Build final prompt: prefix + user prompt + suffix
            let mut parts: Vec<&str> = Vec::new();
            let prefix = preset.prompt_prefix.trim();
            let suffix = preset.prompt_suffix.trim();
            let user_prompt = cleaned_prompt.trim();
            if !prefix.is_empty() {
                parts.push(prefix);
            }
            if !user_prompt.is_empty() {
                parts.push(user_prompt);
            }
            if !suffix.is_empty() {
                parts.push(suffix);
            }
            input.prompt = parts.join(" ");

            // Merge preset images into image inputs, respecting maxImageInputs from workflow meta
            if !preset.image_urls.is_empty() {
                let max_images = meta
                    .get("maxImageInputs")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(14) as usize;
                let existing_images = input.images.take().unwrap_or_default();
                let existing_count = existing_images.len();
                let mut all_images = existing_images;
                // Only add as many preset images as the model can accept
                let remaining_slots = max_images.saturating_sub(existing_count);
                all_images.extend(preset.image_urls.iter().take(remaining_slots).cloned());
                input.images = Some(all_images);
                // If single image wasn't set, use first preset image
                if input.image.is_none() && !preset.image_urls.is_empty() {
                    input.image = Some(preset.image_urls[0].clone());
                }
            }
        }
    }

    // Create generation record
    let generation = Generation {
        id: gen_id.clone(),
        user_id: "local-user".into(),
        model_id: input.model_id.clone().unwrap_or_default(),
        prompt: input.prompt.clone(),
        seed,
        workflow_used: input.workflow_id.clone(),
        status: "queued".into(),
        created_at: now.clone(),
        updated_at: now,
        job_id: Some(job_id.clone()),
        error: None,
        assets: vec![],
        batch_size: Some(batch_size),
        width,
        height,
        image_input_url: input.image.clone(),
        workflow_params: {
            // Merge internal state into workflow_params so regeneration can recover it
            let mut wp = input
                .workflow_params
                .clone()
                .unwrap_or_else(|| serde_json::json!({}));
            if let Some(obj) = wp.as_object_mut() {
                if let Some(ar) = &input.aspect_ratio {
                    obj.insert("aspect_ratio".into(), serde_json::json!(ar));
                }
                if let Some(rm) = &input.replicate_model {
                    obj.insert("_replicate_model".into(), serde_json::json!(rm));
                }
                if let Some(fm) = &input.fal_model {
                    obj.insert("_fal_model".into(), serde_json::json!(fm));
                }
                if let Some(om) = &input.openrouter_model {
                    obj.insert("_openrouter_model".into(), serde_json::json!(om));
                }
            }
            if wp.as_object().map_or(true, |o| o.is_empty()) {
                None
            } else {
                Some(wp)
            }
        },
    };

    generation_store::create(&ctx.db, &generation).await?;

    // Unpack workflow_params into InjectParams fields
    let wp = input.workflow_params.as_ref();
    let wp_expand_left = wp
        .and_then(|w| w.get("expand_left"))
        .and_then(|v| v.as_i64());
    let wp_expand_right = wp
        .and_then(|w| w.get("expand_right"))
        .and_then(|v| v.as_i64());
    let wp_expand_top = wp
        .and_then(|w| w.get("expand_top"))
        .and_then(|v| v.as_i64());
    let wp_expand_bottom = wp
        .and_then(|w| w.get("expand_bottom"))
        .and_then(|v| v.as_i64());
    let wp_denoise = wp.and_then(|w| w.get("denoise")).and_then(|v| v.as_f64());
    let wp_edge_blend = wp
        .and_then(|w| w.get("edge_blend"))
        .and_then(|v| v.as_i64());

    // For ComfyUI engine with image input, upload to ComfyUI first to get a filename
    let comfy_image = if engine == Engine::ComfyUI {
        if let Some(ref data_url) = input.image {
            if data_url.starts_with("data:") || data_url.starts_with("http") {
                match ctx.comfy_pool.acquire().await {
                    Ok(mut acquired) => {
                        let result = acquired.proxy.upload_image(data_url).await;
                        acquired.release().await;
                        Some(result?)
                    }
                    Err(e) => return Err(e),
                }
            } else {
                Some(data_url.clone())
            }
        } else {
            None
        }
    } else {
        input.image.clone()
    };

    // Build inject params
    let inject_params = InjectParams {
        prompt: input.prompt.clone(),
        seed,
        width,
        height,
        batch_size: Some(batch_size),
        aspect_ratio: input.aspect_ratio.clone(),
        image: comfy_image,
        lora_name: input.model_id.clone().filter(|s| !s.is_empty()),
        expand_left: wp_expand_left,
        expand_right: wp_expand_right,
        expand_top: wp_expand_top,
        expand_bottom: wp_expand_bottom,
        denoise: wp_denoise,
        edge_blend: wp_edge_blend,
        ..Default::default()
    };

    // Inject tokens into template
    let injected = workflow_manager::inject(&template, &inject_params);

    // Route to correct queue based on engine
    let gen_id_clone = gen_id.clone();
    let job_id_clone = job_id.clone();
    let ctx_db = ctx.db.clone();
    let ctx_eh = ctx.event_hub.clone();
    let ctx_storage = ctx.storage.clone();
    let ctx_pool = ctx.comfy_pool.clone();
    let ctx_http = ctx.http_client.clone();
    let ctx_config = ctx.config.clone();
    let prompt = input.prompt.clone();
    let aspect_ratio = input.aspect_ratio.clone();
    let model_id = input.model_id.clone().unwrap_or_default();
    let replicate_model = input.replicate_model.clone();
    let fal_model = input.fal_model.clone();
    let openrouter_model = input.openrouter_model.clone();
    let image_input = input.image.clone();
    let images_input = input.images.clone();
    let dynamic_file_input_keys = input.file_input_keys.clone();
    let prompt_field = input.prompt_field.clone();
    let workflow_params = input.workflow_params.clone();

    let output_mode = meta
        .get("outputMode")
        .and_then(|v| v.as_str())
        .unwrap_or("single_image")
        .to_string();

    let job = async move {
        // Update status to running
        let running = generation_store::mark_job_running(&ctx_db, &gen_id_clone, &job_id_clone)
            .await
            .map_err(|error| error.to_string())?;
        if !running {
            return Ok(());
        }
        ctx_eh.emit_generation_event(&GenerationEvent {
            generation_id: gen_id_clone.clone(),
            status: "running".into(),
            error: None,
            assets: None,
        });

        let result = match engine {
            Engine::ComfyUI => {
                run_comfy_job(
                    &ctx_pool,
                    &gen_id_clone,
                    &prompt,
                    seed,
                    width.unwrap_or(1024),
                    height.unwrap_or(1024),
                    batch_size,
                    &injected,
                    &output_mode,
                )
                .await
            }
            Engine::OpenRouter => {
                let proxy = OpenRouterProxy::new(
                    ctx_http.clone(),
                    ctx_config.clone(),
                    ctx_storage.clone(),
                    ctx_db.clone(),
                );
                run_openrouter_job(
                    &proxy,
                    &gen_id_clone,
                    &prompt,
                    batch_size,
                    aspect_ratio.as_deref(),
                    &meta,
                    image_input.as_deref(),
                    images_input.as_deref(),
                    openrouter_model.as_deref(),
                )
                .await
            }
            Engine::Replicate => {
                let proxy = ReplicateProxy::new(
                    ctx_http.clone(),
                    ctx_config.clone(),
                    ctx_storage.clone(),
                    ctx_db.clone(),
                );
                run_replicate_job(
                    &proxy,
                    &gen_id_clone,
                    &injected,
                    &meta,
                    &model_id,
                    replicate_model.as_deref(),
                    {
                        // Prefer images array; fall back to wrapping single image
                        if let Some(imgs) = &images_input {
                            if !imgs.is_empty() {
                                Some(imgs.as_slice())
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    },
                    image_input.as_deref(),
                    dynamic_file_input_keys.as_deref(),
                    prompt_field.as_deref(),
                    workflow_params.as_ref(),
                )
                .await
            }
            Engine::Fal => {
                let proxy = FalProxy::new(
                    ctx_http.clone(),
                    ctx_config.clone(),
                    ctx_storage.clone(),
                    ctx_db.clone(),
                );
                run_fal_job(
                    &proxy,
                    &gen_id_clone,
                    &injected,
                    &meta,
                    fal_model.as_deref(),
                    image_input.as_deref(),
                    images_input.as_deref(),
                    dynamic_file_input_keys.as_deref(),
                    workflow_params.as_ref(),
                )
                .await
            }
            Engine::Kie => {
                let proxy = KieProxy::new(
                    ctx_http.clone(),
                    ctx_config.clone(),
                    ctx_storage.clone(),
                    ctx_db.clone(),
                );
                run_kie_job(&proxy, &gen_id_clone, &injected, &meta).await
            }
        };

        match result {
            Ok(assets) if assets.is_empty() => {
                let error_msg = "No images were generated".to_string();
                let failed = generation_store::finish_job(
                    &ctx_db,
                    &gen_id_clone,
                    &job_id_clone,
                    "failed",
                    Some(&error_msg),
                )
                .await;
                if failed.unwrap_or(false) {
                    ctx_eh.emit_generation_event(&GenerationEvent {
                        generation_id: gen_id_clone,
                        status: "failed".into(),
                        error: Some(error_msg.clone()),
                        assets: None,
                    });
                }
                Err(error_msg)
            }
            Ok(assets) => {
                // Store assets in DB
                generation_store::upsert_assets(&ctx_db, &gen_id_clone, &assets)
                    .await
                    .map_err(|e| e.to_string())?;
                let completed = generation_store::finish_job(
                    &ctx_db,
                    &gen_id_clone,
                    &job_id_clone,
                    "succeeded",
                    None,
                )
                .await
                .map_err(|e| e.to_string())?;
                if completed {
                    ctx_eh.emit_generation_event(&GenerationEvent {
                        generation_id: gen_id_clone,
                        status: "succeeded".into(),
                        error: None,
                        assets: Some(assets),
                    });
                }
                Ok(())
            }
            Err(e) => {
                let error_msg = e.to_string();
                let failed = generation_store::finish_job(
                    &ctx_db,
                    &gen_id_clone,
                    &job_id_clone,
                    "failed",
                    Some(error_msg.as_str()),
                )
                .await;
                if failed.unwrap_or(false) {
                    ctx_eh.emit_generation_event(&GenerationEvent {
                        generation_id: gen_id_clone,
                        status: "failed".into(),
                        error: Some(error_msg.clone()),
                        assets: None,
                    });
                }
                Err(error_msg)
            }
        }
    };

    ctx.generation_queue.enqueue(job_id.clone(), job).await;

    Ok(generation)
}

// ── Engine-specific job runners ──

async fn run_comfy_job(
    pool: &ComfyPool,
    generation_id: &str,
    prompt: &str,
    seed: i64,
    width: i64,
    height: i64,
    batch_size: i64,
    workflow: &serde_json::Value,
    output_mode: &str,
) -> AppResult<Vec<crate::db::models::Asset>> {
    let mut acquired = pool.acquire().await?;

    let result = if output_mode == "full_set" {
        acquired
            .proxy
            .generate_full_set(FullSetParams {
                generation_id: generation_id.to_string(),
                prompt: prompt.to_string(),
                seed,
                workflow: workflow.clone(),
                on_preview: None,
                on_asset: None,
                expected_item_count: None,
            })
            .await
    } else {
        acquired
            .proxy
            .generate_simple_image(SimpleImageParams {
                generation_id: generation_id.to_string(),
                prompt: prompt.to_string(),
                seed,
                width,
                height,
                batch_size,
                workflow: workflow.clone(),
                on_preview: None,
                item_index: None,
                filename_prefix: None,
                asset_type: None,
            })
            .await
    };

    acquired.release().await;
    result
}

async fn run_openrouter_job(
    proxy: &OpenRouterProxy,
    generation_id: &str,
    prompt: &str,
    batch_size: i64,
    aspect_ratio: Option<&str>,
    meta: &serde_json::Value,
    image: Option<&str>,
    images: Option<&[String]>,
    explicit_openrouter_model: Option<&str>,
) -> AppResult<Vec<crate::db::models::Asset>> {
    let model = explicit_openrouter_model
        .map(|s| s.to_string())
        .or_else(|| {
            meta.get("model")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });

    let filenames: Vec<String> = (0..batch_size)
        .map(|i| format!("image_{}.png", i))
        .collect();

    proxy
        .generate_images(ImageGenParams {
            prompt: prompt.to_string(),
            prompts: None,
            batch_size,
            aspect_ratio: aspect_ratio.map(|s| s.to_string()),
            width: None,
            height: None,
            seed: None,
            requested_filenames: filenames,
            generation_id: generation_id.to_string(),
            image: image.map(|s| s.to_string()),
            images: images.map(|v| v.to_vec()),
            system_prompt: None,
            start_item_index: if batch_size > 1 { Some(0) } else { None },
            model,
        })
        .await
}

async fn run_replicate_job(
    proxy: &ReplicateProxy,
    generation_id: &str,
    workflow: &serde_json::Value,
    meta: &serde_json::Value,
    model_id: &str,
    explicit_replicate_model: Option<&str>,
    image_inputs: Option<&[String]>,
    single_image_input: Option<&str>,
    dynamic_file_input_keys: Option<&[String]>,
    prompt_field: Option<&str>,
    workflow_params: Option<&serde_json::Value>,
) -> AppResult<Vec<crate::db::models::Asset>> {
    let replicate_model = explicit_replicate_model
        .or_else(|| {
            meta.get("replicate")
                .and_then(|r| r.get("model"))
                .and_then(|m| m.as_str())
        })
        .or_else(|| meta.get("model").and_then(|m| m.as_str()))
        .unwrap_or(model_id);

    // Build the input object.
    // For dynamic models (explicit_replicate_model is set), build a clean input
    // from just prompt + aspect_ratio + schema-validated workflowParams, avoiding
    // template fields the model might not support (e.g. seed).
    // For static workflows, use the template as the base.
    let mut input = if explicit_replicate_model.is_some() {
        let pfield = prompt_field.unwrap_or("prompt");
        let mut obj = serde_json::Map::new();
        // Extract the prompt value from the injected template
        let template = workflow
            .get("prompt")
            .and_then(|p| p.get("template"))
            .or_else(|| workflow.get("input"));
        if let Some(tmpl) = template {
            if let Some(prompt_val) = tmpl.get("prompt").or_else(|| tmpl.get(pfield)) {
                obj.insert(pfield.to_string(), prompt_val.clone());
            }
            // Carry over aspect_ratio from the template (injected from the UI picker)
            if let Some(ar) = tmpl.get("aspect_ratio") {
                obj.insert("aspect_ratio".to_string(), ar.clone());
            }
        }
        // Merge schema-validated workflowParams (these come from the dynamic UI)
        if let Some(wp) = workflow_params {
            if let Some(wp_obj) = wp.as_object() {
                for (k, v) in wp_obj {
                    if k == "aspect_ratio" {
                        continue;
                    }
                    obj.insert(k.clone(), v.clone());
                }
            }
        }
        serde_json::Value::Object(obj)
    } else {
        // Static workflow: use the full template as the base
        let mut input = workflow
            .get("prompt")
            .and_then(|p| p.get("template"))
            .or_else(|| workflow.get("input"))
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));

        // For dynamic models whose prompt field is not "prompt" (e.g. "text"),
        // rename the key so the model receives the prompt under its expected name.
        if let Some(field) = prompt_field {
            if field != "prompt" {
                if let Some(obj) = input.as_object_mut() {
                    if let Some(prompt_val) = obj.remove("prompt") {
                        obj.insert(field.to_string(), prompt_val);
                    }
                }
            }
        }

        // Merge dynamic workflow_params into the input.
        if let Some(wp) = workflow_params {
            if let (Some(input_obj), Some(wp_obj)) = (input.as_object_mut(), wp.as_object()) {
                for (k, v) in wp_obj {
                    if k == "aspect_ratio" {
                        continue;
                    }
                    input_obj.insert(k.clone(), v.clone());
                }
            }
        }
        input
    };

    // Collect all image sources: prefer the images array, fall back to single image
    let all_images: Vec<&str> = if let Some(imgs) = image_inputs {
        imgs.iter().map(|s| s.as_str()).collect()
    } else if let Some(img) = single_image_input {
        vec![img]
    } else {
        vec![]
    };

    // If images were provided but the template didn't have an __IMAGE__ token,
    // inject them into the input using the model's actual file input key name(s).
    // For dynamic models the frontend passes fileInputKeys from the schema;
    // for static workflows they come from meta.replicate.fileInputKeys.
    // Falls back to "image"/"images" for backwards compatibility.
    if !all_images.is_empty() {
        if let Some(obj) = input.as_object_mut() {
            let already_injected = obj
                .get("image")
                .and_then(|v| v.as_str())
                .is_some_and(|s| s.starts_with("data:") || s.starts_with("http"));
            if !already_injected {
                let api_token = proxy.get_api_token().await?;
                // Resolve all images to uploadable URLs
                let mut resolved_urls: Vec<String> = Vec::with_capacity(all_images.len());
                for img in &all_images {
                    resolved_urls.push(proxy.resolve_input_file(img, &api_token).await?);
                }
                // Determine which key(s) to use for the image input.
                // If the frontend sent an explicit (possibly empty) fileInputKeys array,
                // honour it: an empty array means the schema was analysed and no file
                // inputs were found, so we must NOT fall back to hardcoded defaults.
                let image_keys: Vec<&str> = match dynamic_file_input_keys {
                    Some(keys) => keys.iter().map(|s| s.as_str()).collect(),
                    None => {
                        // Static workflow — fall back to meta.replicate.fileInputKeys, then hardcoded defaults
                        meta.get("replicate")
                            .and_then(|r| r.get("fileInputKeys"))
                            .and_then(|k| k.as_array())
                            .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<&str>>())
                            .unwrap_or_else(|| vec!["image", "images"])
                    }
                };
                for key in &image_keys {
                    // Keys suffixed with "[]" expect an array value — inject ALL resolved images
                    if let Some(bare_key) = key.strip_suffix("[]") {
                        let urls_json: Vec<serde_json::Value> = resolved_urls
                            .iter()
                            .map(|u| serde_json::Value::String(u.clone()))
                            .collect();
                        obj.insert(bare_key.to_string(), serde_json::Value::Array(urls_json));
                    } else {
                        // Plain key — inject just the first image (backwards compat)
                        obj.insert(
                            key.to_string(),
                            serde_json::Value::String(resolved_urls[0].clone()),
                        );
                    }
                }
            }
        }
    }

    let file_input_keys_owned: Vec<String> = match dynamic_file_input_keys {
        Some(keys) => keys
            .iter()
            .map(|s| s.strip_suffix("[]").unwrap_or(s).to_string())
            .collect(),
        None => meta
            .get("replicate")
            .and_then(|r| r.get("fileInputKeys"))
            .and_then(|k| k.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
    };
    let file_input_keys: Vec<&str> = file_input_keys_owned.iter().map(|s| s.as_str()).collect();

    let asset = proxy
        .generate_and_save(
            generation_id,
            "image",
            None,
            &input,
            replicate_model,
            &file_input_keys,
            None,
        )
        .await?;

    Ok(vec![asset])
}

async fn run_fal_job(
    proxy: &FalProxy,
    generation_id: &str,
    workflow: &serde_json::Value,
    meta: &serde_json::Value,
    explicit_fal_model: Option<&str>,
    image_input: Option<&str>,
    images_input: Option<&[String]>,
    dynamic_file_input_keys: Option<&[String]>,
    workflow_params: Option<&serde_json::Value>,
) -> AppResult<Vec<crate::db::models::Asset>> {
    // Resolution chain: explicit fal_model → meta.fal.endpoint → error
    let endpoint = explicit_fal_model
        .or_else(|| {
            meta.get("fal")
                .and_then(|f| f.get("endpoint"))
                .and_then(|e| e.as_str())
        })
        .ok_or_else(|| AppError::BadRequest("fal workflow missing endpoint/model".into()))?;

    let output_path = meta
        .get("fal")
        .and_then(|f| f.get("outputPath"))
        .and_then(|o| o.as_str());

    let mut input = workflow
        .get("prompt")
        .and_then(|p| p.get("template"))
        .or_else(|| workflow.get("input"))
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    // Merge dynamic workflow_params into the input (for FAL dynamic model parameters).
    if let Some(wp) = workflow_params {
        if let (Some(input_obj), Some(wp_obj)) = (input.as_object_mut(), wp.as_object()) {
            for (k, v) in wp_obj {
                if k == "aspect_ratio" {
                    continue;
                }
                input_obj.insert(k.clone(), v.clone());
            }
        }
    }

    // Inject image inputs if provided
    let all_images: Vec<&str> = if let Some(imgs) = images_input {
        imgs.iter().map(|s| s.as_str()).collect()
    } else if let Some(img) = image_input {
        vec![img]
    } else {
        vec![]
    };

    if !all_images.is_empty() {
        if let Some(obj) = input.as_object_mut() {
            let image_keys: Vec<&str> = dynamic_file_input_keys
                .and_then(|keys| {
                    if keys.is_empty() {
                        None
                    } else {
                        Some(keys.iter().map(|s| s.as_str()).collect())
                    }
                })
                .unwrap_or_else(|| {
                    meta.get("fal")
                        .and_then(|f| f.get("fileInputKeys"))
                        .and_then(|k| k.as_array())
                        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<&str>>())
                        .unwrap_or_else(|| vec!["image_url"])
                });
            for key in &image_keys {
                if let Some(bare_key) = key.strip_suffix("[]") {
                    let urls_json: Vec<serde_json::Value> = all_images
                        .iter()
                        .map(|u| serde_json::Value::String(u.to_string()))
                        .collect();
                    obj.insert(bare_key.to_string(), serde_json::Value::Array(urls_json));
                } else {
                    obj.insert(
                        key.to_string(),
                        serde_json::Value::String(all_images[0].to_string()),
                    );
                }
            }
        }
    }

    // Convert aspect ratio values (e.g. "1:1") to fal.ai image_size enum values
    if let Some(obj) = input.as_object_mut() {
        if let Some(size_val) = obj
            .get("image_size")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
        {
            let mapped = map_aspect_ratio_to_fal_size(&size_val);
            obj.insert("image_size".to_string(), serde_json::json!(mapped));
        }
    }

    let file_input_keys_owned: Vec<String> = dynamic_file_input_keys
        .and_then(|keys| {
            if keys.is_empty() {
                None
            } else {
                Some(
                    keys.iter()
                        .map(|s| s.strip_suffix("[]").unwrap_or(s).to_string())
                        .collect(),
                )
            }
        })
        .unwrap_or_else(|| {
            meta.get("fal")
                .and_then(|f| f.get("fileInputKeys"))
                .and_then(|k| k.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default()
        });
    let file_input_keys: Vec<&str> = file_input_keys_owned.iter().map(|s| s.as_str()).collect();

    let asset = proxy
        .generate_and_save(
            generation_id,
            "image",
            None,
            &input,
            endpoint,
            &file_input_keys,
            output_path,
            None,
        )
        .await?;

    Ok(vec![asset])
}

async fn run_kie_job(
    proxy: &KieProxy,
    generation_id: &str,
    workflow: &serde_json::Value,
    meta: &serde_json::Value,
) -> AppResult<Vec<crate::db::models::Asset>> {
    let endpoint = meta
        .get("kie")
        .and_then(|k| k.get("endpoint"))
        .and_then(|e| e.as_str())
        .ok_or_else(|| AppError::BadRequest("kie workflow missing endpoint".into()))?;

    let input = workflow
        .get("prompt")
        .and_then(|p| p.get("template"))
        .or_else(|| workflow.get("input"))
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    let asset = proxy
        .generate_and_save(generation_id, "image", None, &input, endpoint, None)
        .await?;

    Ok(vec![asset])
}

/// Resolve width/height from explicit values or aspect ratio.
/// Convert a preset name to a slug for tag matching (lowercase, only alphanumeric + dash).
fn slug_for_matching(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// Strip all #preset-tag references from the prompt text.
fn strip_preset_tags(prompt: &str, tag_slug: &str) -> String {
    let mut result = prompt.to_string();
    // Remove exact #slug matches (case-insensitive)
    let pattern = format!("#{}", tag_slug);
    // Simple case-insensitive removal
    let lower = result.to_lowercase();
    let pat_lower = pattern.to_lowercase();
    if let Some(pos) = lower.find(&pat_lower) {
        // Check word boundary: next char should be whitespace/punctuation/end
        let end = pos + pattern.len();
        let at_boundary = end >= result.len()
            || !result[end..].starts_with(|c: char| c.is_alphanumeric() || c == '-' || c == '_');
        if at_boundary {
            result = format!("{}{}", &result[..pos], &result[end..]);
        }
    }
    // Clean up double spaces
    while result.contains("  ") {
        result = result.replace("  ", " ");
    }
    result.trim().to_string()
}

fn resolve_dimensions(
    width: Option<i64>,
    height: Option<i64>,
    aspect_ratio: Option<&str>,
) -> (Option<i64>, Option<i64>) {
    if width.is_some() && height.is_some() {
        return (width, height);
    }

    if let Some(ar) = aspect_ratio {
        if let Some((w, h)) = workflow_manager::aspect_ratio_to_size(ar) {
            return (Some(w), Some(h));
        }
    }

    (width, height)
}

/// Dispatch a regeneration job for a specific item.
pub async fn dispatch_regenerate(
    ctx: &DispatchContext,
    generation_id: &str,
    item_index: Option<i64>,
    asset_type: Option<&str>,
    seed: Option<i64>,
) -> AppResult<crate::db::models::Asset> {
    let gen = generation_store::get(&ctx.db, generation_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Generation not found: {generation_id}")))?;

    let template = workflow_manager::load_template(&ctx.db, &gen.workflow_used).await?;
    let meta = workflow_manager::get_meta(&template);
    let engine = workflow_manager::detect_engine(&template);

    // Use regen workflow if specified, otherwise use the original
    let regen_workflow_id = meta
        .get("regenWorkflow")
        .and_then(|v| v.as_str())
        .unwrap_or(&gen.workflow_used);

    let regen_template = workflow_manager::load_template(&ctx.db, regen_workflow_id).await?;
    let regen_meta = workflow_manager::get_meta(&regen_template);

    let effective_seed = seed.unwrap_or(gen.seed);
    let item_idx = item_index.unwrap_or(0);
    let at = asset_type.unwrap_or("square");

    // Recover stored state from workflow_params
    let wp_ref = gen.workflow_params.as_ref();
    let stored_aspect_ratio = wp_ref
        .and_then(|wp| wp.get("aspect_ratio"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let stored_replicate_model = wp_ref
        .and_then(|wp| wp.get("_replicate_model"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let stored_fal_model = wp_ref
        .and_then(|wp| wp.get("_fal_model"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let stored_openrouter_model = wp_ref
        .and_then(|wp| wp.get("_openrouter_model"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let inject_params = InjectParams {
        prompt: gen.prompt.clone(),
        seed: effective_seed,
        item_index: Some(item_idx),
        width: gen.width,
        height: gen.height,
        lora_name: Some(gen.model_id.clone()),
        image: gen.image_input_url.clone(),
        aspect_ratio: stored_aspect_ratio.clone(),
        batch_size: Some(1),
        ..Default::default()
    };

    let injected = workflow_manager::inject(&regen_template, &inject_params);

    let assets = match engine {
        Engine::ComfyUI => {
            let mut acquired = ctx.comfy_pool.acquire().await?;
            let asset = acquired
                .proxy
                .regenerate_item(
                    generation_id,
                    &gen.prompt,
                    effective_seed,
                    item_idx,
                    &injected,
                    None,
                )
                .await?;
            acquired.release().await;
            vec![asset]
        }
        Engine::Replicate => {
            let proxy = ReplicateProxy::new(
                ctx.http_client.clone(),
                ctx.config.clone(),
                ctx.storage.clone(),
                ctx.db.clone(),
            );
            let replicate_model = stored_replicate_model.as_deref().filter(|s| !s.is_empty());
            run_replicate_job(
                &proxy,
                generation_id,
                &injected,
                &regen_meta,
                &gen.model_id,
                replicate_model,
                None,
                gen.image_input_url.as_deref(),
                None, // No dynamic_file_input_keys stored; fallback logic handles it
                None, // prompt_field
                gen.workflow_params.as_ref(),
            )
            .await?
        }
        Engine::Fal => {
            let proxy = FalProxy::new(
                ctx.http_client.clone(),
                ctx.config.clone(),
                ctx.storage.clone(),
                ctx.db.clone(),
            );
            run_fal_job(
                &proxy,
                generation_id,
                &injected,
                &regen_meta,
                stored_fal_model.as_deref(),
                gen.image_input_url.as_deref(),
                None,
                None,
                gen.workflow_params.as_ref(),
            )
            .await?
        }
        Engine::OpenRouter => {
            let proxy = OpenRouterProxy::new(
                ctx.http_client.clone(),
                ctx.config.clone(),
                ctx.storage.clone(),
                ctx.db.clone(),
            );
            run_openrouter_job(
                &proxy,
                generation_id,
                &gen.prompt,
                1,
                stored_aspect_ratio.as_deref(),
                &regen_meta,
                gen.image_input_url.as_deref(),
                None,
                stored_openrouter_model.as_deref(),
            )
            .await?
        }
        Engine::Kie => {
            let proxy = KieProxy::new(
                ctx.http_client.clone(),
                ctx.config.clone(),
                ctx.storage.clone(),
                ctx.db.clone(),
            );
            run_kie_job(&proxy, generation_id, &injected, &regen_meta).await?
        }
    };

    let asset = assets
        .into_iter()
        .next()
        .ok_or_else(|| AppError::ProviderError("Regeneration produced no assets".into()))?;

    // Store with correct type and item index so it fills the right slot
    let mut stored_asset = asset.clone();
    stored_asset.asset_type = at.to_string();
    stored_asset.item_index = item_index;
    generation_store::upsert_asset(&ctx.db, generation_id, &stored_asset).await?;

    Ok(stored_asset)
}

/// Dispatch an inpainting job.
pub async fn dispatch_inpaint(
    ctx: &DispatchContext,
    generation_id: &str,
    asset_type: &str,
    item_index: Option<i64>,
    prompt: &str,
    seed: Option<i64>,
    image_data_url: &str,
    mask_data_url: &str,
) -> AppResult<crate::db::models::Asset> {
    // Load inpaint workflow from settings
    let settings = admin_settings::get_settings(&ctx.db).await?;
    let inpaint_wf_id = settings.inpaint_workflow_id.ok_or_else(|| {
        AppError::BadRequest(
            "Inpaint workflow not configured. Set it in Settings > Feature Workflows.".into(),
        )
    })?;
    let template = workflow_manager::load_template(&ctx.db, &inpaint_wf_id).await?;

    let mut acquired = ctx.comfy_pool.acquire().await?;

    // Upload image and mask to ComfyUI
    let image_filename = acquired.proxy.upload_image(image_data_url).await?;
    let mask_filename = acquired.proxy.upload_image(mask_data_url).await?;

    let effective_seed = seed.unwrap_or_else(|| {
        use std::time::{SystemTime, UNIX_EPOCH};
        let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
        (d.as_millis() % 2_147_483_647) as i64
    });

    let inject_params = InjectParams {
        prompt: prompt.to_string(),
        seed: effective_seed,
        image: Some(image_filename),
        mask: Some(mask_filename),
        item_index,
        ..Default::default()
    };

    let injected = workflow_manager::inject(&template, &inject_params);

    let assets = acquired
        .proxy
        .generate_simple_image(crate::providers::comfy_proxy::SimpleImageParams {
            generation_id: generation_id.to_string(),
            prompt: prompt.to_string(),
            seed: effective_seed,
            width: 1024,
            height: 1024,
            batch_size: 1,
            workflow: injected,
            on_preview: None,
            item_index,
            filename_prefix: Some(format!("inpaint_{}", asset_type)),
            asset_type: Some(asset_type.to_string()),
        })
        .await?;

    acquired.release().await;

    let asset = assets
        .into_iter()
        .next()
        .ok_or_else(|| AppError::ProviderError("No output from inpaint".into()))?;

    generation_store::upsert_asset(&ctx.db, generation_id, &asset).await?;

    Ok(asset)
}

/// Dispatch a background removal job.
pub async fn dispatch_remove_background(
    ctx: &DispatchContext,
    generation_id: &str,
    item_index: i64,
    _rembg_workflow: serde_json::Value,
) -> AppResult<crate::db::models::Asset> {
    // Load the rembg workflow from settings
    let settings = admin_settings::get_settings(&ctx.db).await?;
    let rembg_wf_id = settings.rembg_workflow_id.ok_or_else(|| {
        AppError::BadRequest(
            "Remove background workflow not configured. Set it in Settings > Feature Workflows."
                .into(),
        )
    })?;
    let template = workflow_manager::load_template(&ctx.db, &rembg_wf_id).await?;

    // Get the source asset to extract its image URL
    let gen = generation_store::get(&ctx.db, generation_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Generation not found: {generation_id}")))?;

    let source_asset = gen
        .assets
        .iter()
        .find(|a| {
            a.item_index == Some(item_index) && a.asset_type != "rembg" && a.asset_type != "preview"
        })
        .or_else(|| {
            gen.assets
                .iter()
                .find(|a| a.asset_type != "rembg" && a.asset_type != "preview")
        })
        .ok_or_else(|| AppError::NotFound("No source asset found for rembg".into()))?;

    let image_url = &source_asset.url;

    // Convert the source image to a data URL for uploading to ComfyUI
    let image_bytes = ctx.storage.get_buffer(image_url).await?;
    let ext = image_url.rsplit('.').next().unwrap_or("png");
    let mime = match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &image_bytes);
    let image_data_url = format!("data:{};base64,{}", mime, b64);

    let mut acquired = ctx.comfy_pool.acquire().await?;

    // Upload the source image to ComfyUI
    let image_filename = acquired.proxy.upload_image(&image_data_url).await?;

    let seed = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
        (d.as_millis() % 2_147_483_647) as i64
    };

    let inject_params = InjectParams {
        prompt: String::new(),
        seed,
        image: Some(image_filename),
        ..Default::default()
    };

    let injected = workflow_manager::inject(&template, &inject_params);

    let asset = acquired
        .proxy
        .remove_background(RemoveBackgroundParams {
            generation_id: generation_id.to_string(),
            workflow: injected,
            on_preview: None,
            item_index,
        })
        .await?;

    acquired.release().await;

    // Store asset in DB
    generation_store::upsert_asset(&ctx.db, generation_id, &asset).await?;

    Ok(asset)
}

/// Map aspect ratio strings (e.g. "1:1", "16:9") to fal.ai image_size enum values.
/// For any "W:H" input not in the lookup table, snap to the closest fal enum
/// by ratio so the user-picked aspect is preserved as best fal supports it.
fn map_aspect_ratio_to_fal_size(value: &str) -> &str {
    // Already a valid fal enum — pass through.
    if matches!(
        value,
        "square"
            | "square_hd"
            | "landscape_4_3"
            | "landscape_16_9"
            | "portrait_4_3"
            | "portrait_16_9"
    ) {
        return value;
    }

    // Direct hits for common ratios.
    match value {
        "1:1" => return "square_hd",
        "4:3" | "3:2" => return "landscape_4_3",
        "16:9" | "21:9" | "19:9" | "8:5" | "16:10" => return "landscape_16_9",
        "3:4" | "2:3" => return "portrait_4_3",
        "9:16" | "9:21" | "9:19" | "5:8" | "10:16" => return "portrait_16_9",
        _ => {}
    }

    // Algorithmic fallback for arbitrary "W:H" — snap to the closest fal enum.
    if let Some((w_str, h_str)) = value.split_once(':') {
        if let (Ok(w), Ok(h)) = (w_str.parse::<f64>(), h_str.parse::<f64>()) {
            if w > 0.0 && h > 0.0 {
                let ratio = w / h;
                let candidates: &[(&str, f64)] = &[
                    ("portrait_16_9", 9.0 / 16.0),
                    ("portrait_4_3", 3.0 / 4.0),
                    ("square_hd", 1.0),
                    ("landscape_4_3", 4.0 / 3.0),
                    ("landscape_16_9", 16.0 / 9.0),
                ];
                let mut best = "square_hd";
                let mut best_diff = f64::INFINITY;
                for (name, r) in candidates {
                    let d = (ratio - r).abs();
                    if d < best_diff {
                        best_diff = d;
                        best = name;
                    }
                }
                return best;
            }
        }
    }

    "square_hd"
}

#[cfg(test)]
mod fal_size_tests {
    use super::map_aspect_ratio_to_fal_size;

    #[test]
    fn passes_through_valid_fal_enums() {
        assert_eq!(map_aspect_ratio_to_fal_size("square_hd"), "square_hd");
        assert_eq!(
            map_aspect_ratio_to_fal_size("landscape_16_9"),
            "landscape_16_9"
        );
    }

    #[test]
    fn maps_known_ratios() {
        assert_eq!(map_aspect_ratio_to_fal_size("1:1"), "square_hd");
        assert_eq!(map_aspect_ratio_to_fal_size("16:9"), "landscape_16_9");
        assert_eq!(map_aspect_ratio_to_fal_size("9:16"), "portrait_16_9");
        assert_eq!(map_aspect_ratio_to_fal_size("4:3"), "landscape_4_3");
        assert_eq!(map_aspect_ratio_to_fal_size("3:4"), "portrait_4_3");
    }

    #[test]
    fn snaps_unsupported_ratios_to_closest_enum() {
        // Used to fall through to "square_hd" for everything non-matching.
        assert_eq!(map_aspect_ratio_to_fal_size("4:5"), "portrait_4_3");
        assert_eq!(map_aspect_ratio_to_fal_size("5:4"), "landscape_4_3");
        assert_eq!(map_aspect_ratio_to_fal_size("1:2"), "portrait_16_9");
        assert_eq!(map_aspect_ratio_to_fal_size("2:1"), "landscape_16_9");
        assert_eq!(map_aspect_ratio_to_fal_size("7:4"), "landscape_16_9");
    }

    #[test]
    fn invalid_input_falls_back_to_square() {
        assert_eq!(map_aspect_ratio_to_fal_size("garbage"), "square_hd");
        assert_eq!(map_aspect_ratio_to_fal_size("1:0"), "square_hd");
    }
}
