//! Kie.ai API proxy — task submission and polling.

use std::sync::Arc;
use std::time::Duration;

use sqlx::SqlitePool;

use crate::config::AppConfig;
use crate::db::models::Asset;
use crate::error::{AppError, AppResult};
use crate::providers::common::{
    bearer_headers, download_asset, extension_from_content_type, timestamp_suffix,
};
use crate::services::storage::LocalStorage;

const KIE_BASE: &str = "https://api.kie.ai";

pub struct KieProxy {
    http_client: reqwest::Client,
    config: AppConfig,
    storage: Arc<LocalStorage>,
    db: SqlitePool,
}

impl KieProxy {
    pub fn new(
        http_client: reqwest::Client,
        config: AppConfig,
        storage: Arc<LocalStorage>,
        db: SqlitePool,
    ) -> Self {
        Self {
            http_client,
            config,
            storage,
            db,
        }
    }

    pub async fn get_api_key(&self) -> AppResult<String> {
        if let Some(key) = crate::stores::admin_settings::get_kie_api_key(&self.db).await? {
            return Ok(key);
        }
        Err(AppError::Config("Kie.ai API key not configured".into()))
    }

    pub async fn check_health(&self) -> bool {
        false
    }

    /// Submit a task and poll until completion. Returns (output_url, content_type).
    pub async fn run_prediction(
        &self,
        input: &serde_json::Value,
        endpoint: &str,
        _model: Option<&str>,
    ) -> AppResult<(String, String)> {
        let api_key = self.get_api_key().await?;

        // Submit task
        let url = kie_endpoint_url(endpoint)?;
        let resp = self
            .http_client
            .post(url)
            .headers(bearer_headers(&api_key)?)
            .json(input)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::ProviderError(format!(
                "Kie.ai task submission failed: {body}"
            )));
        }

        let submit_data: serde_json::Value = resp.json().await?;
        let code = submit_data["code"].as_i64().unwrap_or(-1);
        if code != 0 && code != 200 {
            let msg = submit_data["msg"].as_str().unwrap_or("Unknown error");
            return Err(AppError::ProviderError(format!(
                "Kie.ai task submission error (code {code}): {msg}"
            )));
        }

        let task_id = submit_data["data"]["taskId"]
            .as_str()
            .ok_or_else(|| AppError::ProviderError("No taskId in Kie response".into()))?
            .to_string();

        log::info!("Kie.ai task submitted: {task_id}");

        // Poll task
        let result = self.poll_task(&task_id, &api_key).await?;

        let output_url = result["data"]["result"]["url"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let ext = output_url.rsplit('.').next().unwrap_or("png");
        let content_type = crate::providers::common::infer_content_type(ext).to_string();

        Ok((output_url, content_type))
    }

    async fn poll_task(&self, task_id: &str, api_key: &str) -> AppResult<serde_json::Value> {
        let url = format!("{}/api/v1/task/{}", KIE_BASE, task_id);
        let deadline =
            tokio::time::Instant::now() + Duration::from_millis(self.config.kie_timeout_ms);
        let interval = self.config.kie_poll_interval_ms;

        loop {
            let resp = self
                .http_client
                .get(&url)
                .headers(bearer_headers(api_key)?)
                .timeout(Duration::from_secs(10))
                .send()
                .await?;

            if resp.status().is_success() {
                let data: serde_json::Value = resp.json().await?;
                let status = data["data"]["status"].as_str().unwrap_or("");
                match status {
                    "completed" => return Ok(data),
                    "failed" => {
                        let error = data["data"]["error"]
                            .as_str()
                            .unwrap_or("Unknown")
                            .to_string();
                        return Err(AppError::ProviderError(format!(
                            "Kie.ai task failed: {error}"
                        )));
                    }
                    _ => {} // processing, pending
                }
            }

            if tokio::time::Instant::now() >= deadline {
                return Err(AppError::Timeout(format!(
                    "Kie.ai task timed out: {task_id}"
                )));
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
        endpoint: &str,
        filename_prefix: Option<&str>,
    ) -> AppResult<Asset> {
        let (output_url, content_type) = self.run_prediction(input, endpoint, None).await?;

        if output_url.is_empty() {
            return Err(AppError::ProviderError("No output URL from Kie.ai".into()));
        }

        let ext = extension_from_content_type(&content_type);
        let filename = format!(
            "{}_{}.{}",
            filename_prefix.unwrap_or("image"),
            timestamp_suffix(),
            ext
        );

        download_asset(
            &self.http_client,
            &self.storage,
            &output_url,
            None,
            60_000,
            generation_id,
            asset_type,
            item_index,
            &filename,
        )
        .await
    }
}

fn kie_endpoint_url(endpoint: &str) -> AppResult<reqwest::Url> {
    if !endpoint.starts_with("/api/") {
        return Err(AppError::BadRequest(
            "Kie endpoint must be a relative /api/ route".into(),
        ));
    }

    let base = reqwest::Url::parse(&format!("{KIE_BASE}/"))
        .map_err(|e| AppError::Internal(format!("Invalid Kie base URL: {e}")))?;
    let url = base
        .join(endpoint.trim_start_matches('/'))
        .map_err(|e| AppError::BadRequest(format!("Invalid Kie endpoint: {e}")))?;
    if url.scheme() != "https"
        || url.host_str() != Some("api.kie.ai")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(AppError::BadRequest(
            "Kie endpoint host is not allowed".into(),
        ));
    }
    Ok(url)
}

#[cfg(test)]
mod endpoint_tests {
    use super::kie_endpoint_url;

    #[test]
    fn kie_endpoints_are_confined_to_the_provider_host() {
        assert_eq!(
            kie_endpoint_url("/api/v1/task/create").unwrap().as_str(),
            "https://api.kie.ai/api/v1/task/create"
        );

        for endpoint in [
            "@evil.example/path",
            "/@evil.example/path",
            "//evil.example/api/task",
            "https://evil.example/api/task",
            "/v1/task",
        ] {
            assert!(
                kie_endpoint_url(endpoint).is_err(),
                "accepted unsafe endpoint: {endpoint}"
            );
        }
    }
}
