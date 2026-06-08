use tauri::State;

use crate::db::models::AssetTypeRecord;
use crate::error::AppResult;
use crate::state::AppState;
use crate::stores::asset_type_store;

#[tauri::command]
pub async fn list_asset_types(state: State<'_, AppState>) -> AppResult<Vec<AssetTypeRecord>> {
    asset_type_store::list_all(&state.db).await
}

#[tauri::command]
pub async fn get_asset_type(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<AssetTypeRecord>> {
    asset_type_store::get_by_id(&state.db, &id).await
}

#[tauri::command]
pub async fn create_asset_type(
    state: State<'_, AppState>,
    record: AssetTypeRecord,
) -> AppResult<AssetTypeRecord> {
    asset_type_store::create(&state.db, &record).await
}

#[tauri::command]
pub async fn update_asset_type(
    state: State<'_, AppState>,
    id: String,
    record: AssetTypeRecord,
) -> AppResult<AssetTypeRecord> {
    asset_type_store::update(&state.db, &id, &record).await
}

#[tauri::command]
pub async fn delete_asset_type(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<bool> {
    asset_type_store::delete(&state.db, &id).await
}

#[tauri::command]
pub async fn get_asset_type_count(
    state: State<'_, AppState>,
    type_id: String,
) -> AppResult<i64> {
    asset_type_store::get_asset_count(&state.db, &type_id).await
}
