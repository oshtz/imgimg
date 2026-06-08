//! fal.ai API proxy — queue-based job submission and polling.

use std::sync::Arc;
use std::time::Duration;

use sqlx::SqlitePool;

use crate::config::AppConfig;
use crate::db::models::Asset;
use crate::error::{AppError, AppResult};
use crate::providers::common::{
    build_data_url, download_bytes, extension_from_content_type, key_headers,
    timestamp_suffix,
};
use crate::services::storage::LocalStorage;

const FAL_QUEUE_BASE: &str = "https://queue.fal.run";

pub struct FalProxy {
    http_client: reqwest::Client,
    config: AppConfig,
    storage: Arc<LocalStorage>,
    db: SqlitePool,
}

impl FalProxy {
    pub fn new(
        http_client: reqwest::Client,
        config: AppConfig,
        storage: Arc<LocalStorage>,
        db: SqlitePool,
    ) -> Self {
        Self { http_client, config, storage, db }
    }

    pub async fn get_api_key(&self) -> AppResult<String> {
        if let Some(key) = crate::stores::admin_settings::get_fal_api_key(&self.db).await? {
            return Ok(key);
        }
        if let Some(ref key) = self.config.fal_api_key {
            if !key.is_empty() {
                return Ok(key.clone());
            }
        }
        Err(AppError::Config("fal.ai API key not configured".into()))
    }

    pub async fn check_health(&self) -> bool {
        self.get_api_key().await.is_ok()
    }

    /// Resolve a file input for fal.ai. Storage/local URLs are converted to data URLs.
    pub async fn resolve_input_file(&self, value: &str) -> AppResult<String> {
        if value.starts_with("data:") {
            return Ok(value.to_string());
        }

        if self.storage.is_storage_url(value) {
            let bytes = self.storage.get_buffer(value).await?;
            let ext = value.rsplit('.').next().unwrap_or("png");
            let ct = crate::providers::common::infer_content_type(ext);
            return Ok(build_data_url(&bytes, ct));
        }

        if is_local_url(value) {
            let (bytes, ct) = download_bytes(&self.http_client, value, None, 30_000).await?;
            return Ok(build_data_url(&bytes, &ct));
        }

        Ok(value.to_string())
    }

    /// Submit a job, poll for completion, and return the output URL.
    pub async fn run_prediction(
        &self,
        input: &serde_json::Value,
        endpoint_id: &str,
        file_input_keys: &[&str],
        output_path: Option<&str>,
    ) -> AppResult<(String, String)> {
        let api_key = self.get_api_key().await?;

        // Resolve file inputs
        let mut resolved_input = input.clone();
        if let Some(obj) = resolved_input.as_object_mut() {
            for key in file_input_keys {
                if let Some(val) = obj.get(*key).and_then(|v| v.as_str()).map(|s| s.to_string()) {
                    let resolved = self.resolve_input_file(&val).await?;
                    obj.insert(key.to_string(), serde_json::Value::String(resolved));
                }
            }
        }

        // Submit to queue
        let url = format!("{}/{}", FAL_QUEUE_BASE, endpoint_id);
        let headers = key_headers(&api_key)?;
        let resp = self
            .http_client
            .post(&url)
            .headers(headers)
            .json(&resolved_input)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::ProviderError(format!(
                "fal.ai submission failed: {body}"
            )));
        }

        let submit_data: serde_json::Value = resp.json().await?;
        let status_url = submit_data["status_url"]
            .as_str()
            .ok_or_else(|| AppError::ProviderError("No status_url in fal response".into()))?
            .to_string();
        let response_url = submit_data["response_url"]
            .as_str()
            .ok_or_else(|| AppError::ProviderError("No response_url in fal response".into()))?
            .to_string();

        // Poll until completion
        self.poll_status(&status_url, &api_key).await?;

        // Fetch final result
        let result_resp = self
            .http_client
            .get(&response_url)
            .headers(key_headers(&api_key)?)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;

        if !result_resp.status().is_success() {
            let body = result_resp.text().await.unwrap_or_default();
            return Err(AppError::ProviderError(format!(
                "fal.ai result fetch failed: {body}"
            )));
        }

        let output: serde_json::Value = result_resp.json().await?;
        let output_url = extract_output_url(&output, output_path)
            .ok_or_else(|| AppError::ProviderError("No output URL in fal response".into()))?;

        let ext = output_url.rsplit('.').next().unwrap_or("png");
        let content_type = crate::providers::common::infer_content_type(ext).to_string();

        Ok((output_url, content_type))
    }

    async fn poll_status(&self, status_url: &str, api_key: &str) -> AppResult<()> {
        let deadline = tokio::time::Instant::now()
            + Duration::from_millis(self.config.fal_timeout_ms);
        let interval = self.config.fal_poll_interval_ms;

        loop {
            let resp = self
                .http_client
                .get(status_url)
                .headers(key_headers(api_key)?)
                .timeout(Duration::from_secs(10))
                .send()
                .await?;

            if resp.status().is_success() {
                let data: serde_json::Value = resp.json().await?;
                let status = data["status"].as_str().unwrap_or("");
                match status {
                    "COMPLETED" => return Ok(()),
                    "FAILED" => {
                        let error = data["error"].as_str().unwrap_or("Unknown").to_string();
                        return Err(AppError::ProviderError(format!(
                            "fal.ai job failed: {error}"
                        )));
                    }
                    _ => {} // IN_QUEUE, IN_PROGRESS
                }
            }

            if tokio::time::Instant::now() >= deadline {
                return Err(AppError::Timeout(
                    "fal.ai job polling timed out".into(),
                ));
            }

            tokio::time::sleep(Duration::from_millis(interval)).await;
        }
    }

    pub async fn generate_and_save(
        &self,
        generation_id: &str,
        asset_type: &str,
        item_index: Option<i64>,
        input: &serde_json::Value,
        endpoint_id: &str,
        file_input_keys: &[&str],
        output_path: Option<&str>,
        filename_prefix: Option<&str>,
    ) -> AppResult<Asset> {
        let (output_url, content_type) = self
            .run_prediction(input, endpoint_id, file_input_keys, output_path)
            .await?;

        if output_url.is_empty() {
            return Err(AppError::ProviderError("No output URL from fal.ai".into()));
        }

        let (bytes, _) = download_bytes(&self.http_client, &output_url, None, 60_000).await?;
        let ext = extension_from_content_type(&content_type);
        let filename = format!(
            "{}_{}.{}",
            filename_prefix.unwrap_or("image"),
            timestamp_suffix(),
            ext
        );

        self.storage
            .write_binary_asset(generation_id, asset_type, item_index, &filename, &bytes)
            .await
    }
}

/// Extract output URL from fal.ai response using a dot-path like "images[0].url".
fn extract_output_url(output: &serde_json::Value, path: Option<&str>) -> Option<String> {
    let path = path.unwrap_or("images[0].url");

    let mut current = output;
    for segment in path.split('.') {
        // Check for array index: "images[0]"
        if let Some(bracket_pos) = segment.find('[') {
            let key = &segment[..bracket_pos];
            let idx_str = &segment[bracket_pos + 1..segment.len() - 1];
            let idx: usize = idx_str.parse().ok()?;

            current = current.get(key)?;
            current = current.get(idx)?;
        } else {
            current = current.get(segment)?;
        }
    }

    current.as_str().map(|s| s.to_string())
}

fn is_local_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("localhost")
        || lower.contains("127.0.0.1")
        || lower.contains("192.168.")
        || lower.contains("10.")
        || lower.contains("[::1]")
}
