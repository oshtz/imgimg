//! Replicate API proxy — prediction creation, polling, and asset storage.

use std::sync::Arc;
use std::time::Duration;

use sqlx::SqlitePool;

use crate::config::AppConfig;
use crate::db::models::Asset;
use crate::error::{AppError, AppResult};
use crate::providers::common::{
    bearer_headers, download_asset, download_bytes, extension_from_content_type, timestamp_suffix,
};
use crate::services::storage::LocalStorage;

const REPLICATE_BASE: &str = "https://api.replicate.com/v1";

pub struct ReplicateProxy {
    http_client: reqwest::Client,
    config: AppConfig,
    storage: Arc<LocalStorage>,
    db: SqlitePool,
}

impl ReplicateProxy {
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

    /// Get API token from the OS credential store.
    pub async fn get_api_token(&self) -> AppResult<String> {
        if let Some(key) = crate::stores::admin_settings::get_replicate_api_key(&self.db).await? {
            return Ok(key);
        }
        Err(AppError::Config(
            "Replicate API token not configured".into(),
        ))
    }

    pub async fn check_health(&self) -> bool {
        match self.get_api_token().await {
            Ok(token) => {
                let Ok(headers) = bearer_headers(&token) else {
                    return false;
                };
                let url = format!("{}/models", REPLICATE_BASE);
                let result = self
                    .http_client
                    .get(&url)
                    .headers(headers)
                    .timeout(Duration::from_secs(5))
                    .send()
                    .await;
                matches!(result, Ok(resp) if resp.status().is_success())
            }
            Err(_) => false,
        }
    }

