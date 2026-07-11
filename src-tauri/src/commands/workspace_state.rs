use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::stores::workspace_state;

fn validate_key(key: &str) -> AppResult<()> {
    if matches!(key, "iterate_threads" | "audio_metadata") {
        Ok(())
    } else {
        Err(AppError::BadRequest("Unknown workspace state key".into()))
    }
}

#[tauri::command]
pub async fn get_workspace_state(
    state: State<'_, AppState>,
    key: String,
) -> AppResult<Option<serde_json::Value>> {
    validate_key(&key)?;
    workspace_state::get(&state.db, &key).await
}

#[tauri::command]
pub async fn save_workspace_state(
    state: State<'_, AppState>,
    key: String,
    value: serde_json::Value,
) -> AppResult<()> {
    validate_key(&key)?;
    workspace_state::save(&state.db, &key, &value).await
}
