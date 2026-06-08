use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::State;

use crate::db::models::{CanvasMeta, CanvasState, ChatThread, ChatThreadSummary, WorkflowRecord};
use crate::error::AppResult;
use crate::providers::canvas_agent;
use crate::providers::lora_service::LoraService;
use crate::providers::openrouter_proxy::OpenRouterProxy;
use crate::state::AppState;
use crate::stores::{canvas_meta, canvas_state, chat_thread, lora_settings, workflow_store};

type CanvasChatCancellationMap =
    Arc<tokio::sync::Mutex<HashMap<String, Arc<AtomicBool>>>>;

#[derive(Debug, Default, PartialEq, Eq)]
struct WorkflowAgentOverrides {
    model: Option<String>,
    system_prompt: Option<String>,
}

async fn register_canvas_chat_cancellation(
    cancellations: &CanvasChatCancellationMap,
    request_id: &str,
) -> Arc<AtomicBool> {
    let mut cancellations = cancellations.lock().await;
    cancellations
        .entry(request_id.to_string())
        .or_insert_with(|| Arc::new(AtomicBool::new(false)))
        .clone()
}

async fn cancel_canvas_chat_request(
    cancellations: &CanvasChatCancellationMap,
    request_id: &str,
) -> bool {
    let mut inserted_pre_cancel = false;
    let flag = {
        let mut cancellations = cancellations.lock().await;
        cancellations
            .entry(request_id.to_string())
            .or_insert_with(|| {
                inserted_pre_cancel = true;
                Arc::new(AtomicBool::new(true))
            })
            .clone()
    };
    flag.store(true, Ordering::Relaxed);
    inserted_pre_cancel
}

