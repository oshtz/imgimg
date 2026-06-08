use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;

use crate::error::AppResult;

const SETTINGS_KEY: &str = "workflow_settings";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WorkflowSettings {
    #[serde(default)]
    enabled_by_game_id: HashMap<String, Vec<String>>,
}

pub async fn get_enabled_for_game(
    pool: &SqlitePool,
    game_id: &str,
) -> AppResult<Option<Vec<String>>> {
    let settings = load(pool).await?;
    Ok(settings.enabled_by_game_id.get(game_id).cloned())
}

pub async fn set_enabled_for_game(
    pool: &SqlitePool,
    game_id: &str,
    enabled: Option<Vec<String>>,
) -> AppResult<()> {
    let mut settings = load(pool).await?;
    match enabled {
        Some(list) => {
            let mut deduped: Vec<String> = list
                .into_iter()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            deduped.sort();
            deduped.dedup();
            settings
                .enabled_by_game_id
                .insert(game_id.to_string(), deduped);
        }
        None => {
            settings.enabled_by_game_id.remove(game_id);
        }
    }
    save(pool, &settings).await
}

async fn load(pool: &SqlitePool) -> AppResult<WorkflowSettings> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM app_settings WHERE key = ?")
            .bind(SETTINGS_KEY)
            .fetch_optional(pool)
            .await?;
    match row {
        Some((json,)) => Ok(serde_json::from_str(&json).unwrap_or_else(|e| {
            log::warn!(
                "workflow_settings: failed to parse stored JSON ({} bytes), resetting to default: {e}",
                json.len()
            );
            WorkflowSettings::default()
        })),
        None => Ok(WorkflowSettings::default()),
    }
}

async fn save(pool: &SqlitePool, settings: &WorkflowSettings) -> AppResult<()> {
    let json = serde_json::to_string(settings)?;
    sqlx::query(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(SETTINGS_KEY)
    .bind(&json)
    .execute(pool)
    .await?;
    Ok(())
}
