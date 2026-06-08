use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPrompt {
    pub id: String,
    pub name: String,
    pub text: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn list_prompts(pool: &SqlitePool) -> AppResult<Vec<SavedPrompt>> {
    let rows: Vec<(String, String, String, i64, String, String)> = sqlx::query_as(
        "SELECT id, name, text, sort_order, created_at, updated_at
         FROM saved_prompts ORDER BY sort_order ASC, created_at DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, name, text, sort_order, created_at, updated_at)| SavedPrompt {
            id,
            name,
            text,
            sort_order,
            created_at,
            updated_at,
        })
        .collect())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSavedPrompt {
    pub id: Option<String>,
    pub name: String,
    pub text: String,
    pub sort_order: Option<i64>,
}

pub async fn upsert_prompt(
    pool: &SqlitePool,
    input: UpsertSavedPrompt,
) -> AppResult<SavedPrompt> {
    let id = input
        .id
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let sort_order = input.sort_order.unwrap_or(0);

    sqlx::query(
        "INSERT INTO saved_prompts (id, name, text, sort_order, updated_at)
         VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name,
           text = excluded.text,
           sort_order = excluded.sort_order,
           updated_at = excluded.updated_at",
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.text)
    .bind(sort_order)
    .execute(pool)
    .await?;

    let row: Option<(String, String, String, i64, String, String)> = sqlx::query_as(
        "SELECT id, name, text, sort_order, created_at, updated_at
         FROM saved_prompts WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(pool)
    .await?;

    row.map(|(id, name, text, sort_order, created_at, updated_at)| SavedPrompt {
        id,
        name,
        text,
        sort_order,
        created_at,
        updated_at,
    })
    .ok_or_else(|| crate::error::AppError::NotFound("Saved prompt not found".into()))
}

pub async fn delete_prompt(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM saved_prompts WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
