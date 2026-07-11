use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_workflows_dir")]
    pub workflows_dir: String,

    // ComfyUI
    #[serde(default = "default_comfy_base_url")]
    pub comfy_base_url: String,
    #[serde(default)]
    pub comfy_base_urls: Vec<String>,
    #[serde(default = "default_comfy_timeout_ms")]
    pub comfy_timeout_ms: u64,
    #[serde(default = "default_comfy_poll_interval_ms")]
    pub comfy_poll_interval_ms: u64,
    #[serde(default = "default_comfy_pool_strategy")]
    pub comfy_pool_strategy: String,
    #[serde(default)]
    pub comfy_batch_fanout: bool,
    #[serde(default)]
    pub comfy_primary_index: usize,

    // OpenRouter
    #[serde(default = "default_openrouter_model")]
    pub openrouter_model: String,
    #[serde(default = "default_openrouter_base_url")]
    pub openrouter_base_url: String,
    #[serde(default = "default_openrouter_timeout_ms")]
    pub openrouter_timeout_ms: u64,
    #[serde(default = "default_openrouter_image_model")]
    pub openrouter_image_model: String,

    // Replicate
    #[serde(default, skip_serializing)]
    pub replicate_api_token: Option<String>,
    #[serde(default = "default_replicate_poll_interval_ms")]
    pub replicate_poll_interval_ms: u64,
    #[serde(default = "default_replicate_timeout_ms")]
    pub replicate_timeout_ms: u64,

    // fal.ai
    #[serde(default, skip_serializing)]
    pub fal_api_key: Option<String>,
    #[serde(default = "default_fal_timeout_ms")]
    pub fal_timeout_ms: u64,
    #[serde(default = "default_fal_poll_interval_ms")]
    pub fal_poll_interval_ms: u64,

    // Kie.ai
    #[serde(default, skip_serializing)]
    pub kie_api_key: Option<String>,
    #[serde(default = "default_kie_timeout_ms")]
    pub kie_timeout_ms: u64,
    #[serde(default = "default_kie_poll_interval_ms")]
    pub kie_poll_interval_ms: u64,

    // Storage
    #[serde(default)]
    pub storage_public_base_url: Option<String>,
    #[serde(default)]
    pub storage_prefix: Option<String>,
}

fn default_workflows_dir() -> String {
    "../workflows".to_string()
}
fn default_comfy_base_url() -> String {
    "http://localhost:8188".to_string()
}
fn default_comfy_timeout_ms() -> u64 {
    600_000 // 10 minutes — generous for queued local ComfyUI jobs
}
fn default_comfy_poll_interval_ms() -> u64 {
    1_000
}
fn default_comfy_pool_strategy() -> String {
    "least_busy".to_string()
}
fn default_openrouter_model() -> String {
    "openai/gpt-4o-mini".to_string()
}
fn default_openrouter_base_url() -> String {
    "https://openrouter.ai/api/v1".to_string()
}
fn default_openrouter_timeout_ms() -> u64 {
    120_000
}
fn default_openrouter_image_model() -> String {
    "google/gemini-2.5-flash-image-preview".to_string()
}
fn default_replicate_poll_interval_ms() -> u64 {
    2_000
}
fn default_replicate_timeout_ms() -> u64 {
    300_000
}
fn default_fal_timeout_ms() -> u64 {
    300_000
}
fn default_fal_poll_interval_ms() -> u64 {
    2_000
}
fn default_kie_timeout_ms() -> u64 {
    300_000
}
fn default_kie_poll_interval_ms() -> u64 {
    2_000
}

impl Default for AppConfig {
    fn default() -> Self {
        serde_json::from_str("{}").unwrap()
    }
}

impl AppConfig {
    /// Effective list of ComfyUI base URLs. Falls back to single comfy_base_url.
    pub fn effective_comfy_urls(&self) -> Vec<String> {
        if self.comfy_base_urls.is_empty() {
            vec![self.comfy_base_url.clone()]
        } else {
            self.comfy_base_urls.clone()
        }
    }
}

/// Load config from `<data_dir>/config.json`, creating a default if missing.
pub fn load_config(data_dir: &Path) -> AppResult<AppConfig> {
    let config_path = data_dir.join("config.json");
    if config_path.exists() {
        let raw = std::fs::read_to_string(&config_path)
            .map_err(|e| AppError::Config(format!("Failed to read config: {e}")))?;
        let config: AppConfig = serde_json::from_str(&raw)
            .map_err(|e| AppError::Config(format!("Invalid config JSON: {e}")))?;
        Ok(config)
    } else {
        let config = AppConfig::default();
        // Write default config so user can edit it
        std::fs::create_dir_all(data_dir)?;
        let json = serde_json::to_string_pretty(&config)?;
        std::fs::write(&config_path, json)?;
        Ok(config)
    }
}

pub fn save_config(data_dir: &Path, config: &AppConfig) -> AppResult<()> {
    let json = serde_json::to_string_pretty(config)?;
    std::fs::write(data_dir.join("config.json"), json)?;
    Ok(())
}

/// Resolve the storage directory within app data dir.
pub fn storage_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("storage")
}

/// Resolve the SQLite database path.
pub fn db_path(data_dir: &Path) -> PathBuf {
    data_dir.join("imgimg.db")
}
