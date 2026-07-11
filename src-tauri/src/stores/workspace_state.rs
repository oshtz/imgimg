use sqlx::SqlitePool;

use crate::error::AppResult;

pub async fn get(pool: &SqlitePool, key: &str) -> AppResult<Option<serde_json::Value>> {
    let value: Option<(String,)> =
        sqlx::query_as("SELECT value FROM workspace_state WHERE key = ?")
            .bind(key)
            .fetch_optional(pool)
            .await?;
    value
        .map(|(json,)| serde_json::from_str(&json))
        .transpose()
        .map_err(Into::into)
}

pub async fn save(pool: &SqlitePool, key: &str, value: &serde_json::Value) -> AppResult<()> {
    let json = serde_json::to_string(value)?;
    sqlx::query(
        "INSERT INTO workspace_state (key, value, updated_at)
         VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key)
    .bind(json)
    .execute(pool)
    .await?;
    Ok(())
}
