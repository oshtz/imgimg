//! OpenRouter API proxy for image generation and LLM calls.

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

use sqlx::SqlitePool;

use crate::config::AppConfig;
use crate::db::models::Asset;
use crate::error::{AppError, AppResult};
use crate::providers::common::{bearer_headers, timestamp_suffix};
use crate::providers::openrouter_image::generate_single_image;
use crate::services::storage::LocalStorage;

// Re-export so existing `use crate::providers::openrouter_proxy::ImageGenParams` keeps working.
pub use crate::providers::openrouter_image::ImageGenParams;

pub struct OpenRouterProxy {
    http_client: reqwest::Client,
    config: AppConfig,
    storage: Arc<LocalStorage>,
    db: SqlitePool,
}

impl OpenRouterProxy {
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
        if let Some(key) = crate::stores::admin_settings::get_openrouter_api_key(&self.db).await? {
            return Ok(key);
        }
        Err(AppError::Config("OpenRouter API key not configured".into()))
    }

    pub async fn check_health(&self) -> bool {
        let Ok(key) = self.get_api_key().await else {
            return false;
        };
        let Ok(headers) = bearer_headers(&key) else {
            return false;
        };
        let url = format!(
            "{}/key",
            self.config.openrouter_base_url.trim_end_matches('/')
        );
        matches!(
            self.http_client
                .get(url)
                .headers(headers)
                .timeout(Duration::from_secs(5))
                .send()
                .await,
            Ok(response) if response.status().is_success()
        )
    }

    /// Generate images via OpenRouter's chat completions endpoint.
    pub async fn generate_images(&self, params: ImageGenParams) -> AppResult<Vec<Asset>> {
        let api_key = self.get_api_key().await?;
        let model = params
            .model
            .as_deref()
            .unwrap_or(&self.config.openrouter_image_model);
        let batch_size = params.batch_size.clamp(1, 4) as usize;
        let is_gemini = model.to_lowercase().contains("gemini");

        let mut assets = Vec::new();
        let mut last_error: Option<AppError> = None;
        let max_parallel = batch_size.min(2);

        for chunk_start in (0..batch_size).step_by(max_parallel) {
            let chunk_end = (chunk_start + max_parallel).min(batch_size);
            let mut handles = Vec::new();

            for i in chunk_start..chunk_end {
                let prompt_text = if let Some(ref prompts) = params.prompts {
                    prompts
                        .get(i)
                        .cloned()
                        .unwrap_or_else(|| params.prompt.clone())
                } else {
                    params.prompt.clone()
                };

                let item_index = params.start_item_index.map(|start| start + i as i64);

                let filename = params
                    .requested_filenames
                    .get(i)
                    .cloned()
                    .unwrap_or_else(|| {
                        let idx_str = item_index.map(|i| format!("_{}", i)).unwrap_or_default();
                        format!("image{}_{}.png", idx_str, timestamp_suffix())
                    });

                let api_key = api_key.clone();
                let model = model.to_string();
                let client = self.http_client.clone();
                let config = self.config.clone();
                let storage = self.storage.clone();
                let gen_id = params.generation_id.clone();
                let ar = params.aspect_ratio.clone();
                let image = params.image.clone();
                let images = params.images.clone();
                let system_prompt = params.system_prompt.clone();

                handles.push(tokio::spawn(async move {
                    generate_single_image(
                        &client,
                        &config,
                        &storage,
                        &api_key,
                        &model,
                        &prompt_text,
                        ar.as_deref(),
                        image.as_deref(),
                        images.as_deref(),
                        system_prompt.as_deref(),
                        is_gemini,
                        &gen_id,
                        item_index,
                        &filename,
                    )
                    .await
                }));
            }

            for handle in handles {
                match handle.await {
                    Ok(Ok(asset)) => assets.push(asset),
                    Ok(Err(e)) => {
                        log::warn!("OpenRouter image gen failed: {e}");
                        last_error = Some(e);
                    }
                    Err(e) => {
                        log::warn!("OpenRouter image gen task panicked: {e}");
                        last_error = Some(AppError::ProviderError(format!("Task panicked: {e}")));
                    }
                }
            }
        }

        if assets.is_empty() {
            if let Some(e) = last_error {
                return Err(e);
            }
        }

        Ok(assets)
    }

    /// Make a chat completion call (non-image, for LLM text). Returns the text response.
    pub async fn chat_completion(
        &self,
        messages: &[serde_json::Value],
        model: Option<&str>,
        temperature: Option<f64>,
        max_tokens: Option<u64>,
    ) -> AppResult<String> {
        let api_key = self.get_api_key().await?;
        let model = model.unwrap_or(&self.config.openrouter_model);

        let url = format!("{}/chat/completions", self.config.openrouter_base_url);
        let mut body = serde_json::json!({
            "model": model,
            "messages": messages,
        });

        if let Some(temp) = temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if let Some(max) = max_tokens {
            body["max_tokens"] = serde_json::json!(max);
        }

        let resp = self
            .http_client
            .post(&url)
            .headers(bearer_headers(&api_key)?)
            .json(&body)
            .timeout(Duration::from_millis(self.config.openrouter_timeout_ms))
            .send()
            .await?;

        if !resp.status().is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            return Err(AppError::ProviderError(format!(
                "OpenRouter chat failed: {body_text}"
            )));
        }

        let data: serde_json::Value = resp.json().await?;
        let content = data["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        Ok(content)
    }

    /// Streaming chat completion. Returns chunks via a callback.
    pub async fn chat_completion_stream(
        &self,
        messages: &[serde_json::Value],
        model: Option<&str>,
        temperature: Option<f64>,
        max_tokens: Option<u64>,
        on_chunk: impl Fn(&str),
    ) -> AppResult<String> {
        let result = self
            .chat_completion_stream_with_tools(
                messages,
                model,
                temperature,
                max_tokens,
                None,
                None,
                &on_chunk,
                |_| {},
                |_| {},
            )
            .await?;
        Ok(result.text)
    }

    /// Streaming chat completion with tool support.
    /// Calls `on_chunk` for text deltas, `on_tool_delta` for each raw tool_calls
    /// delta chunk, and `on_finish` with the finish_reason string.
    /// Returns accumulated text and fully assembled tool calls.
    pub async fn chat_completion_stream_with_tools(
        &self,
        messages: &[serde_json::Value],
        model: Option<&str>,
        temperature: Option<f64>,
        max_tokens: Option<u64>,
        tools: Option<&[serde_json::Value]>,
        cancelled: Option<Arc<AtomicBool>>,
        on_chunk: impl Fn(&str),
        on_tool_delta: impl Fn(&serde_json::Value),
        on_finish: impl Fn(&str),
    ) -> AppResult<StreamWithToolsResult> {
        let api_key = self.get_api_key().await?;
        let model = model.unwrap_or(&self.config.openrouter_model);

        let url = format!("{}/chat/completions", self.config.openrouter_base_url);
        let mut body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true,
        });

        if let Some(temp) = temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if let Some(max) = max_tokens {
            body["max_tokens"] = serde_json::json!(max);
        }
        if let Some(t) = tools {
            if !t.is_empty() {
                body["tools"] = serde_json::json!(t);
                body["tool_choice"] = serde_json::json!("auto");
            }
        }

        let resp = self
            .http_client
            .post(&url)
            .headers(bearer_headers(&api_key)?)
            .json(&body)
            .timeout(Duration::from_millis(self.config.openrouter_timeout_ms))
            .send()
            .await?;

        if !resp.status().is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            return Err(AppError::ProviderError(format!(
                "OpenRouter stream failed: {body_text}"
            )));
        }

        let mut full_text = String::new();
        // Accumulate tool calls: index -> { id, type, function: { name, arguments } }
        let mut tool_calls_map: std::collections::BTreeMap<usize, serde_json::Value> =
            std::collections::BTreeMap::new();
        let mut stream = resp.bytes_stream();

        use futures::StreamExt;
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            if cancelled
                .as_ref()
                .map(|flag| flag.load(Ordering::Relaxed))
                .unwrap_or(false)
            {
                return Ok(StreamWithToolsResult {
                    text: full_text,
                    tool_calls: vec![],
                    cancelled: true,
                });
            }

            let chunk = chunk?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process SSE lines
            while let Some(newline_pos) = buffer.find('\n') {
                if cancelled
                    .as_ref()
                    .map(|flag| flag.load(Ordering::Relaxed))
                    .unwrap_or(false)
                {
                    return Ok(StreamWithToolsResult {
                        text: full_text,
                        tool_calls: vec![],
                        cancelled: true,
                    });
                }

                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if let Some(data_str) = line.strip_prefix("data: ") {
                    if data_str == "[DONE]" {
                        continue;
                    }
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_str) {
                        let choice = &data["choices"][0];
                        let delta = &choice["delta"];

                        // Text content
                        if let Some(content) = delta["content"].as_str() {
                            full_text.push_str(content);
                            on_chunk(content);
                        }

                        // Tool calls (streamed as deltas)
                        if let Some(tc_deltas) = delta["tool_calls"].as_array() {
                            for tc_delta in tc_deltas {
                                let idx = tc_delta["index"].as_u64().unwrap_or(0) as usize;
                                let entry = tool_calls_map.entry(idx).or_insert_with(|| {
                                    serde_json::json!({
                                        "id": "",
                                        "type": "function",
                                        "function": { "name": "", "arguments": "" }
                                    })
                                });

                                // Merge id
                                if let Some(id) = tc_delta["id"].as_str() {
                                    entry["id"] = serde_json::json!(id);
                                }
                                // Merge function name
                                if let Some(name) = tc_delta["function"]["name"].as_str() {
                                    let existing = entry["function"]["name"]
                                        .as_str()
                                        .unwrap_or("")
                                        .to_string();
                                    entry["function"]["name"] =
                                        serde_json::json!(format!("{}{}", existing, name));
                                }
                                // Merge function arguments
                                if let Some(args) = tc_delta["function"]["arguments"].as_str() {
                                    let existing = entry["function"]["arguments"]
                                        .as_str()
                                        .unwrap_or("")
                                        .to_string();
                                    entry["function"]["arguments"] =
                                        serde_json::json!(format!("{}{}", existing, args));
                                }

                                on_tool_delta(tc_delta);
                            }
                        }

                        // Finish reason
                        if let Some(reason) = choice["finish_reason"].as_str() {
                            on_finish(reason);
                        }
                    }
                }
            }
        }

        let tool_calls: Vec<serde_json::Value> = tool_calls_map.into_values().collect();

        Ok(StreamWithToolsResult {
            text: full_text,
            tool_calls,
            cancelled: false,
        })
    }
}

/// Result from streaming chat completion with tools.
pub struct StreamWithToolsResult {
    pub text: String,
    pub tool_calls: Vec<serde_json::Value>,
    pub cancelled: bool,
}
