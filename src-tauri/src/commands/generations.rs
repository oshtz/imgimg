use std::future::Future;

use serde::Serialize;
use tauri::State;

use crate::db::models::{Asset, Generation};
use crate::error::{AppError, AppResult};
use crate::providers::generation_dispatch::{
    self, CreateGenerationInput, DispatchContext, GenerationEvent,
};
use crate::state::AppState;
use crate::stores::generation_store;
use crate::utils::ids::new_id;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedGenerationOperation {
    pub generation_id: String,
    pub job_id: String,
    pub queue_position: usize,
}

#[tauri::command]
pub async fn create_generation(
    state: State<'_, AppState>,
    input: CreateGenerationInput,
) -> AppResult<Generation> {
    let ctx = DispatchContext::from_state(&state);
    generation_dispatch::dispatch_generation(&ctx, input).await
}

#[tauri::command]
pub async fn get_generation(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<Generation>> {
    generation_store::get(&state.db, &id).await
}

#[tauri::command]
pub async fn list_generations(state: State<'_, AppState>) -> AppResult<Vec<Generation>> {
    generation_store::list_all(&state.db).await
}

#[tauri::command]
pub async fn delete_generation(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if let Some(generation) = generation_store::get(&state.db, &id).await? {
        if matches!(
            generation.status.as_str(),
            "queued" | "running" | "cancel_requested"
        ) {
            if let Some(job_id) = generation.job_id.as_deref() {
                state.generation_queue.cancel(job_id).await;
            }
        }
    }
    generation_store::delete(&state.db, &id).await?;
    if let Err(error) = state.storage.delete_generation_assets(&id).await {
        log::warn!("Generation {id} was deleted but asset cleanup failed: {error}");
    }
    Ok(())
}

#[tauri::command]
pub async fn cancel_generation(state: State<'_, AppState>, id: String) -> AppResult<Generation> {
    let generation = generation_store::get(&state.db, &id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Generation not found: {id}")))?;
    if !matches!(
        generation.status.as_str(),
        "queued" | "running" | "cancel_requested"
    ) {
        return Err(AppError::BadRequest(format!(
            "Generation cannot be cancelled while it is {}",
            generation.status
        )));
    }

    let job_id = generation
        .job_id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Generation has no active job".into()))?;
    if !generation_store::request_job_cancellation(&state.db, &id, job_id).await? {
        return generation_store::get(&state.db, &id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Generation not found: {id}")));
    }
    state.event_hub.emit_generation_event(&GenerationEvent {
        generation_id: id.clone(),
        status: "cancel_requested".into(),
        error: None,
        assets: None,
    });

    let cancelled = state.generation_queue.cancel(job_id).await;
    let (status, error) =
        if cancelled && generation_store::finish_cancellation(&state.db, &id, job_id).await? {
            ("cancelled", None)
        } else {
            let latest = generation_store::get(&state.db, &id)
                .await?
                .ok_or_else(|| AppError::NotFound(format!("Generation not found: {id}")))?;
            if latest.status != "cancel_requested" {
                return Ok(latest);
            }
            let error = "The active job was no longer present. Retry it when ready.";
            generation_store::update_status(&state.db, &id, "interrupted", None, Some(Some(error)))
                .await?;
            ("interrupted", Some(error))
        };
    state.event_hub.emit_generation_event(&GenerationEvent {
        generation_id: id.clone(),
        status: status.into(),
        error: error.map(str::to_string),
        assets: None,
    });
    generation_store::get(&state.db, &id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Generation not found: {id}")))
}

#[tauri::command]
pub async fn retry_generation(state: State<'_, AppState>, id: String) -> AppResult<Generation> {
    let generation = generation_store::get(&state.db, &id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Generation not found: {id}")))?;
    if !matches!(
        generation.status.as_str(),
        "failed" | "cancelled" | "interrupted"
    ) {
        return Err(AppError::BadRequest(format!(
            "Generation cannot be retried while it is {}",
            generation.status
        )));
    }

    let params = generation.workflow_params.clone();
    let provider_model = |key: &str| {
        params
            .as_ref()
            .and_then(|value| value.get(key))
            .and_then(|value| value.as_str())
            .map(str::to_string)
    };
    let replicate_model = provider_model("_replicate_model");
    let fal_model = provider_model("_fal_model");
    let openrouter_model = provider_model("_openrouter_model");
    let input = CreateGenerationInput {
        prompt: generation.prompt,
        workflow_id: generation.workflow_used,
        model_id: Some(generation.model_id),
        seed: Some(generation.seed),
        width: generation.width,
        height: generation.height,
        aspect_ratio: params
            .as_ref()
            .and_then(|value| value.get("aspect_ratio"))
            .and_then(|value| value.as_str())
            .map(str::to_string),
        batch_size: generation.batch_size,
        image: generation.image_input_url,
        images: None,
        workflow_params: params,
        replicate_model,
        fal_model,
        openrouter_model,
        file_input_keys: None,
        prompt_field: None,
        preset_id: None,
    };
    let ctx = DispatchContext::from_state(&state);
    generation_dispatch::dispatch_generation(&ctx, input).await
}

#[tauri::command]
pub async fn get_asset_versions(
    state: State<'_, AppState>,
    generation_id: String,
    asset_type: String,
    item_index: Option<i64>,
) -> AppResult<Vec<Asset>> {
    generation_store::get_asset_versions(&state.db, &generation_id, &asset_type, item_index).await
}

#[tauri::command]
pub async fn set_active_asset_version(
    state: State<'_, AppState>,
    generation_id: String,
    asset_id: String,
) -> AppResult<()> {
    generation_store::set_active_asset_version(&state.db, &generation_id, &asset_id).await
}

#[tauri::command]
pub async fn update_generation_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
    job_id: Option<String>,
    error: Option<String>,
) -> AppResult<()> {
    generation_store::update_status(
        &state.db,
        &id,
        &status,
        job_id.as_ref().map(|value| Some(value.as_str())),
        error.as_ref().map(|value| Some(value.as_str())),
    )
    .await
}

async fn enqueue_asset_operation<F, Fut>(
    state: &AppState,
    generation_id: String,
    operation: F,
) -> AppResult<QueuedGenerationOperation>
where
    F: FnOnce(DispatchContext) -> Fut + Send + 'static,
    Fut: Future<Output = AppResult<Asset>> + Send + 'static,
{
    generation_store::get(&state.db, &generation_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Generation not found: {generation_id}")))?;

    let job_id = new_id("job");
    generation_store::update_status(
        &state.db,
        &generation_id,
        "queued",
        Some(Some(&job_id)),
        Some(None),
    )
    .await?;

    let ctx = DispatchContext::from_state(state);
    let db = state.db.clone();
    let event_hub = state.event_hub.clone();
    let queue = state.generation_queue.clone();
    let event_generation_id = generation_id.clone();
    let event_job_id = job_id.clone();
    let position = queue
        .enqueue(job_id.clone(), async move {
            if !generation_store::mark_job_running(&db, &event_generation_id, &event_job_id)
                .await
                .map_err(|error| error.to_string())?
            {
                return Ok(());
            }
            event_hub.emit_generation_event(&GenerationEvent {
                generation_id: event_generation_id.clone(),
                status: "running".into(),
                error: None,
                assets: None,
            });
            match operation(ctx).await {
                Ok(asset) => {
                    let completed = generation_store::finish_job(
                        &db,
                        &event_generation_id,
                        &event_job_id,
                        "succeeded",
                        None,
                    )
                    .await
                    .map_err(|error| error.to_string())?;
                    if completed {
                        event_hub.emit_generation_event(&GenerationEvent {
                            generation_id: event_generation_id,
                            status: "succeeded".into(),
                            error: None,
                            assets: Some(vec![asset]),
                        });
                    }
                    Ok(())
                }
                Err(error) => {
                    let message = error.to_string();
                    let failed = generation_store::finish_job(
                        &db,
                        &event_generation_id,
                        &event_job_id,
                        "failed",
                        Some(&message),
                    )
                    .await;
                    if failed.unwrap_or(false) {
                        event_hub.emit_generation_event(&GenerationEvent {
                            generation_id: event_generation_id,
                            status: "failed".into(),
                            error: Some(message.clone()),
                            assets: None,
                        });
                    }
                    Err(message)
                }
            }
        })
        .await;

    Ok(QueuedGenerationOperation {
        generation_id,
        job_id,
        queue_position: position,
    })
}

#[tauri::command]
pub async fn regenerate_item(
    state: State<'_, AppState>,
    generation_id: String,
    item_index: Option<i64>,
    asset_type: Option<String>,
    seed: Option<i64>,
) -> AppResult<QueuedGenerationOperation> {
    let operation_generation_id = generation_id.clone();
    enqueue_asset_operation(&state, generation_id, move |ctx| async move {
        generation_dispatch::dispatch_regenerate(
            &ctx,
            &operation_generation_id,
            item_index,
            asset_type.as_deref(),
            seed,
        )
        .await
    })
    .await
}

#[tauri::command]
pub async fn create_inpaint(
    state: State<'_, AppState>,
    generation_id: String,
    asset_type: String,
    item_index: Option<i64>,
    prompt: String,
    seed: Option<i64>,
    image_data_url: String,
    mask_data_url: String,
) -> AppResult<QueuedGenerationOperation> {
    let operation_generation_id = generation_id.clone();
    enqueue_asset_operation(&state, generation_id, move |ctx| async move {
        generation_dispatch::dispatch_inpaint(
            &ctx,
            &operation_generation_id,
            &asset_type,
            item_index,
            &prompt,
            seed,
            &image_data_url,
            &mask_data_url,
        )
        .await
    })
    .await
}

#[tauri::command]
pub async fn export_generation_assets_zip(
    state: State<'_, AppState>,
    generation_id: String,
    destination: String,
) -> AppResult<()> {
    let destination = std::path::PathBuf::from(destination);
    if destination.extension().and_then(|value| value.to_str()) != Some("zip") {
        return Err(AppError::BadRequest(
            "Export destination must be a .zip file".into(),
        ));
    }
    let assets = generation_store::get_all_assets_for_generation(&state.db, &generation_id).await?;
    if assets.is_empty() {
        return Err(AppError::NotFound("No assets found".into()));
    }
    let source_paths: Vec<(std::path::PathBuf, String)> = assets
        .iter()
        .filter_map(|asset| {
            let path = state.storage.resolve_url_to_path(&asset.url)?;
            let name = path.file_name()?.to_str()?.to_string();
            Some((path, name))
        })
        .collect();
    if source_paths.is_empty() {
        return Err(AppError::NotFound("No local asset files found".into()));
    }

    tokio::task::spawn_blocking(move || -> AppResult<()> {
        let part_path = std::path::PathBuf::from(format!("{}.part", destination.display()));
        let file = std::fs::File::create(&part_path)?;
        let mut zip = zip::ZipWriter::new(file);
        let options =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (source_path, filename) in source_paths {
            let mut source = std::fs::File::open(source_path)?;
            zip.start_file(filename, options)
                .map_err(|error| AppError::Internal(format!("ZIP error: {error}")))?;
            std::io::copy(&mut source, &mut zip)
                .map_err(|error| AppError::Internal(format!("ZIP write error: {error}")))?;
        }
        zip.finish()
            .map_err(|error| AppError::Internal(format!("ZIP finish error: {error}")))?;
        if let Err(error) = std::fs::rename(&part_path, &destination) {
            let _ = std::fs::remove_file(&part_path);
            return Err(error.into());
        }
        Ok(())
    })
    .await
    .map_err(|error| AppError::Internal(format!("ZIP task failed: {error}")))?
}

#[tauri::command]
pub async fn remove_background(
    state: State<'_, AppState>,
    generation_id: String,
    item_index: i64,
    workflow: serde_json::Value,
) -> AppResult<QueuedGenerationOperation> {
    let operation_generation_id = generation_id.clone();
    enqueue_asset_operation(&state, generation_id, move |ctx| async move {
        generation_dispatch::dispatch_remove_background(
            &ctx,
            &operation_generation_id,
            item_index,
            workflow,
        )
        .await
    })
    .await
}
