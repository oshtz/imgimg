//! ComfyUI proxy — HTTP/WebSocket client for ComfyUI instances.

use std::sync::Arc;
use std::time::Duration;

use futures::stream::StreamExt;
use tokio_tungstenite::tungstenite::Message;

use crate::config::AppConfig;
use crate::db::models::Asset;
use crate::error::{AppError, AppResult};
use crate::providers::common::{
    detect_image_format, timestamp_suffix,
};
use crate::providers::comfy_types::{
    ComfyHistoryItem, ComfyImageRef,
    flatten_images, parse_save_node_mappings, replace_extension,
};
use crate::providers::comfy_ws::extract_preview_from_binary;
use crate::services::event_hub::EventHub;
use crate::services::storage::LocalStorage;

// Re-export types so that existing `use crate::providers::comfy_proxy::X` paths keep working.
pub use crate::providers::comfy_types::{
    AssetCallback, ComfyHistoryOutput, FullSetParams, PreviewCallback,
    RemoveBackgroundParams, SaveNodeMapping, SimpleImageParams,
};

// ── ComfyProxy ──

pub struct ComfyProxy {
    base_url: String,
    http_client: reqwest::Client,
    storage: Arc<LocalStorage>,
    config: AppConfig,
    event_hub: Option<EventHub>,
}

impl ComfyProxy {
    pub fn new(
        base_url: String,
        http_client: reqwest::Client,
        storage: Arc<LocalStorage>,
        config: AppConfig,
    ) -> Self {
        // Strip trailing slash
        let base_url = base_url.trim_end_matches('/').to_string();
        Self {
            base_url,
            http_client,
            storage,
            config,
            event_hub: None,
        }
    }

    pub fn set_event_hub(&mut self, event_hub: EventHub) {
        self.event_hub = Some(event_hub);
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    // ── Health ──

    pub async fn is_healthy(&self, timeout_ms: u64) -> bool {
        let url = format!("{}/system_stats", self.base_url);
        let result = self
            .http_client
            .get(&url)
            .timeout(Duration::from_millis(timeout_ms))
            .send()
            .await;
        match result {
            Ok(resp) => {
                // Consume body to return connection to pool
                let _ = resp.bytes().await;
                true
            }
            Err(_) => false,
        }
    }

    // ── Upload ──

    /// Upload an image to ComfyUI from a data URL. Returns the filename.
    pub async fn upload_image(&self, image_data_url: &str) -> AppResult<String> {
        let (bytes, content_type) = crate::providers::common::parse_data_url(image_data_url)?;
        let ext = match content_type.as_str() {
            "image/png" => "png",
            "image/jpeg" | "image/jpg" => "jpg",
            "image/webp" => "webp",
            _ => "png",
        };

        let filename = format!("input_{}.{}", uuid::Uuid::new_v4(), ext);

        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(filename.clone())
            .mime_str(&content_type)
            .unwrap_or_else(|_| {
                reqwest::multipart::Part::bytes(vec![]).file_name(filename.clone())
            });

        let form = reqwest::multipart::Form::new()
            .part("image", part)
            .text("type", "input")
            .text("overwrite", "true");

        let url = format!("{}/upload/image", self.base_url);
        let resp = self
            .http_client
            .post(&url)
            .multipart(form)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::ProviderError(format!(
                "ComfyUI upload failed: {body}"
            )));
        }

        // Response: { "name": "...", "subfolder": "...", "type": "input" }
        let data: serde_json::Value = resp.json().await?;
        let name = data["name"].as_str().unwrap_or(&filename);
        let subfolder = data["subfolder"].as_str().unwrap_or("");

