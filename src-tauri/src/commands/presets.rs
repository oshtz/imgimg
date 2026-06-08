use std::collections::HashMap;
use tauri::State;

use crate::db::models::Preset;
use crate::error::AppResult;
use crate::state::AppState;
use crate::stores::preset_settings;

const DEFAULT_GAME: &str = "default";

#[tauri::command]
pub async fn get_presets(state: State<'_, AppState>) -> AppResult<Vec<Preset>> {
    preset_settings::get_presets_for_game(&state.db, DEFAULT_GAME).await
}

#[tauri::command]
pub async fn get_all_presets(
    state: State<'_, AppState>,
) -> AppResult<HashMap<String, Vec<Preset>>> {
    preset_settings::get_all_presets(&state.db).await
}

#[tauri::command]
pub async fn set_presets(
    state: State<'_, AppState>,
    game_id: Option<String>,
    presets: Vec<Preset>,
) -> AppResult<()> {
    let gid = game_id.as_deref().unwrap_or(DEFAULT_GAME);
    preset_settings::set_presets_for_game(&state.db, gid, presets).await
}

#[tauri::command]
pub async fn upsert_preset(
    state: State<'_, AppState>,
    game_id: Option<String>,
    preset: Preset,
) -> AppResult<()> {
    let gid = game_id.as_deref().unwrap_or(DEFAULT_GAME);
    preset_settings::upsert_preset(&state.db, gid, preset).await
}

#[tauri::command]
pub async fn delete_preset(
    state: State<'_, AppState>,
    game_id: Option<String>,
    preset_id: String,
) -> AppResult<bool> {
    let gid = game_id.as_deref().unwrap_or(DEFAULT_GAME);
    preset_settings::delete_preset(&state.db, gid, &preset_id).await
}
