use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::config::AppConfig;
use crate::error::{AppError, AppResult};

const SETTINGS_KEY: &str = "admin";
const KEYRING_SERVICE: &str = "com.imgimg.desktop";
const OPENROUTER: &str = "openrouter";
const REPLICATE: &str = "replicate";
const FAL: &str = "fal";
const KIE: &str = "kie";
static KEYRING_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AdminSettings {
    #[serde(default, rename = "openrouterApiKey", skip_serializing)]
    legacy_openrouter_api_key: Option<String>,
    #[serde(default, rename = "replicateApiKey", skip_serializing)]
    legacy_replicate_api_key: Option<String>,
    #[serde(default, rename = "falApiKey", skip_serializing)]
    legacy_fal_api_key: Option<String>,
    #[serde(default, rename = "kieApiKey", skip_serializing)]
    legacy_kie_api_key: Option<String>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialSummary {
    pub present: bool,
    pub hint: Option<String>,
}

pub async fn get_settings(pool: &SqlitePool) -> AppResult<AdminSettings> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM app_settings WHERE key = ?")
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

pub async fn migrate_legacy_secrets(pool: &SqlitePool, config: &mut AppConfig) -> AppResult<bool> {
    let mut settings = get_settings(pool).await?;
    let config_had_secrets = config.replicate_api_token.is_some()
        || config.fal_api_key.is_some()
        || config.kie_api_key.is_some();
    let db_had_secrets = [
        settings.legacy_openrouter_api_key.as_ref(),
        settings.legacy_replicate_api_key.as_ref(),
        settings.legacy_fal_api_key.as_ref(),
        settings.legacy_kie_api_key.as_ref(),
    ]
    .iter()
    .any(|value| value.is_some());

    migrate_secret(OPENROUTER, settings.legacy_openrouter_api_key.take()).await?;
    migrate_secret(
        REPLICATE,
        normalize_key(settings.legacy_replicate_api_key.take())
            .or_else(|| normalize_key(config.replicate_api_token.take())),
    )
    .await?;
    migrate_secret(
        FAL,
        normalize_key(settings.legacy_fal_api_key.take())
            .or_else(|| normalize_key(config.fal_api_key.take())),
    )
    .await?;
    migrate_secret(
        KIE,
        normalize_key(settings.legacy_kie_api_key.take())
            .or_else(|| normalize_key(config.kie_api_key.take())),
    )
    .await?;

    if db_had_secrets {
        save_settings(pool, &settings).await?;
    }

    Ok(config_had_secrets)
}

async fn migrate_secret(account: &'static str, value: Option<String>) -> AppResult<()> {
    if get_provider_api_key(account).await?.is_none() {
        if let Some(value) = normalize_key(value) {
            set_provider_api_key(account, Some(value)).await?;
        }
    }
    Ok(())
}

pub async fn credential_summary(account: &'static str) -> AppResult<CredentialSummary> {
    let value = get_provider_api_key(account).await?;
    Ok(CredentialSummary {
        present: value.is_some(),
        hint: value.as_deref().map(secret_hint),
    })
}

pub async fn get_provider_api_key(account: &'static str) -> AppResult<Option<String>> {
    ensure_known_provider(account)?;
    let result = tokio::task::spawn_blocking(move || {
        let _guard = KEYRING_LOCK
            .lock()
            .map_err(|_| "credential store lock was poisoned".to_string())?;
        let entry = keyring::Entry::new(KEYRING_SERVICE, account).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(normalize_key(Some(value))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("Credential store task failed: {e}")))?;

    result.map_err(|e| AppError::Config(format!("Credential store read failed: {e}")))
}

pub async fn set_provider_api_key(account: &'static str, value: Option<String>) -> AppResult<()> {
    ensure_known_provider(account)?;
    let value = normalize_key(value);
    let result = tokio::task::spawn_blocking(move || {
        let _guard = KEYRING_LOCK
            .lock()
            .map_err(|_| "credential store lock was poisoned".to_string())?;
        let entry = keyring::Entry::new(KEYRING_SERVICE, account).map_err(|e| e.to_string())?;
        match value {
            Some(value) => entry.set_password(&value).map_err(|e| e.to_string()),
            None => match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(e) => Err(e.to_string()),
            },
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("Credential store task failed: {e}")))?;

    result.map_err(|e| AppError::Config(format!("Credential store write failed: {e}")))
}

fn ensure_known_provider(account: &str) -> AppResult<()> {
    match account {
        OPENROUTER | REPLICATE | FAL | KIE => Ok(()),
        _ => Err(AppError::BadRequest("Unknown provider".into())),
    }
}

fn secret_hint(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 8 {
        return "••••".into();
    }
    format!(
        "{}...{}",
        chars[..4].iter().collect::<String>(),
        chars[chars.len() - 4..].iter().collect::<String>()
    )
}

pub async fn get_openrouter_api_key(_pool: &SqlitePool) -> AppResult<Option<String>> {
    get_provider_api_key(OPENROUTER).await
}

pub async fn get_replicate_api_key(_pool: &SqlitePool) -> AppResult<Option<String>> {
    get_provider_api_key(REPLICATE).await
}

pub async fn get_fal_api_key(_pool: &SqlitePool) -> AppResult<Option<String>> {
    get_provider_api_key(FAL).await
}

pub async fn get_kie_api_key(_pool: &SqlitePool) -> AppResult<Option<String>> {
    get_provider_api_key(KIE).await
}

pub async fn get_comfy_base_urls(pool: &SqlitePool) -> AppResult<Option<Vec<String>>> {
    Ok(get_settings(pool).await?.comfy_base_urls)
}

pub async fn set_comfy_base_urls(pool: &SqlitePool, value: Option<Vec<String>>) -> AppResult<()> {
    let mut settings = get_settings(pool).await?;
    settings.comfy_base_urls = value;
    save_settings(pool, &settings).await
}

pub async fn get_canvas_agent_model(pool: &SqlitePool) -> AppResult<Option<String>> {
    Ok(normalize_key(get_settings(pool).await?.canvas_agent_model))
}

pub async fn set_canvas_agent_model(pool: &SqlitePool, value: Option<String>) -> AppResult<()> {
    let mut settings = get_settings(pool).await?;
    settings.canvas_agent_model = normalize_key(value);
    save_settings(pool, &settings).await
}

pub async fn get_canvas_agent_system_prompt(pool: &SqlitePool) -> AppResult<Option<String>> {
    Ok(get_settings(pool).await?.canvas_agent_system_prompt)
}

pub async fn set_canvas_agent_system_prompt(
    pool: &SqlitePool,
    value: Option<String>,
) -> AppResult<()> {
    let mut settings = get_settings(pool).await?;
    settings.canvas_agent_system_prompt = value.filter(|v| !v.trim().is_empty());
    save_settings(pool, &settings).await
}

pub async fn get_canvas_agent_temperature(pool: &SqlitePool) -> AppResult<Option<f64>> {
    Ok(get_settings(pool).await?.canvas_agent_temperature)
}

pub async fn set_canvas_agent_temperature(pool: &SqlitePool, value: Option<f64>) -> AppResult<()> {
    let mut settings = get_settings(pool).await?;
    settings.canvas_agent_temperature = value;
    save_settings(pool, &settings).await
}

pub async fn get_prompt_enhancer_model(pool: &SqlitePool) -> AppResult<Option<String>> {
    Ok(normalize_key(
        get_settings(pool).await?.prompt_enhancer_model,
    ))
}

pub async fn get_prompt_enhancer_system_prompt(pool: &SqlitePool) -> AppResult<Option<String>> {
    Ok(get_settings(pool).await?.prompt_enhancer_system_prompt)
}

fn normalize_key(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::{secret_hint, AdminSettings};

    #[test]
    fn serialized_settings_never_contain_legacy_secrets() {
        let settings: AdminSettings = serde_json::from_str(
            r#"{"openrouterApiKey":"sk-secret","replicateApiKey":"r8-secret"}"#,
        )
        .unwrap();
        let serialized = serde_json::to_string(&settings).unwrap();

        assert!(!serialized.contains("sk-secret"));
        assert!(!serialized.contains("r8-secret"));
        assert_eq!(secret_hint("sk-or-1234567890"), "sk-o...7890");
    }
}
