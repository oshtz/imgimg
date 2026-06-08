use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::AppResult;

const SETTINGS_KEY: &str = "admin";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AdminSettings {
    #[serde(default)]
    pub openrouter_api_key: Option<String>,
    #[serde(default)]
    pub replicate_api_key: Option<String>,
    #[serde(default)]
    pub fal_api_key: Option<String>,
    #[serde(default)]
    pub kie_api_key: Option<String>,
    #[serde(default)]
    pub admin_emails: Option<Vec<String>>,
    #[serde(default)]
    pub allowed_email_domains: Option<Vec<String>>,
    #[serde(default)]
    pub comfy_base_urls: Option<Vec<String>>,
    #[serde(default)]
    pub canvas_agent_model: Option<String>,
    #[serde(default)]
    pub canvas_agent_system_prompt: Option<String>,
    #[serde(default)]
    pub canvas_agent_temperature: Option<f64>,
    #[serde(default)]
    pub prompt_enhancer_model: Option<String>,
    #[serde(default)]
    pub prompt_enhancer_system_prompt: Option<String>,
    #[serde(default)]
    pub inpaint_workflow_id: Option<String>,
    #[serde(default)]
    pub outpaint_workflow_id: Option<String>,
    #[serde(default)]
    pub rembg_workflow_id: Option<String>,
}

pub async fn get_settings(pool: &SqlitePool) -> AppResult<AdminSettings> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM app_settings WHERE key = ?")
            .bind(SETTINGS_KEY)
            .fetch_optional(pool)
            .await?;

    match row {
        Some((json,)) => Ok(serde_json::from_str(&json).unwrap_or_else(|e| {
            log::warn!(
                "admin_settings: failed to parse stored JSON ({} bytes), resetting to default: {e}",
                json.len()
            );
            AdminSettings::default()
        })),
        None => Ok(AdminSettings::default()),
    }
}

pub async fn save_settings(pool: &SqlitePool, settings: &AdminSettings) -> AppResult<()> {
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

pub async fn get_openrouter_api_key(pool: &SqlitePool) -> AppResult<Option<String>> {
    let s = get_settings(pool).await?;
    Ok(normalize_key(s.openrouter_api_key))
}

pub async fn set_openrouter_api_key(pool: &SqlitePool, value: Option<String>) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    s.openrouter_api_key = normalize_key(value);
    save_settings(pool, &s).await
}

pub async fn get_replicate_api_key(pool: &SqlitePool) -> AppResult<Option<String>> {
    let s = get_settings(pool).await?;
    Ok(normalize_key(s.replicate_api_key))
}

pub async fn set_replicate_api_key(pool: &SqlitePool, value: Option<String>) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    s.replicate_api_key = normalize_key(value);
    save_settings(pool, &s).await
}

pub async fn get_fal_api_key(pool: &SqlitePool) -> AppResult<Option<String>> {
    let s = get_settings(pool).await?;
    Ok(normalize_key(s.fal_api_key))
}

pub async fn set_fal_api_key(pool: &SqlitePool, value: Option<String>) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    s.fal_api_key = normalize_key(value);
    save_settings(pool, &s).await
}

pub async fn get_kie_api_key(pool: &SqlitePool) -> AppResult<Option<String>> {
    let s = get_settings(pool).await?;
    Ok(normalize_key(s.kie_api_key))
}

pub async fn set_kie_api_key(pool: &SqlitePool, value: Option<String>) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    s.kie_api_key = normalize_key(value);
    save_settings(pool, &s).await
}

pub async fn get_comfy_base_urls(pool: &SqlitePool) -> AppResult<Option<Vec<String>>> {
    let s = get_settings(pool).await?;
    Ok(s.comfy_base_urls)
}

pub async fn set_comfy_base_urls(pool: &SqlitePool, value: Option<Vec<String>>) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    s.comfy_base_urls = value;
    save_settings(pool, &s).await
}

pub async fn get_canvas_agent_model(pool: &SqlitePool) -> AppResult<Option<String>> {
    let s = get_settings(pool).await?;
    Ok(normalize_key(s.canvas_agent_model))
}

pub async fn set_canvas_agent_model(pool: &SqlitePool, value: Option<String>) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    s.canvas_agent_model = normalize_key(value);
    save_settings(pool, &s).await
}

pub async fn get_canvas_agent_system_prompt(pool: &SqlitePool) -> AppResult<Option<String>> {
    let s = get_settings(pool).await?;
    Ok(s.canvas_agent_system_prompt)
}

pub async fn set_canvas_agent_system_prompt(
    pool: &SqlitePool,
    value: Option<String>,
) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    s.canvas_agent_system_prompt = value.filter(|v| !v.trim().is_empty());
    save_settings(pool, &s).await
}

pub async fn get_canvas_agent_temperature(pool: &SqlitePool) -> AppResult<Option<f64>> {
    let s = get_settings(pool).await?;
    Ok(s.canvas_agent_temperature)
}

pub async fn set_canvas_agent_temperature(
    pool: &SqlitePool,
    value: Option<f64>,
) -> AppResult<()> {
    let mut s = get_settings(pool).await?;
    s.canvas_agent_temperature = value;
    save_settings(pool, &s).await
}

pub async fn get_prompt_enhancer_model(pool: &SqlitePool) -> AppResult<Option<String>> {
    let s = get_settings(pool).await?;
    Ok(normalize_key(s.prompt_enhancer_model))
}

pub async fn get_prompt_enhancer_system_prompt(pool: &SqlitePool) -> AppResult<Option<String>> {
    let s = get_settings(pool).await?;
    Ok(s.prompt_enhancer_system_prompt)
}

fn normalize_key(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}
