use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::stores::enhancer_presets::{self, EnhancerPreset, UpsertEnhancerPreset};

#[tauri::command]
pub async fn list_enhancer_presets(state: State<'_, AppState>) -> AppResult<Vec<EnhancerPreset>> {
    enhancer_presets::list_presets(&state.db).await
}

#[tauri::command]
pub async fn get_enhancer_preset(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<EnhancerPreset>> {
    enhancer_presets::get_preset(&state.db, &id).await
}

#[tauri::command]
pub async fn upsert_enhancer_preset(
    state: State<'_, AppState>,
    preset: UpsertEnhancerPreset,
) -> AppResult<EnhancerPreset> {
    enhancer_presets::upsert_preset(&state.db, preset).await
}

#[tauri::command]
pub async fn delete_enhancer_preset(state: State<'_, AppState>, id: String) -> AppResult<()> {
    enhancer_presets::delete_preset(&state.db, &id).await
}

#[tauri::command]
pub async fn set_active_enhancer_preset(state: State<'_, AppState>, id: String) -> AppResult<()> {
    enhancer_presets::set_active_preset(&state.db, &id).await
}
