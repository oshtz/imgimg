use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::stores::generation_store;
use crate::utils::cursor;
use crate::db::models::Generation;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryParams {
    pub workflow_id: Option<String>,
    pub model_id: Option<String>,
    pub query: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub cursor: Option<String>, // base64-encoded cursor string
}

fn default_limit() -> i64 {
    20
}

/// Gallery result with cursor as a string (base64-encoded) to match HTTP API.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryResult {
    pub items: Vec<Generation>,
    pub next_cursor: Option<String>,
}

#[tauri::command]
pub async fn list_gallery(
    state: State<'_, AppState>,
    params: GalleryParams,
) -> AppResult<GalleryResult> {
    let decoded_cursor = params
        .cursor
        .as_deref()
        .and_then(cursor::decode_cursor);

    let result = generation_store::list_gallery_simple(
        &state.db,
        params.workflow_id.as_deref(),
        params.model_id.as_deref(),
        params.query.as_deref(),
        params.limit,
        decoded_cursor.as_ref(),
    )
    .await?;

    // Encode cursor as base64 string so frontend can pass it back as-is
    let encoded_cursor = result.next_cursor.as_ref().map(cursor::encode_cursor);

    Ok(GalleryResult {
        items: result.items,
        next_cursor: encoded_cursor,
    })
}

#[tauri::command]
pub async fn list_gallery_users(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    generation_store::list_gallery_users(&state.db).await
}
