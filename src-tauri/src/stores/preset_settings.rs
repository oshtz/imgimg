use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;

use crate::db::models::Preset;
use crate::error::AppResult;

const SETTINGS_KEY: &str = "preset_settings";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PresetSettings {
    #[serde(default)]
    presets_by_game_id: HashMap<String, Vec<Preset>>,
}

pub async fn get_presets_for_game(pool: &SqlitePool, game_id: &str) -> AppResult<Vec<Preset>> {
    let s = load(pool).await?;
    Ok(s.presets_by_game_id
        .get(game_id)
        .cloned()
        .unwrap_or_default())
}

pub async fn get_presets_for_games(
    pool: &SqlitePool,
    game_ids: &[String],
) -> AppResult<Vec<Preset>> {
    let s = load(pool).await?;
    let mut result = Vec::new();
    for gid in game_ids {
        if let Some(presets) = s.presets_by_game_id.get(gid) {
            result.extend(presets.iter().cloned());
        }
    }
    Ok(result)
}

pub async fn get_all_presets(pool: &SqlitePool) -> AppResult<HashMap<String, Vec<Preset>>> {
    let s = load(pool).await?;
    Ok(s.presets_by_game_id)
}

pub async fn set_presets_for_game(
    pool: &SqlitePool,
    game_id: &str,
    presets: Vec<Preset>,
) -> AppResult<()> {
    let mut s = load(pool).await?;
    if presets.is_empty() {
        s.presets_by_game_id.remove(game_id);
    } else {
        s.presets_by_game_id.insert(game_id.to_string(), presets);
    }
    save(pool, &s).await
}

pub async fn get_preset_by_id(
    pool: &SqlitePool,
    game_id: &str,
    preset_id: &str,
) -> AppResult<Option<Preset>> {
    let presets = get_presets_for_game(pool, game_id).await?;
    Ok(presets.into_iter().find(|p| p.id == preset_id))
}

pub async fn upsert_preset(pool: &SqlitePool, game_id: &str, preset: Preset) -> AppResult<()> {
    let mut s = load(pool).await?;
    let presets = s.presets_by_game_id.entry(game_id.to_string()).or_default();
    if let Some(pos) = presets.iter().position(|p| p.id == preset.id) {
        presets[pos] = preset;
    } else {
        presets.push(preset);
    }
    save(pool, &s).await
}

pub async fn delete_preset(pool: &SqlitePool, game_id: &str, preset_id: &str) -> AppResult<bool> {
    let mut s = load(pool).await?;
    let presets = s.presets_by_game_id.entry(game_id.to_string()).or_default();
    let len_before = presets.len();
    presets.retain(|p| p.id != preset_id);
    let removed = presets.len() < len_before;
    if presets.is_empty() {
        s.presets_by_game_id.remove(game_id);
    }
    save(pool, &s).await?;
    Ok(removed)
}

async fn load(pool: &SqlitePool) -> AppResult<PresetSettings> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM app_settings WHERE key = ?")
        .bind(SETTINGS_KEY)
        .fetch_optional(pool)
        .await?;
    match row {
        Some((json,)) => Ok(serde_json::from_str(&json).unwrap_or_else(|e| {
            log::warn!(
                "preset_settings: failed to parse stored JSON ({} bytes), resetting to default: {e}",
                json.len()
            );
            PresetSettings::default()
        })),
        None => Ok(PresetSettings::default()),
    }
}

async fn save(pool: &SqlitePool, settings: &PresetSettings) -> AppResult<()> {
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