    /// Upload a file to Replicate's file storage.
    pub async fn upload_file(
        &self,
        bytes: Vec<u8>,
        filename: &str,
        content_type: &str,
        token: &str,
    ) -> AppResult<String> {
        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(filename.to_string())
            .mime_str(content_type)
            .unwrap_or_else(|_| reqwest::multipart::Part::bytes(vec![]));

        let form = reqwest::multipart::Form::new().part("content", part);

        let url = format!("{}/files", REPLICATE_BASE);
        let resp = self
            .http_client
            .post(&url)
            .headers(bearer_headers(token)?)
            .multipart(form)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::ProviderError(format!(
                "Replicate file upload failed: {body}"
            )));
        }

        let data: serde_json::Value = resp.json().await?;
        let get_url = data["urls"]["get"]
            .as_str()
            .ok_or_else(|| AppError::ProviderError("No URL in upload response".into()))?;

        Ok(get_url.to_string())
    }

    /// Resolve a file input value for Replicate.
    /// Storage/local URLs get downloaded and re-uploaded; external URLs pass through.
    pub async fn resolve_input_file(&self, value: &str, token: &str) -> AppResult<String> {
        if value.trim().is_empty() {
            return Err(AppError::BadRequest("Empty file input value".into()));
        }

        if value.starts_with("data:") {
            // Pass data URLs through directly — Replicate's API accepts them
            // and they carry the content-type inline, which avoids format-
            // detection failures that occur with the extension-less file-API
            // URLs returned by /v1/files (e.g. xAI proxy models).
            return Ok(value.to_string());
        }

        if self.storage.is_storage_url(value) {
            // Download from local storage and upload to Replicate
            let bytes = self.storage.get_buffer(value).await?;
            let ext = value.rsplit('.').next().unwrap_or("png");
            let ct = crate::providers::common::infer_content_type(ext);
            let filename = format!("input.{}", ext);
            return self.upload_file(bytes, &filename, ct, token).await;
        }

        if is_local_url(value) {
            // Download from local URL and upload to Replicate
            let (bytes, ct) = download_bytes(&self.http_client, value, None, 30_000).await?;
            let ext = extension_from_content_type(&ct);
            let filename = format!("input.{}", ext);
            return self.upload_file(bytes, &filename, &ct, token).await;
        }

        // External HTTP URL — Replicate can fetch directly
        Ok(value.to_string())
    }

    /// Create a prediction and poll until completion.
    pub async fn run_prediction(
        &self,
        input: &serde_json::Value,
        model: &str,
        file_input_keys: &[&str],
    ) -> AppResult<(String, String)> {
        let token = self.get_api_token().await?;

        // Resolve file inputs
        let mut resolved_input = input.clone();
        if let Some(obj) = resolved_input.as_object_mut() {
            for key in file_input_keys {
                if let Some(val) = obj
                    .get(*key)
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                {
                    let resolved = self.resolve_input_file(&val, &token).await?;
                    obj.insert(key.to_string(), serde_json::Value::String(resolved));
                }
            }
        }

        // Create prediction
        let url = format!("{}/models/{}/predictions", REPLICATE_BASE, model);
        let body = serde_json::json!({ "input": resolved_input });

        let resp = self
            .http_client
            .post(&url)
            .headers(bearer_headers(&token)?)
            .json(&body)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;

        if !resp.status().is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            return Err(AppError::ProviderError(format!(
                "Replicate prediction creation failed: {body_text}"
            )));
        }

        let prediction: serde_json::Value = resp.json().await?;
        let prediction_id = prediction["id"]
            .as_str()
            .ok_or_else(|| AppError::ProviderError("No id in prediction response".into()))?
            .to_string();

        // Poll prediction
        let result = self.poll_prediction(&prediction_id, &token).await?;

        // Extract output URL
        let output = &result["output"];
        let output_url = if let Some(s) = output.as_str() {
            s.to_string()
        } else if let Some(arr) = output.as_array() {
            arr.first()
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        } else {
            return Err(AppError::ProviderError(
                "No output URL in prediction result".into(),
            ));
        };

        // Infer content type from URL extension
        let ext = output_url.rsplit('.').next().unwrap_or("png");
        let content_type = crate::providers::common::infer_content_type(ext).to_string();

        Ok((output_url, content_type))
    }

    /// Poll a prediction until it reaches a terminal state.
    async fn poll_prediction(
        &self,
        prediction_id: &str,
        token: &str,
    ) -> AppResult<serde_json::Value> {
        let url = format!("{}/predictions/{}", REPLICATE_BASE, prediction_id);
        poll_prediction_url(
            &self.http_client,
            &url,
            prediction_id,
            token,
            self.config.replicate_timeout_ms,
            self.config.replicate_poll_interval_ms,
        )
        .await
    }

    /// Run prediction, download result, and store as an asset.
    pub async fn generate_and_save(
        &self,
        generation_id: &str,
        asset_type: &str,
        item_index: Option<i64>,
        input: &serde_json::Value,
        model: &str,
        file_input_keys: &[&str],
        filename_prefix: Option<&str>,
    ) -> AppResult<Asset> {
        let (output_url, content_type) = self.run_prediction(input, model, file_input_keys).await?;

        if output_url.is_empty() {
            return Err(AppError::ProviderError(
                "No output URL from Replicate".into(),
            ));
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

async fn poll_prediction_url(
    http_client: &reqwest::Client,
    url: &str,
    prediction_id: &str,
    token: &str,
    timeout_ms: u64,
    interval_ms: u64,
) -> AppResult<serde_json::Value> {
    let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms);

    loop {
        let response = http_client
            .get(url)
            .headers(bearer_headers(token)?)
            .timeout(Duration::from_secs(10))
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let data: serde_json::Value = resp.json().await?;
                let status = data["status"].as_str().unwrap_or("");

                match status {
                    "succeeded" => return Ok(data),
                    "failed" | "canceled" => {
                        let error = data["error"]
                            .as_str()
                            .unwrap_or("Unknown error")
                            .to_string();
                        return Err(AppError::ProviderError(format!(
                            "Replicate prediction {status}: {error}"
                        )));
                    }
                    _ => {} // processing, starting, etc.
                }
            }
            Ok(_) => {}
            Err(err) => {
                if tokio::time::Instant::now() >= deadline {
                    return Err(AppError::Http(err));
                }
            }
        }

        if tokio::time::Instant::now() >= deadline {
            return Err(AppError::Timeout(format!(
                "Replicate prediction timed out: {prediction_id}"
            )));
        }

        tokio::time::sleep(Duration::from_millis(interval_ms)).await;
    }
}

fn is_local_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("localhost")
        || lower.contains("127.0.0.1")
        || lower.contains("192.168.")
        || lower.contains("10.")
        || lower.contains("[::1]")
        || lower.contains("host.docker.internal")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn poll_prediction_retries_transient_request_errors() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let url = format!("http://{addr}/predictions/test-prediction");

        tokio::spawn(async move {
            // First poll: accept and close without responding, simulating a
            // transient send/request failure after Replicate has accepted a job.
            let (mut dropped_stream, _) = listener.accept().await.unwrap();
            let mut buf = [0_u8; 1024];
            let _ = dropped_stream.read(&mut buf).await;
            drop(dropped_stream);

            // Second poll: return a successful terminal prediction response.
            let (mut ok_stream, _) = listener.accept().await.unwrap();
            let _ = ok_stream.read(&mut buf).await;
            let body = r#"{"status":"succeeded","output":"https://example.com/image.png"}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            ok_stream.write_all(response.as_bytes()).await.unwrap();
        });

        let data = poll_prediction_url(
            &reqwest::Client::new(),
            &url,
            "test-prediction",
            "r8_test",
            1_000,
            1,
        )
        .await
        .unwrap();

        assert_eq!(data["status"], "succeeded");
    }
}
