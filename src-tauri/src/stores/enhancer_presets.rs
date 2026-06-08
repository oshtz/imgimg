use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhancerPreset {
    pub id: String,
    pub name: String,
    pub system_prompt: String,
    pub is_default: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn list_presets(pool: &SqlitePool) -> AppResult<Vec<EnhancerPreset>> {
    let rows: Vec<(String, String, String, bool, i64, String, String)> = sqlx::query_as(
        "SELECT id, name, system_prompt, is_default, sort_order, created_at, updated_at
         FROM enhancer_presets ORDER BY sort_order ASC, created_at ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, name, system_prompt, is_default, sort_order, created_at, updated_at)| {
            EnhancerPreset {
                id,
                name,
                system_prompt,
                is_default,
                sort_order,
                created_at,
                updated_at,
            }
        })
        .collect())
}

pub async fn get_preset(pool: &SqlitePool, id: &str) -> AppResult<Option<EnhancerPreset>> {
    let row: Option<(String, String, String, bool, i64, String, String)> = sqlx::query_as(
        "SELECT id, name, system_prompt, is_default, sort_order, created_at, updated_at
         FROM enhancer_presets WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(id, name, system_prompt, is_default, sort_order, created_at, updated_at)| EnhancerPreset {
            id,
            name,
            system_prompt,
            is_default,
            sort_order,
            created_at,
            updated_at,
        },
    ))
}

pub async fn get_active_preset(pool: &SqlitePool) -> AppResult<Option<EnhancerPreset>> {
    let row: Option<(String, String, String, bool, i64, String, String)> = sqlx::query_as(
        "SELECT id, name, system_prompt, is_default, sort_order, created_at, updated_at
         FROM enhancer_presets WHERE is_default = 1 LIMIT 1",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .next();

    Ok(row.map(
        |(id, name, system_prompt, is_default, sort_order, created_at, updated_at)| EnhancerPreset {
            id,
            name,
            system_prompt,
            is_default,
            sort_order,
            created_at,
            updated_at,
        },
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertEnhancerPreset {
    pub id: Option<String>,
    pub name: String,
    pub system_prompt: String,
    pub sort_order: Option<i64>,
}

pub async fn upsert_preset(
    pool: &SqlitePool,
    input: UpsertEnhancerPreset,
) -> AppResult<EnhancerPreset> {
    let id = input
        .id
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let sort_order = input.sort_order.unwrap_or(0);

    sqlx::query(
        "INSERT INTO enhancer_presets (id, name, system_prompt, sort_order, updated_at)
         VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name,
           system_prompt = excluded.system_prompt,
           sort_order = excluded.sort_order,
           updated_at = excluded.updated_at",
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.system_prompt)
    .bind(sort_order)
    .execute(pool)
    .await?;

    get_preset(pool, &id)
        .await?
        .ok_or_else(|| crate::error::AppError::NotFound("Enhancer preset not found".into()))
}

pub async fn delete_preset(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM enhancer_presets WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_active_preset(pool: &SqlitePool, id: &str) -> AppResult<()> {
    // Clear all defaults, then set the target
    sqlx::query("UPDATE enhancer_presets SET is_default = 0 WHERE is_default = 1")
        .execute(pool)
        .await?;
    sqlx::query(
        "UPDATE enhancer_presets SET is_default = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}