fn trimmed_meta_string(meta: &serde_json::Value, key: &str) -> Option<String> {
    meta.get(key)
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn resolve_workflow_agent_overrides(
    canvas_workflow_id: Option<&str>,
    workflows: &[WorkflowRecord],
) -> WorkflowAgentOverrides {
    let Some(workflow_id) = canvas_workflow_id else {
        return WorkflowAgentOverrides::default();
    };
    let Some(workflow) = workflows.iter().find(|wf| wf.id == workflow_id) else {
        return WorkflowAgentOverrides::default();
    };

    WorkflowAgentOverrides {
        model: trimmed_meta_string(&workflow.meta, "agentModel"),
        system_prompt: trimmed_meta_string(&workflow.meta, "agentSystemPrompt"),
    }
}

// ── Canvas Meta (multi-canvas CRUD) ──

#[tauri::command]
pub async fn list_canvases(state: State<'_, AppState>) -> AppResult<Vec<CanvasMeta>> {
    canvas_meta::list(&state.db).await
}

#[tauri::command]
pub async fn create_canvas(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> AppResult<CanvasMeta> {
    canvas_meta::create(&state.db, &id, &name).await
}

#[tauri::command]
pub async fn rename_canvas(state: State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    canvas_meta::rename(&state.db, &id, &name).await
}

#[tauri::command]
pub async fn delete_canvas(state: State<'_, AppState>, id: String) -> AppResult<()> {
    canvas_meta::delete(&state.db, &id).await
}

// ── Canvas State ──

#[tauri::command]
pub async fn get_canvas_state(
    state: State<'_, AppState>,
    game_id: Option<String>,
) -> AppResult<Option<CanvasState>> {
    let gid = game_id.as_deref().unwrap_or("default");
    canvas_state::get_by_game_id(&state.db, gid).await
}

#[tauri::command]
pub async fn save_canvas_state(
    state: State<'_, AppState>,
    game_id: Option<String>,
    nodes: serde_json::Value,
    chat_messages: serde_json::Value,
    chat_workflow_id: Option<String>,
    next_z_index: i64,
    pinned_model_ids: Option<serde_json::Value>,
    pinned_workflow_ids: Option<serde_json::Value>,
    selected_provider_model_id: Option<String>,
    active_engine: Option<String>,
) -> AppResult<()> {
    let gid = game_id.as_deref().unwrap_or("default");
    canvas_state::upsert(
        &state.db,
        gid,
        &nodes,
        &chat_messages,
        chat_workflow_id.as_deref(),
        next_z_index,
        pinned_model_ids.as_ref(),
        pinned_workflow_ids.as_ref(),
        selected_provider_model_id.as_deref(),
        active_engine.as_deref(),
        "local-user",
        "user@imgimg.local",
    )
    .await
}

// ── Canvas Chat ──

#[tauri::command]
pub async fn canvas_chat(
    state: State<'_, AppState>,
    request_id: String,
    messages: Vec<serde_json::Value>,
    canvas_context: Option<Vec<serde_json::Value>>,
    canvas_workflow_id: Option<String>,
    pinned_model_ids: Option<Vec<String>>,
    pinned_workflow_ids: Option<Vec<String>>,
    provider_model_id: Option<String>,
    model: Option<String>,
    system_prompt: Option<String>,
    temperature: Option<f64>,
) -> AppResult<String> {
    let cancellation =
        register_canvas_chat_cancellation(&state.canvas_chat_cancellations, &request_id).await;

    let result = async {
        let proxy = OpenRouterProxy::new(
            state.http_client.clone(),
            state.config.clone(),
            state.storage.clone(),
            state.db.clone(),
        );

        // Load workflows from DB and filter for agent use.
        // If pinned_workflow_ids is provided, only include those specific workflows.
        // Otherwise fall back to including all non-hidden, non-canvas-mode workflows.
        let all_workflows = workflow_store::list(&state.db).await.unwrap_or_default();

        let workflow_agent_overrides =
            resolve_workflow_agent_overrides(canvas_workflow_id.as_deref(), &all_workflows);

        // Priority: explicit per-call settings -> active canvas workflow override -> global admin default.
        let effective_model = match model {
            Some(value) => Some(value),
            None => match workflow_agent_overrides.model {
                Some(value) => Some(value),
                None => crate::stores::admin_settings::get_canvas_agent_model(&state.db).await?,
            },
        };

        let effective_system = match system_prompt {
            Some(value) => Some(value),
            None => match workflow_agent_overrides.system_prompt {
                Some(value) => Some(value),
                None => {
                    crate::stores::admin_settings::get_canvas_agent_system_prompt(&state.db).await?
                }
            },
        };

        let effective_temp = if temperature.is_some() {
            temperature
        } else {
            crate::stores::admin_settings::get_canvas_agent_temperature(&state.db).await?
        };
        let pinned_wf_set: Option<std::collections::HashSet<&str>> =
            pinned_workflow_ids.as_ref().and_then(|ids| {
                if ids.is_empty() {
                    None
                } else {
                    Some(ids.iter().map(|s| s.as_str()).collect())
                }
            });

        let mut available_workflows: Vec<serde_json::Value> = Vec::new();
        for wf in &all_workflows {
            let meta = &wf.meta;

            if let Some(ref pinned) = pinned_wf_set {
                // When workflows are pinned, only include those exact workflows
                if !pinned.contains(wf.id.as_str()) {
                    continue;
                }
            } else {
                // No pinned workflows — use default filtering
                // Skip the canvas workflow itself (it's the container, not a generation workflow)
                if let Some(ref cw_id) = canvas_workflow_id {
                    if wf.id == *cw_id {
                        continue;
                    }
                }
                // Skip hidden workflows
                if meta
                    .get("hidden")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
                {
                    continue;
                }
                // Skip other canvas-mode workflows
                if meta
                    .pointer("/ui/canvasMode")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
                {
                    continue;
                }
            }

            let template_str = serde_json::to_string(&wf.template).unwrap_or_default();
            // Skip regen-only workflows
            if template_str.contains("__ITEM_INDEX__") {
                continue;
            }
            let requires_size =
                template_str.contains("__WIDTH__") || template_str.contains("__HEIGHT__");
            let supports_image_input = meta
                .get("supportsImageInput")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
                || wf.engine == "openrouter"
                || wf.engine == "replicate";

            available_workflows.push(serde_json::json!({
                "id": wf.id,
                "label": wf.label,
                "description": meta.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                "outputMode": wf.output_mode,
                "supportsImageInput": supports_image_input,
                "requiresSize": requires_size,
                "engine": wf.engine,
            }));
        }

        // Load available LoRA models (don't let ComfyUI failure break the agent)
        let available_models: Vec<serde_json::Value> = (async {
            let lora_svc = LoraService::new();
            let lora_names = lora_svc.list_available(&state.comfy_pool).await?;
            let game_id = "default";
            let enabled = lora_settings::get_enabled_for_game(&state.db, game_id).await?;
            let display_names =
                lora_settings::get_display_names_for_game(&state.db, game_id).await?;
            let preview_urls = lora_settings::get_preview_urls_for_game(&state.db, game_id).await?;

            let models = LoraService::as_models(
                &lora_names,
                enabled.as_deref(),
                Some(&display_names),
                Some(&preview_urls),
            );

            // Filter by pinned_model_ids if provided
            let filtered = if let Some(ref pinned) = pinned_model_ids {
                if !pinned.is_empty() {
                    let pinned_set: std::collections::HashSet<&str> =
                        pinned.iter().map(|s| s.as_str()).collect();
                    models
                        .into_iter()
                        .filter(|m| pinned_set.contains(m.id.as_str()))
                        .collect()
                } else {
                    models
                }
            } else {
                models
            };

            Ok::<Vec<serde_json::Value>, crate::error::AppError>(
                filtered
                    .iter()
                    .map(|m| {
                        serde_json::json!({
                            "id": m.id,
                            "name": m.name,
                            "tags": m.tags,
                        })
                    })
                    .collect(),
            )
        })
        .await
        .unwrap_or_default();

        let workflows_ref = if available_workflows.is_empty() {
            None
        } else {
            Some(available_workflows.as_slice())
        };

        let models_ref = if available_models.is_empty() {
            None
        } else {
            Some(available_models.as_slice())
        };

        log::info!(
            "canvas_chat request_id={} workflow_id={} model={} provider_model_id={} available_workflows={} available_models={}",
            request_id,
            canvas_workflow_id.as_deref().unwrap_or("<none>"),
            effective_model.as_deref().unwrap_or("<default>"),
            provider_model_id.as_deref().unwrap_or("<none>"),
            available_workflows.len(),
            available_models.len()
        );

        canvas_agent::chat(
            &proxy,
            &request_id,
            &messages,
            canvas_context.as_deref(),
            workflows_ref,
            models_ref,
            provider_model_id.as_deref(),
            effective_model.as_deref(),
            effective_system.as_deref(),
            effective_temp,
            cancellation,
            &state.event_hub,
        )
        .await
    }
    .await;

    state
        .canvas_chat_cancellations
        .lock()
        .await
        .remove(&request_id);

    result
}

// ── Chat Threads ──

#[tauri::command]
pub async fn cancel_canvas_chat(state: State<'_, AppState>, request_id: String) -> AppResult<()> {
    let inserted_pre_cancel =
        cancel_canvas_chat_request(&state.canvas_chat_cancellations, &request_id).await;
    log::info!(
        "canvas_chat cancellation requested request_id={} pre_registered={}",
        request_id,
        inserted_pre_cancel
    );

    if inserted_pre_cancel {
        let cancellations = state.canvas_chat_cancellations.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(30)).await;
            cancellations.lock().await.remove(&request_id);
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn list_chat_threads(
    state: State<'_, AppState>,
    canvas_id: String,
) -> AppResult<Vec<ChatThreadSummary>> {
    chat_thread::list_for_canvas(&state.db, &canvas_id).await
}

#[tauri::command]
pub async fn get_chat_thread(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<ChatThread>> {
    chat_thread::get(&state.db, &id).await
}

#[tauri::command]
pub async fn save_chat_thread(
    state: State<'_, AppState>,
    id: String,
    canvas_id: String,
    title: String,
    messages: serde_json::Value,
) -> AppResult<()> {
    chat_thread::upsert(&state.db, &id, &canvas_id, &title, &messages).await
}

#[tauri::command]
pub async fn delete_chat_thread(state: State<'_, AppState>, id: String) -> AppResult<()> {
    chat_thread::delete(&state.db, &id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::WorkflowRecord;
    use std::collections::HashMap;
    use tokio::sync::Mutex;

    fn workflow_record(id: &str, meta: serde_json::Value) -> WorkflowRecord {
        WorkflowRecord {
            id: id.to_string(),
            label: id.to_string(),
            engine: "comfyui".to_string(),
            output_mode: "single_image".to_string(),
            meta,
            template: serde_json::json!({}),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[tokio::test]
    async fn pre_cancelled_requests_remain_cancelled_when_registered() {
        let cancellations = Arc::new(Mutex::new(HashMap::new()));

        cancel_canvas_chat_request(&cancellations, "req-1").await;
        let flag = register_canvas_chat_cancellation(&cancellations, "req-1").await;

        assert!(flag.load(Ordering::Relaxed));
        assert!(Arc::ptr_eq(
            &flag,
            cancellations.lock().await.get("req-1").unwrap()
        ));
    }

    #[test]
    fn workflow_agent_overrides_trim_and_ignore_empty_values() {
        let workflows = vec![
            workflow_record(
                "wf-a",
                serde_json::json!({
                    "agentModel": "  openai/gpt-4.1-mini  ",
                    "agentSystemPrompt": "  Use concise canvas actions.  "
                }),
            ),
            workflow_record(
                "wf-empty",
                serde_json::json!({
                    "agentModel": "   ",
                    "agentSystemPrompt": ""
                }),
            ),
        ];

        let overrides = resolve_workflow_agent_overrides(Some("wf-a"), &workflows);
        assert_eq!(overrides.model.as_deref(), Some("openai/gpt-4.1-mini"));
        assert_eq!(
            overrides.system_prompt.as_deref(),
            Some("Use concise canvas actions.")
        );

        let empty = resolve_workflow_agent_overrides(Some("wf-empty"), &workflows);
        assert_eq!(empty.model, None);
        assert_eq!(empty.system_prompt, None);
    }
}
