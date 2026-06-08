use sqlx::SqlitePool;

use crate::db::models::{ChatThread, ChatThreadSummary};
use crate::error::AppResult;

/// List thread summaries for a canvas (most recently updated first).
pub async fn list_for_canvas(
    pool: &SqlitePool,
    canvas_id: &str,
) -> AppResult<Vec<ChatThreadSummary>> {
    let rows: Vec<(String, String, String, String, String)> = sqlx::query_as(
        "SELECT id, canvas_id, title, created_at, updated_at
         FROM chat_threads WHERE canvas_id = ? ORDER BY updated_at DESC",
    )
    .bind(canvas_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, canvas_id, title, created_at, updated_at)| ChatThreadSummary {
            id,
            canvas_id,
            title,
            created_at,
            updated_at,
        })
        .collect())
}

/// Get a single thread with full messages.
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<Option<ChatThread>> {
    let row: Option<(String, String, String, String, String, String)> = sqlx::query_as(
        "SELECT id, canvas_id, title, messages, created_at, updated_at
         FROM chat_threads WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    match row {
        Some((id, canvas_id, title, messages, created_at, updated_at)) => Ok(Some(ChatThread {
            id,
            canvas_id,
            title,
            messages: serde_json::from_str(&messages)
                .unwrap_or(serde_json::Value::Array(vec![])),
            created_at,
            updated_at,
        })),
        None => Ok(None),
    }
}

/// Create or update a thread.
pub async fn upsert(
    pool: &SqlitePool,
    id: &str,
    canvas_id: &str,
    title: &str,
    messages: &serde_json::Value,
) -> AppResult<()> {
    let messages_json = serde_json::to_string(messages)?;
    sqlx::query(
        "INSERT INTO chat_threads (id, canvas_id, title, messages, created_at, updated_at)
         VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (id) DO UPDATE SET
           title = excluded.title,
           messages = excluded.messages,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
    )
    .bind(id)
    .bind(canvas_id)
    .bind(title)
    .bind(&messages_json)
    .execute(pool)
    .await?;
    Ok(())
}

/// Delete a thread.
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM chat_threads WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