        if subfolder.is_empty() {
            Ok(name.to_string())
        } else {
            Ok(format!("{}/{}", subfolder, name))
        }
    }

    // ── Submit ──

    /// Submit a workflow prompt to ComfyUI. Returns the prompt_id.
    pub async fn submit_prompt(
        &self,
        workflow: &serde_json::Value,
        client_id: &str,
    ) -> AppResult<String> {
        let url = format!("{}/prompt", self.base_url);
        // The workflow may be wrapped as { "meta": {...}, "prompt": { nodes... } }.
        // ComfyUI expects only the node graph, so unwrap and strip non-node keys.
        let prompt_graph = if let Some(inner) = workflow.get("prompt").filter(|p| p.is_object()) {
            inner
        } else {
            workflow
        };
        // Strip any remaining non-node keys (e.g. "meta") — valid nodes have "class_type".
        let cleaned = if let Some(obj) = prompt_graph.as_object() {
            let filtered: serde_json::Map<String, serde_json::Value> = obj
                .iter()
                .filter(|(_k, v)| v.get("class_type").and_then(|c| c.as_str()).is_some())
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            serde_json::Value::Object(filtered)
        } else {
            prompt_graph.clone()
        };
        let body = serde_json::json!({
            "prompt": cleaned,
            "client_id": client_id,
        });

        let resp = self
            .http_client
            .post(&url)
            .json(&body)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;

        if !resp.status().is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            return Err(AppError::ProviderError(format!(
                "ComfyUI prompt submission failed: {body_text}"
            )));
        }

        let data: serde_json::Value = resp.json().await?;
        let prompt_id = data["prompt_id"]
            .as_str()
            .ok_or_else(|| AppError::ProviderError("No prompt_id in response".into()))?;

        Ok(prompt_id.to_string())
    }

    // ── Poll History ──

    /// Poll ComfyUI history until the job completes.
    pub async fn poll_history(
        &self,
        prompt_id: &str,
        min_images: usize,
        no_timeout: bool,
    ) -> AppResult<ComfyHistoryItem> {
        let timeout_ms = if no_timeout {
            24 * 60 * 60 * 1000 // 24 hours
        } else {
            self.config.comfy_timeout_ms
        };
        let interval = self.config.comfy_poll_interval_ms;
        let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms);
        let url = format!("{}/history/{}", self.base_url, prompt_id);

        loop {
            match self
                .http_client
                .get(&url)
                .timeout(Duration::from_secs(10))
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    let data: serde_json::Value = resp.json().await.unwrap_or_default();

                    // Response can be { prompt_id: item } or item directly
                    let item_val = if data.get(prompt_id).is_some() {
                        data[prompt_id].clone()
                    } else {
                        data
                    };

                    if let Ok(item) = serde_json::from_value::<ComfyHistoryItem>(item_val) {
                        let images = flatten_images(&item);
                        if images.len() >= min_images {
                            return Ok(item);
                        }
                    }
                }
                Ok(_) => {} // Non-success (404 etc.) — not ready yet
                Err(e) => {
                    log::debug!("ComfyUI history poll error (will retry): {e}");
                }
            }

            if tokio::time::Instant::now() >= deadline {
                return Err(AppError::Timeout(format!(
                    "ComfyUI history polling timed out after {timeout_ms}ms for prompt {prompt_id}"
                )));
            }

            tokio::time::sleep(Duration::from_millis(interval)).await;
        }
    }

    // ── Fetch Image ──

    /// Download an image from ComfyUI by reference.
    pub async fn fetch_comfy_image(&self, img_ref: &ComfyImageRef) -> AppResult<(Vec<u8>, String)> {
        let subfolder = img_ref.subfolder.as_deref().unwrap_or("");
        let img_type = img_ref.image_type.as_deref().unwrap_or("output");
        let url = format!(
            "{}/view?filename={}&subfolder={}&type={}",
            self.base_url, img_ref.filename, subfolder, img_type
        );

        let resp = self
            .http_client
            .get(&url)
            .timeout(Duration::from_secs(60))
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(AppError::ProviderError(format!(
                "ComfyUI image fetch failed for {}",
                img_ref.filename
            )));
        }

        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/png")
            .to_string();
        let bytes = resp.bytes().await?.to_vec();

        Ok((bytes, content_type))
    }

    /// Fetch an image from ComfyUI and store it as an asset.
    pub async fn fetch_and_store_image(
        &self,
        generation_id: &str,
        asset_type: &str,
        item_index: Option<i64>,
        img_ref: &ComfyImageRef,
        filename: &str,
    ) -> AppResult<Asset> {
        let (bytes, content_type) = self.fetch_comfy_image(img_ref).await?;

        // Determine extension from actual bytes or content type
        let ext = detect_image_format(&bytes)
            .unwrap_or_else(|| {
                crate::providers::common::extension_from_content_type(&content_type)
            });

        // Replace extension in filename
        let final_filename = replace_extension(filename, ext);

        self.storage
            .write_binary_asset(generation_id, asset_type, item_index, &final_filename, &bytes)
            .await
    }

    // ── Generate Simple Image ──

    pub async fn generate_simple_image(&self, params: SimpleImageParams) -> AppResult<Vec<Asset>> {
        let batch_size = params.batch_size.clamp(1, 4) as usize;
        let asset_type = params.asset_type.as_deref().unwrap_or("image");

        let client_id = uuid::Uuid::new_v4().to_string();

        // Start preview stream (best-effort, runs in background)
        let ws_handle = self.start_preview_stream(
            &client_id,
            &params.generation_id,
            params.item_index,
        );

        // Submit workflow
        let prompt_id = self.submit_prompt(&params.workflow, &client_id).await?;

        // Poll history
        let history = self.poll_history(&prompt_id, batch_size, false).await?;

        // Stop preview stream
        drop(ws_handle);

        // Fetch and store images
        let images = flatten_images(&history);
        let mut assets = Vec::new();

        if batch_size == 1 {
            if let Some(img_ref) = images.first() {
                let filename = if let Some(prefix) = &params.filename_prefix {
                    format!("{}_{}.png", prefix, timestamp_suffix())
                } else if let Some(idx) = params.item_index {
                    format!("image_{}.png", idx)
                } else {
                    "image.png".to_string()
                };

                let asset = self
                    .fetch_and_store_image(
                        &params.generation_id,
                        asset_type,
                        params.item_index,
                        img_ref,
                        &filename,
                    )
                    .await?;
                assets.push(asset);
            }
        } else {
            let ts = timestamp_suffix();
            for (i, img_ref) in images.iter().enumerate().take(batch_size) {
                let filename = if let Some(prefix) = &params.filename_prefix {
                    format!("{}_{}_{}.png", prefix, i, ts)
                } else {
                    format!("image_{}.png", i)
                };

                let item_index = Some(i as i64);

                match self
                    .fetch_and_store_image(
                        &params.generation_id,
                        asset_type,
                        item_index,
                        img_ref,
                        &filename,
                    )
                    .await
                {
                    Ok(asset) => assets.push(asset),
                    Err(e) => log::warn!("Failed to fetch batch image {i}: {e}"),
                }
            }
        }

        Ok(assets)
    }

    // ── Generate Full Set ──

    pub async fn generate_full_set(&self, params: FullSetParams) -> AppResult<Vec<Asset>> {
        let _item_count = params.expected_item_count.unwrap_or(6);

        let client_id = uuid::Uuid::new_v4().to_string();
        let mappings = parse_save_node_mappings(&params.workflow);

        // Submit workflow
        let prompt_id = self.submit_prompt(&params.workflow, &client_id).await?;

        // Poll history (no timeout — full sets can take a long time)
        let history = self.poll_history(&prompt_id, 1, true).await?;

        // Collect assets from history
        let images = flatten_images(&history);
        let mut assets: Vec<Asset> = Vec::new();

        if !mappings.is_empty() {
            // Use mappings to assign types/indices
            for (i, img_ref) in images.iter().enumerate() {
                if let Some(mapping) = mappings.get(i) {
                    let asset = self
                        .fetch_and_store_image(
                            &params.generation_id,
                            &mapping.asset_type,
                            mapping.item_index,
                            img_ref,
                            &mapping.filename,
                        )
                        .await?;
                    if let Some(ref cb) = params.on_asset {
                        cb(asset.clone());
                    }
                    assets.push(asset);
                }
            }
        } else {
            // Fallback: first = main (landscape), middle = items (square), last = background
            if let Some(img_ref) = images.first() {
                let asset = self
                    .fetch_and_store_image(
                        &params.generation_id,
                        "landscape",
                        None,
                        img_ref,
                        "main.png",
                    )
                    .await?;
                if let Some(ref cb) = params.on_asset {
                    cb(asset.clone());
                }
                assets.push(asset);
            }

            // Items in the middle
            let item_end = if images.len() > 2 {
                images.len() - 1
            } else {
                images.len()
            };
            for i in 1..item_end {
                let item_index = (i - 1) as i64;
                let filename = format!("item_{}.png", item_index);
                let asset = self
                    .fetch_and_store_image(
                        &params.generation_id,
                        "square",
                        Some(item_index),
                        &images[i],
                        &filename,
                    )
                    .await?;
                if let Some(ref cb) = params.on_asset {
                    cb(asset.clone());
                }
                assets.push(asset);
            }

            // Last = background (if more than 2 images)
            if images.len() > 2 {
                if let Some(img_ref) = images.last() {
                    let asset = self
                        .fetch_and_store_image(
                            &params.generation_id,
                            "landscape",
                            None,
                            img_ref,
                            "background.png",
                        )
                        .await?;
                    if let Some(ref cb) = params.on_asset {
                        cb(asset.clone());
                    }
                    assets.push(asset);
                }
            }
        }

        Ok(assets)
    }

    // ── Regenerate Item ──

    pub async fn regenerate_item(
        &self,
        generation_id: &str,
        _prompt: &str,
        _seed: i64,
        item_index: i64,
        workflow: &serde_json::Value,
        _on_preview: Option<PreviewCallback>,
    ) -> AppResult<Asset> {
        let ts = timestamp_suffix();

        let client_id = uuid::Uuid::new_v4().to_string();
        let _ws = self.start_preview_stream(&client_id, generation_id, Some(item_index));
        let prompt_id = self.submit_prompt(workflow, &client_id).await?;
        let history = self.poll_history(&prompt_id, 1, false).await?;

        let images = flatten_images(&history);
        let img_ref = images
            .first()
            .ok_or_else(|| AppError::ProviderError("No output from ComfyUI regen".into()))?;

        let filename = format!("item_{}_{}.png", item_index, ts);
        self.fetch_and_store_image(generation_id, "square", Some(item_index), img_ref, &filename)
            .await
    }

    // ── Remove Background ──

    pub async fn remove_background(&self, params: RemoveBackgroundParams) -> AppResult<Asset> {
        let ts = timestamp_suffix();
        let filename_base = format!("rembg_item_{}_{}", params.item_index, ts);

        let client_id = uuid::Uuid::new_v4().to_string();
        let prompt_id = self.submit_prompt(&params.workflow, &client_id).await?;
        let history = self.poll_history(&prompt_id, 1, false).await?;

        let images = flatten_images(&history);
        let img_ref = images
            .first()
            .ok_or_else(|| AppError::ProviderError("No output from ComfyUI rembg".into()))?;

        let filename = format!("{}.png", filename_base);
        self.fetch_and_store_image(
            &params.generation_id,
            "rembg",
            Some(params.item_index),
            img_ref,
            &filename,
        )
        .await
    }

    // ── List LoRAs ──

    pub async fn list_loras(&self) -> AppResult<Vec<String>> {
        let url = format!("{}/models/loras", self.base_url);
        let resp = self
            .http_client
            .get(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .await?;

        if !resp.status().is_success() {
            return Ok(vec![]);
        }

        let data: serde_json::Value = resp.json().await.unwrap_or_default();

        // Handle multiple response formats
        let names = if let Some(arr) = data.as_array() {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        } else if let Some(arr) = data.get("models").and_then(|v| v.as_array()) {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        } else if let Some(arr) = data.get("loras").and_then(|v| v.as_array()) {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        } else if let Some(arr) = data.get("files").and_then(|v| v.as_array()) {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        } else {
            vec![]
        };

        Ok(names)
    }

    // ── WebSocket Preview Stream ──

    /// Start a WebSocket connection for preview streaming. Returns a handle
    /// that stops the stream when dropped.
    fn start_preview_stream(
        &self,
        client_id: &str,
        generation_id: &str,
        item_index: Option<i64>,
    ) -> Option<tokio::task::JoinHandle<()>> {
        // Best-effort: preview streaming is optional
        let ws_url = format!(
            "{}/ws?clientId={}",
            self.base_url.replace("http://", "ws://").replace("https://", "wss://"),
            client_id
        );
        let storage = self.storage.clone();
        let gen_id = generation_id.to_string();
        let idx = item_index;
        let event_hub = self.event_hub.clone();

        Some(tokio::spawn(async move {
            let result = tokio_tungstenite::connect_async(&ws_url).await;
            let (ws_stream, _) = match result {
                Ok(r) => r,
                Err(e) => {
                    log::debug!("Preview WS connect failed (non-critical): {e}");
                    return;
                }
            };

            let (_write, mut read) = ws_stream.split();

            while let Some(msg) = read.next().await {
                match msg {
                    Ok(Message::Binary(data)) => {
                        if let Some(image_bytes) = extract_preview_from_binary(&data) {
                            let ext = detect_image_format(&image_bytes).unwrap_or("png");
                            let filename = match idx {
                                Some(i) => format!("preview_{}.{}", i, ext),
                                None => format!("preview.{}", ext),
                            };
                            if let Ok(url) = storage
                                .save_buffer(&gen_id, &filename, &image_bytes)
                                .await
                            {
                                // Emit preview event to frontend
                                if let Some(ref hub) = event_hub {
                                    hub.emit_generation_event(
                                        &crate::providers::generation_dispatch::GenerationEvent {
                                            generation_id: gen_id.clone(),
                                            status: "running".into(),
                                            error: None,
                                            assets: Some(vec![Asset {
                                                id: format!("preview-{}", gen_id),
                                                generation_id: gen_id.clone(),
                                                asset_type: "preview".into(),
                                                url,
                                                item_index: idx,
                                                created_at: crate::utils::time::now_iso(),
                                                is_active: false,
                                                prompt: None,
                                            }]),
                                        },
                                    );
                                }
                            }
                        }
                    }
                    Ok(Message::Close(_)) => break,
                    Err(_) => break,
                    _ => {}
                }
            }
        }))
    }
}

