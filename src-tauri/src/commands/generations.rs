use tauri::State;

use crate::db::models::{Asset, Generation};
use crate::error::AppResult;
use crate::providers::generation_dispatch::{self, CreateGenerationInput, DispatchContext};
use crate::state::AppState;
use crate::stores::generation_store;

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
pub async fn delete_generation(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    state.storage.delete_generation_assets(&id).await?;
    generation_store::delete(&state.db, &id).await
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
        job_id.as_ref().map(|j| Some(j.as_str())),
        error.as_ref().map(|e| Some(e.as_str())),
    )
    .await
}

/// Regenerate a specific item in a generation.
#[tauri::command]
pub async fn regenerate_item(
    state: State<'_, AppState>,
    generation_id: String,
    item_index: Option<i64>,
    asset_type: Option<String>,
    seed: Option<i64>,
) -> AppResult<Asset> {
    let ctx = DispatchContext::from_state(&state);
    generation_dispatch::dispatch_regenerate(
        &ctx,
        &generation_id,
        item_index,
        asset_type.as_deref(),
        seed,
    )
    .await
}

/// Inpaint an asset.
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
) -> AppResult<Asset> {
    let ctx = DispatchContext::from_state(&state);
    generation_dispatch::dispatch_inpaint(
        &ctx,
        &generation_id,
        &asset_type,
        item_index,
        &prompt,
        seed,
        &image_data_url,
        &mask_data_url,
    )
    .await
}

/// Download all assets for a generation as a ZIP file (returns bytes).
#[tauri::command]
pub async fn download_generation_assets_zip(
    state: State<'_, AppState>,
    generation_id: String,
) -> AppResult<Vec<u8>> {
    let assets = generation_store::get_all_assets_for_generation(&state.db, &generation_id).await?;
    if assets.is_empty() {
        return Err(crate::error::AppError::NotFound("No assets found".into()));
    }

    let mut buf = std::io::Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buf);
        let options = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for asset in &assets {
            let bytes = match state.storage.get_buffer(&asset.url).await {
                Ok(b) => b,
                Err(_) => continue,
            };
            let filename = asset
                .url
                .rsplit('/')
                .next()
                .unwrap_or("asset.bin");
            zip.start_file(filename, options)
                .map_err(|e| crate::error::AppError::Internal(format!("ZIP error: {e}")))?;
            std::io::Write::write_all(&mut zip, &bytes)
                .map_err(|e| crate::error::AppError::Internal(format!("ZIP write error: {e}")))?;
        }
        zip.finish()
            .map_err(|e| crate::error::AppError::Internal(format!("ZIP finish error: {e}")))?;
    }

    Ok(buf.into_inner())
}

/// Remove background from an asset.
#[tauri::command]
pub async fn remove_background(
    state: State<'_, AppState>,
    generation_id: String,
    item_index: i64,
    workflow: serde_json::Value,
) -> AppResult<Asset> {
    let ctx = DispatchContext::from_state(&state);
    generation_dispatch::dispatch_remove_background(&ctx, &generation_id, item_index, workflow)
        .await
}
