use sqlx::SqlitePool;

use crate::db::models::CanvasState;
use crate::error::AppResult;

pub async fn get_by_game_id(pool: &SqlitePool, game_id: &str) -> AppResult<Option<CanvasState>> {
    let row: Option<(String, String, String, Option<String>, i64, String, String, Option<String>, Option<String>, String, Option<String>)> =
        sqlx::query_as(
            "SELECT game_id, nodes, chat_messages, chat_workflow_id, next_z_index, COALESCE(pinned_model_ids, '[]'), COALESCE(pinned_workflow_ids, '[]'), selected_provider_model_id, active_engine, updated_at, updated_by_email
             FROM canvas_states WHERE game_id = ?",
        )
        .bind(game_id)
        .fetch_optional(pool)
        .await?;

    match row {
        Some((
            gid,
            nodes,
            chat_messages,
            chat_workflow_id,
            next_z_index,
            pinned_model_ids,
            pinned_workflow_ids,
            selected_provider_model_id,
            active_engine,
            updated_at,
            updated_by_email,
        )) => Ok(Some(CanvasState {
            game_id: gid,
            nodes: serde_json::from_str(&nodes).unwrap_or(serde_json::Value::Array(vec![])),
            chat_messages: serde_json::from_str(&chat_messages)
                .unwrap_or(serde_json::Value::Array(vec![])),
            chat_workflow_id,
            next_z_index,
            pinned_model_ids: serde_json::from_str(&pinned_model_ids)
                .unwrap_or(serde_json::Value::Array(vec![])),
            pinned_workflow_ids: serde_json::from_str(&pinned_workflow_ids)
                .unwrap_or(serde_json::Value::Array(vec![])),
            selected_provider_model_id,
            active_engine,
            updated_at,
            updated_by_email,
        })),
        None => Ok(None),
    }
}

pub async fn upsert(
    pool: &SqlitePool,
    game_id: &str,
    nodes: &serde_json::Value,
    chat_messages: &serde_json::Value,
    chat_workflow_id: Option<&str>,
    next_z_index: i64,
    pinned_model_ids: Option<&serde_json::Value>,
    pinned_workflow_ids: Option<&serde_json::Value>,
    selected_provider_model_id: Option<&str>,
    active_engine: Option<&str>,
    user_id: &str,
    user_email: &str,
) -> AppResult<()> {
    let nodes_json = serde_json::to_string(nodes)?;
    let chat_json = serde_json::to_string(chat_messages)?;
    let pinned_json = pinned_model_ids
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()))
        .unwrap_or_else(|| "[]".to_string());
    let pinned_wf_json = pinned_workflow_ids
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()))
        .unwrap_or_else(|| "[]".to_string());

    sqlx::query(
        "INSERT INTO canvas_states (game_id, nodes, chat_messages, chat_workflow_id, next_z_index, pinned_model_ids, pinned_workflow_ids, selected_provider_model_id, active_engine, updated_at, updated_by_user_id, updated_by_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?)
         ON CONFLICT (game_id) DO UPDATE SET
           nodes = excluded.nodes,
           chat_messages = excluded.chat_messages,
           chat_workflow_id = excluded.chat_workflow_id,
           next_z_index = excluded.next_z_index,
           pinned_model_ids = excluded.pinned_model_ids,
           pinned_workflow_ids = excluded.pinned_workflow_ids,
           selected_provider_model_id = excluded.selected_provider_model_id,
           active_engine = excluded.active_engine,
           updated_at = excluded.updated_at,
           updated_by_user_id = excluded.updated_by_user_id,
           updated_by_email = excluded.updated_by_email",
    )
    .bind(game_id)
    .bind(&nodes_json)
    .bind(&chat_json)
    .bind(chat_workflow_id)
    .bind(next_z_index)
    .bind(&pinned_json)
    .bind(&pinned_wf_json)
    .bind(selected_provider_model_id)
    .bind(active_engine)
    .bind(user_id)
    .bind(user_email)
    .execute(pool)
    .await?;
    Ok(())
}
