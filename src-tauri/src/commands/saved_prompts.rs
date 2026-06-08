use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::stores::saved_prompts::{self, SavedPrompt, UpsertSavedPrompt};

#[tauri::command]
pub async fn list_saved_prompts(state: State<'_, AppState>) -> AppResult<Vec<SavedPrompt>> {
    saved_prompts::list_prompts(&state.db).await
}

#[tauri::command]
pub async fn upsert_saved_prompt(
    state: State<'_, AppState>,
    prompt: UpsertSavedPrompt,
) -> AppResult<SavedPrompt> {
    saved_prompts::upsert_prompt(&state.db, prompt).await
}

#[tauri::command]
pub async fn delete_saved_prompt(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    saved_prompts::delete_prompt(&state.db, &id).await
}
