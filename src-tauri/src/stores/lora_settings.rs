use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;

use crate::error::AppResult;

const SETTINGS_KEY: &str = "loras";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoraSettings {
    #[serde(default)]
    pub enabled_by_game_id: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub display_names_by_game_id: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    pub preview_urls_by_game_id: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    pub prompt_prefixes_by_game_id: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    pub workflow_overrides_by_game_id: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    pub keyword_replacements_by_game_id: HashMap<String, HashMap<String, HashMap<String, String>>>,
}

pub async fn get_settings(pool: &SqlitePool) -> AppResult<LoraSettings> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM app_settings WHERE key = ?")
            .bind(SETTINGS_KEY)
            .fetch_optional(pool)
            .await?;
    match row {
        Some((json,)) => Ok(serde_json::from_str(&json).unwrap_or_else(|e| {
            log::warn!(
                "lora_settings: failed to parse stored JSON ({} bytes), resetting to default: {e}",
                json.len()
            );
            LoraSettings::default()
        })),
        None => Ok(LoraSettings::default()),
    }
}

pub async fn save_settings(pool: &SqlitePool, settings: &LoraSettings) -> AppResult<()> {
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

pub async fn get_enabled_for_game(
    pool: &SqlitePool,
    game_id: &str,
) -> AppResult<Option<Vec<String>>> {
    let s = get_settings(pool).await?;
    Ok(s.enabled_by_game_id.get(game_id).cloned())
}

pub async fn set_enabled_for_game(
    pool: &SqlitePool,
    game_id: &str,
    enabled: Option<Vec<String>>,
) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    match enabled {
        Some(list) => {
            let mut deduped: Vec<String> = list
                .into_iter()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .collect();
            deduped.sort();
            deduped.dedup();
            s.enabled_by_game_id.insert(game_id.to_string(), deduped);
        }
        None => {
            s.enabled_by_game_id.remove(game_id);
        }
    }
    save_settings(pool, &s).await
}

pub async fn get_display_names_for_game(
    pool: &SqlitePool,
    game_id: &str,
) -> AppResult<HashMap<String, String>> {
    let s = get_settings(pool).await?;
    Ok(s.display_names_by_game_id
        .get(game_id)
        .cloned()
        .unwrap_or_default())
}

pub async fn set_display_names_for_game(
    pool: &SqlitePool,
    game_id: &str,
    names: Option<HashMap<String, String>>,
) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    match names {
        Some(m) if !m.is_empty() => {
            s.display_names_by_game_id
                .insert(game_id.to_string(), m);
        }
        _ => {
            s.display_names_by_game_id.remove(game_id);
        }
    }
    save_settings(pool, &s).await
}

pub async fn get_preview_urls_for_game(
    pool: &SqlitePool,
    game_id: &str,
) -> AppResult<HashMap<String, String>> {
    let s = get_settings(pool).await?;
    Ok(s.preview_urls_by_game_id
        .get(game_id)
        .cloned()
        .unwrap_or_default())
}

pub async fn set_preview_urls_for_game(
    pool: &SqlitePool,
    game_id: &str,
    urls: Option<HashMap<String, String>>,
) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    match urls {
        Some(m) if !m.is_empty() => {
            s.preview_urls_by_game_id.insert(game_id.to_string(), m);
        }
        _ => {
            s.preview_urls_by_game_id.remove(game_id);
        }
    }
    save_settings(pool, &s).await
}

pub async fn get_prompt_prefixes_for_game(
    pool: &SqlitePool,
    game_id: &str,
) -> AppResult<HashMap<String, String>> {
    let s = get_settings(pool).await?;
    Ok(s.prompt_prefixes_by_game_id
        .get(game_id)
        .cloned()
        .unwrap_or_default())
}

pub async fn set_prompt_prefixes_for_game(
    pool: &SqlitePool,
    game_id: &str,
    prefixes: Option<HashMap<String, String>>,
) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    match prefixes {
        Some(m) if !m.is_empty() => {
            s.prompt_prefixes_by_game_id
                .insert(game_id.to_string(), m);
        }
        _ => {
            s.prompt_prefixes_by_game_id.remove(game_id);
        }
    }
    save_settings(pool, &s).await
}

pub async fn get_prompt_prefix_for_model(
    pool: &SqlitePool,
    game_id: &str,
    model_id: &str,
) -> AppResult<Option<String>> {
    let prefixes = get_prompt_prefixes_for_game(pool, game_id).await?;
    Ok(prefixes
        .get(model_id)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty()))
}

pub async fn get_workflow_overrides_for_game(
    pool: &SqlitePool,
    game_id: &str,
) -> AppResult<HashMap<String, String>> {
    let s = get_settings(pool).await?;
    Ok(s.workflow_overrides_by_game_id
        .get(game_id)
        .cloned()
        .unwrap_or_default())
}

pub async fn set_workflow_overrides_for_game(
    pool: &SqlitePool,
    game_id: &str,
    overrides: Option<HashMap<String, String>>,
) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    match overrides {
        Some(m) if !m.is_empty() => {
            s.workflow_overrides_by_game_id
                .insert(game_id.to_string(), m);
        }
        _ => {
            s.workflow_overrides_by_game_id.remove(game_id);
        }
    }
    save_settings(pool, &s).await
}

pub async fn get_workflow_override_for_model(
    pool: &SqlitePool,
    game_id: &str,
    model_id: &str,
) -> AppResult<Option<String>> {
    let overrides = get_workflow_overrides_for_game(pool, game_id).await?;
    Ok(overrides
        .get(model_id)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty()))
}

pub async fn get_keyword_replacements_for_game(
    pool: &SqlitePool,
    game_id: &str,
) -> AppResult<HashMap<String, HashMap<String, String>>> {
    let s = get_settings(pool).await?;
    Ok(s.keyword_replacements_by_game_id
        .get(game_id)
        .cloned()
        .unwrap_or_default())
}

pub async fn set_keyword_replacements_for_game(
    pool: &SqlitePool,
    game_id: &str,
    replacements: Option<HashMap<String, HashMap<String, String>>>,
) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    match replacements {
        Some(m) if !m.is_empty() => {
            s.keyword_replacements_by_game_id
                .insert(game_id.to_string(), m);
        }
        _ => {
            s.keyword_replacements_by_game_id.remove(game_id);
        }
    }
    save_settings(pool, &s).await
}

pub async fn get_keyword_replacements_for_model(
    pool: &SqlitePool,
    game_id: &str,
    model_id: &str,
) -> AppResult<Option<HashMap<String, String>>> {
    let replacements = get_keyword_replacements_for_game(pool, game_id).await?;
    Ok(replacements.get(model_id).cloned().filter(|m| !m.is_empty()))
}
