//! OpenRouter image generation and URL extraction helpers.

use std::time::Duration;

use crate::config::AppConfig;
use crate::db::models::Asset;
use crate::error::{AppError, AppResult};
use crate::providers::common::{
    bearer_headers, detect_image_format, download_asset, download_bytes,
    extension_from_content_type, MAX_PROVIDER_ASSET_BYTES,
};
use crate::services::storage::LocalStorage;

/// Parameters for image generation.
pub struct ImageGenParams {
    pub prompt: String,
    pub prompts: Option<Vec<String>>,
    pub batch_size: i64,
    pub aspect_ratio: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub seed: Option<i64>,
    pub requested_filenames: Vec<String>,
    pub generation_id: String,
    pub image: Option<String>,
    pub images: Option<Vec<String>>,
    pub system_prompt: Option<String>,
    pub start_item_index: Option<i64>,
    pub model: Option<String>,
}

/// Returns true for models that only output images (no text).
fn is_image_only_model(model: &str) -> bool {
    let m = model.to_lowercase();
    m.contains("flux")
        || m.contains("sourceful")
        || m.contains("dall-e")
        || m.contains("stable-diffusion")
        || m.contains("midjourney")
}

/// Generate a single image via OpenRouter and store it.
pub(crate) async fn generate_single_image(
    client: &reqwest::Client,
    config: &AppConfig,
    storage: &LocalStorage,
    api_key: &str,
    model: &str,
    prompt: &str,
    aspect_ratio: Option<&str>,
    image: Option<&str>,
    images: Option<&[String]>,
    system_prompt: Option<&str>,
    is_gemini: bool,
    generation_id: &str,
    item_index: Option<i64>,
    filename: &str,
) -> AppResult<Asset> {
    let url = format!("{}/chat/completions", config.openrouter_base_url);

    // Build messages
    let mut messages = Vec::new();

    if let Some(sys) = system_prompt {
        messages.push(serde_json::json!({
            "role": "system",
            "content": sys,
        }));
    }

    // Build user message content
    let text_content = if let Some(ar) = aspect_ratio {
        let prefix = aspect_ratio_prefix(ar);
        format!("{}{}", prefix, prompt)
    } else {
        prompt.to_string()
    };

    let has_images = image.is_some() || images.map(|i| !i.is_empty()).unwrap_or(false);

    if has_images {
        // Multimodal message
        let mut content_parts = vec![serde_json::json!({
            "type": "text",
            "text": text_content,
        })];

        if let Some(img_url) = image {
            content_parts.push(serde_json::json!({
                "type": "image_url",
                "image_url": { "url": img_url },
            }));
        }

        if let Some(imgs) = images {
            for img_url in imgs {
                content_parts.push(serde_json::json!({
                    "type": "image_url",
                    "image_url": { "url": img_url },
                }));
            }
        }

        messages.push(serde_json::json!({
            "role": "user",
            "content": content_parts,
        }));
    } else {
        messages.push(serde_json::json!({
            "role": "user",
            "content": text_content,
        }));
    }

    let modalities = if is_image_only_model(model) {
        serde_json::json!(["image"])
    } else {
        serde_json::json!(["image", "text"])
    };

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "modalities": modalities,
    });

    if is_gemini {
        if let Some(ar) = aspect_ratio {
            body["image_config"] = serde_json::json!({
                "aspect_ratio": ar,
                "image_size": "1K",
            });
        }
    }

    log::info!(
        "OpenRouter image request: model={}, modalities={}",
        model,
        body["modalities"]
    );

    let resp = client
        .post(&url)
        .headers(bearer_headers(api_key)?)
        .header("X-Title", "imgimg")
        .json(&body)
        .timeout(Duration::from_millis(config.openrouter_timeout_ms))
        .send()
        .await?;

    if !resp.status().is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        // Try to extract a human-readable error message from the JSON
        let friendly_msg = serde_json::from_str::<serde_json::Value>(&body_text)
            .ok()
            .and_then(|v| {
                // Check for moderation/provider errors with metadata
                if let Some(raw) = v["error"]["metadata"]["raw"].as_str() {
                    if let Ok(inner) = serde_json::from_str::<serde_json::Value>(raw) {
                        if let Some(status) = inner["status"].as_str() {
                            let details = inner["details"]
                                .as_object()
                                .map(|d| format!("{:?}", d))
                                .unwrap_or_default();
                            return Some(format!(
                                "{}{}",
                                status,
                                if details.is_empty() {
                                    String::new()
                                } else {
                                    format!(": {}", details)
                                }
                            ));
                        }
                    }
                }
                v["error"]["message"].as_str().map(|s| s.to_string())
            })
            .unwrap_or_else(|| body_text.clone());
        return Err(AppError::ProviderError(friendly_msg));
    }

    let data: serde_json::Value = resp.json().await?;

    // Debug: log response structure to diagnose missing images
    if let Some(choices) = data["choices"].as_array() {
        for (ci, choice) in choices.iter().enumerate() {
            let msg = &choice["message"];
            let content_type = if msg["content"].is_string() {
                "string"
            } else if msg["content"].is_array() {
                "array"
            } else if msg["content"].is_null() {
                "null"
            } else {
                "other"
            };
            let has_images = !msg["images"].is_null();
            log::info!(
                "OpenRouter response choice[{ci}]: content_type={content_type}, has_images={has_images}, keys={:?}",
                msg.as_object().map(|o| o.keys().collect::<Vec<_>>())
            );
            if has_images {
                log::info!("OpenRouter images field: {}", msg["images"]);
            }
            // Log first 500 chars of content for debugging
            let content_preview = msg["content"].to_string();
            let preview_len = content_preview.len().min(500);
            log::info!(
                "OpenRouter content preview: {}",
                &content_preview[..preview_len]
            );
        }
    }

    let image_urls = extract_image_urls(&data);

    let image_url = image_urls.first().ok_or_else(|| {
        log::warn!("OpenRouter: No images extracted. Full response: {}", data);
        AppError::ProviderError("No image in OpenRouter response".into())
    })?;

    if image_url.starts_with("http://") || image_url.starts_with("https://") {
        return download_asset(
            client,
            storage,
            image_url,
            None,
            30_000,
            generation_id,
            "image",
            item_index,
            filename,
        )
        .await;
    }

    // Resolve inline image data.
    let (bytes, ext) = resolve_image_data(client, image_url).await?;
    if bytes.len() as u64 > MAX_PROVIDER_ASSET_BYTES {
        return Err(AppError::ProviderError(format!(
            "Provider asset exceeds the {} MiB download limit",
            MAX_PROVIDER_ASSET_BYTES / (1024 * 1024)
        )));
    }

    let final_filename = if filename.ends_with(".png") || filename.ends_with(".jpg") {
        let base = &filename[..filename.len() - 4];
        format!("{}.{}", base, ext)
    } else {
        format!("{}.{}", filename, ext)
    };

    storage
        .write_binary_asset(generation_id, "image", item_index, &final_filename, &bytes)
        .await
}

/// Extract image URLs from an OpenRouter chat completion response.
pub(crate) fn extract_image_urls(data: &serde_json::Value) -> Vec<String> {
    let mut urls: Vec<String> = Vec::new();

    // Check choices[].message.content for data URLs / HTTP URLs
    if let Some(choices) = data["choices"].as_array() {
        for choice in choices {
            if let Some(content) = choice["message"]["content"].as_str() {
                extract_urls_from_text(content, &mut urls);
            } else if let Some(content_arr) = choice["message"]["content"].as_array() {
                // Content may be an array of parts (multimodal response)
                for part in content_arr {
                    if let Some(text) = part["text"].as_str() {
                        extract_urls_from_text(text, &mut urls);
                    }
                    // Check for image_url parts in content array
                    if let Some(url) = part["image_url"]["url"].as_str() {
                        urls.push(url.to_string());
                    }
                }
            }

            // Check message.images array
            if let Some(images) = choice["message"]["images"].as_array() {
                for img in images {
                    if let Some(url) = img.as_str() {
                        urls.push(url.to_string());
                    } else if let Some(url) = img["image_url"]["url"].as_str() {
                        // OpenRouter format: {"type":"image_url","image_url":{"url":"data:image/..."}}
                        urls.push(url.to_string());
                    } else if let Some(url) = img["imageUrl"]["url"].as_str() {
                        urls.push(url.to_string());
                    } else if let Some(url) = img["url"].as_str() {
                        urls.push(url.to_string());
                    } else if let Some(b64) = img["b64_json"].as_str() {
                        urls.push(format!("data:image/png;base64,{}", b64));
                    }
                }
            }
        }
    }

    // Check data[] array format
    if let Some(data_arr) = data["data"].as_array() {
        for item in data_arr {
            if let Some(url) = item["url"].as_str() {
                urls.push(url.to_string());
            } else if let Some(b64) = item["b64_json"].as_str() {
                urls.push(format!("data:image/png;base64,{}", b64));
            }
        }
    }

    // Deduplicate
    urls.sort();
    urls.dedup();
    urls
}

/// Resolve an image URL/data URI to bytes and extension.
pub(crate) async fn resolve_image_data(
    client: &reqwest::Client,
    url: &str,
) -> AppResult<(Vec<u8>, &'static str)> {
    if url.starts_with("data:") {
        let (bytes, _content_type) = crate::providers::common::parse_data_url(url)?;
        let ext = detect_image_format(&bytes).unwrap_or("png");
        return Ok((bytes, ext));
    }

    if url.starts_with("http://") || url.starts_with("https://") {
        let (bytes, ct) = download_bytes(client, url, None, 30_000).await?;
        let ext = detect_image_format(&bytes).unwrap_or_else(|| extension_from_content_type(&ct));
        return Ok((bytes, ext));
    }

    // Try as loose base64
    if url.len() >= 128 && looks_like_base64(url) {
        use base64::Engine;
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(url) {
            let ext = detect_image_format(&bytes).unwrap_or("png");
            return Ok((bytes, ext));
        }
    }

    Err(AppError::ProviderError(format!(
        "Cannot resolve image data from: {}...",
        &url[..url.len().min(80)]
    )))
}

fn looks_like_image_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".webp")
        || lower.ends_with(".gif")
        || lower.contains("/image")
}

fn looks_like_base64(s: &str) -> bool {
    s.len() >= 128
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')
}

fn extract_urls_from_text(text: &str, urls: &mut Vec<String>) {
    // Look for data:image URLs
    for part in text.split("data:image/") {
        if part.contains(";base64,") {
            let data_url = format!(
                "data:image/{}",
                part.split_whitespace().next().unwrap_or(part)
            );
            let cleaned = data_url.trim_end_matches([')', '"', '\'', ']']);
            urls.push(cleaned.to_string());
        }
    }

    // Look for HTTPS image URLs
    for part in text.split("https://") {
        let url = format!("https://{}", part.split_whitespace().next().unwrap_or(part));
        let cleaned = url.trim_end_matches([')', '"', '\'', ']']);
        if looks_like_image_url(cleaned) {
            urls.push(cleaned.to_string());
        }
    }
}

fn aspect_ratio_prefix(ar: &str) -> &'static str {
    match ar {
        "16:9" => "Create a wide horizontal 16:9 landscape image of ",
        "9:16" => "Create a tall vertical 9:16 portrait image of ",
        "4:3" => "Create a 4:3 landscape image of ",
        "3:4" => "Create a 3:4 portrait image of ",
        "3:2" => "Create a 3:2 landscape image of ",
        "2:3" => "Create a 2:3 portrait image of ",
        "21:9" => "Create an ultrawide 21:9 panoramic image of ",
        _ => "",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ── looks_like_base64 ──

    #[test]
    fn looks_like_base64_valid() {
        let s = "A".repeat(200);
        assert!(looks_like_base64(&s));
    }

    #[test]
    fn looks_like_base64_with_special_chars() {
        let mut s = "abcABC012+/=".repeat(20);
        while s.len() < 128 {
            s.push('A');
        }
        assert!(looks_like_base64(&s));
    }

    #[test]
    fn looks_like_base64_too_short() {
        assert!(!looks_like_base64("abc"));
    }

    #[test]
    fn looks_like_base64_contains_spaces() {
        let s = format!("{}hello world{}", "A".repeat(64), "B".repeat(64));
        assert!(!looks_like_base64(&s));
    }

    #[test]
    fn looks_like_base64_url_is_not_base64() {
        assert!(!looks_like_base64("https://example.com/image.png"));
    }

    // ── looks_like_image_url ──

    #[test]
    fn looks_like_image_url_png() {
        assert!(looks_like_image_url("https://example.com/photo.png"));
    }

    #[test]
    fn looks_like_image_url_jpg() {
        assert!(looks_like_image_url("https://example.com/photo.jpg"));
    }

    #[test]
    fn looks_like_image_url_jpeg() {
        assert!(looks_like_image_url("https://example.com/photo.jpeg"));
    }

    #[test]
    fn looks_like_image_url_webp() {
        assert!(looks_like_image_url("https://example.com/photo.webp"));
    }

    #[test]
    fn looks_like_image_url_gif() {
        assert!(looks_like_image_url("https://cdn.example.com/anim.gif"));
    }

    #[test]
    fn looks_like_image_url_with_image_path() {
        assert!(looks_like_image_url("https://api.example.com/image/12345"));
    }

    #[test]
    fn looks_like_image_url_non_image() {
        assert!(!looks_like_image_url("https://example.com/document.pdf"));
    }

    #[test]
    fn looks_like_image_url_case_insensitive() {
        assert!(looks_like_image_url("https://example.com/PHOTO.PNG"));
    }

    // ── extract_urls_from_text ──

    #[test]
    fn extract_urls_from_text_data_url() {
        let text = "Here is an image: data:image/png;base64,iVBORw0KGgo= end";
        let mut urls = Vec::new();
        extract_urls_from_text(text, &mut urls);
        assert_eq!(urls.len(), 1);
        assert!(urls[0].starts_with("data:image/png;base64,"));
    }

    #[test]
    fn extract_urls_from_text_https_image_url() {
        let text = "Check this: https://cdn.example.com/photo.png done";
        let mut urls = Vec::new();
        extract_urls_from_text(text, &mut urls);
        assert_eq!(urls.len(), 1);
        assert_eq!(urls[0], "https://cdn.example.com/photo.png");
    }

    #[test]
    fn extract_urls_from_text_markdown_image() {
        let text = "![alt](https://example.com/image.jpg)";
        let mut urls = Vec::new();
        extract_urls_from_text(text, &mut urls);
        assert_eq!(urls.len(), 1);
        // The trailing ) should be trimmed
        assert!(urls[0].ends_with(".jpg"));
    }

    #[test]
    fn extract_urls_from_text_non_image_url_skipped() {
        let text = "Visit https://example.com/page.html for info";
        let mut urls = Vec::new();
        extract_urls_from_text(text, &mut urls);
        assert!(urls.is_empty());
    }

    #[test]
    fn extract_urls_from_text_multiple_urls() {
        let text = "Here: https://a.com/1.png and https://b.com/2.webp ok";
        let mut urls = Vec::new();
        extract_urls_from_text(text, &mut urls);
        assert_eq!(urls.len(), 2);
    }

    #[test]
    fn extract_urls_from_text_empty_string() {
        let mut urls = Vec::new();
        extract_urls_from_text("", &mut urls);
        assert!(urls.is_empty());
    }

    #[test]
    fn extract_urls_from_text_no_urls() {
        let mut urls = Vec::new();
        extract_urls_from_text("just some plain text with no links", &mut urls);
        assert!(urls.is_empty());
    }

    // ── aspect_ratio_prefix ──

    #[test]
    fn aspect_ratio_prefix_16_9() {
        let prefix = aspect_ratio_prefix("16:9");
        assert!(prefix.contains("16:9"));
        assert!(prefix.contains("landscape"));
    }

    #[test]
    fn aspect_ratio_prefix_9_16() {
        let prefix = aspect_ratio_prefix("9:16");
        assert!(prefix.contains("9:16"));
        assert!(prefix.contains("portrait"));
    }

    #[test]
    fn aspect_ratio_prefix_1_1_unknown() {
        assert_eq!(aspect_ratio_prefix("1:1"), "");
    }

    #[test]
    fn aspect_ratio_prefix_empty() {
        assert_eq!(aspect_ratio_prefix(""), "");
    }

    #[test]
    fn aspect_ratio_prefix_21_9() {
        let prefix = aspect_ratio_prefix("21:9");
        assert!(prefix.contains("ultrawide"));
        assert!(prefix.contains("panoramic"));
    }

    // ── extract_image_urls ──

    #[test]
    fn extract_image_urls_from_string_content() {
        let data = json!({
            "choices": [{
                "message": {
                    "content": "Here is your image: https://cdn.example.com/result.png"
                }
            }]
        });
        let urls = extract_image_urls(&data);
        assert_eq!(urls.len(), 1);
        assert!(urls[0].contains("result.png"));
    }

    #[test]
    fn extract_image_urls_from_array_content() {
        let data = json!({
            "choices": [{
                "message": {
                    "content": [
                        { "type": "image_url", "image_url": { "url": "https://img.example.com/a.png" } },
                        { "type": "text", "text": "Here is the image" }
                    ]
                }
            }]
        });
        let urls = extract_image_urls(&data);
        assert_eq!(urls.len(), 1);
        assert!(urls[0].contains("a.png"));
    }

    #[test]
    fn extract_image_urls_from_images_field() {
        let data = json!({
            "choices": [{
                "message": {
                    "content": "done",
                    "images": ["https://img.example.com/photo.jpg"]
                }
            }]
        });
        let urls = extract_image_urls(&data);
        assert_eq!(urls.len(), 1);
    }

    #[test]
    fn extract_image_urls_from_data_array() {
        let data = json!({
            "data": [
                { "url": "https://img.example.com/gen1.png" },
                { "b64_json": "iVBORw0KGgoAAAANS==" }
            ]
        });
        let urls = extract_image_urls(&data);
        assert_eq!(urls.len(), 2);
        assert!(urls.iter().any(|u| u.contains("gen1.png")));
        assert!(urls.iter().any(|u| u.starts_with("data:image/png;base64,")));
    }

    #[test]
    fn extract_image_urls_empty_response() {
        let data = json!({ "choices": [] });
        let urls = extract_image_urls(&data);
        assert!(urls.is_empty());
    }

    #[test]
    fn extract_image_urls_deduplicates() {
        let data = json!({
            "choices": [{
                "message": {
                    "content": "https://img.example.com/photo.png and https://img.example.com/photo.png"
                }
            }]
        });
        let urls = extract_image_urls(&data);
        assert_eq!(urls.len(), 1);
    }

    #[test]
    fn extract_image_urls_b64_in_images_field() {
        let data = json!({
            "choices": [{
                "message": {
                    "content": "",
                    "images": [
                        { "b64_json": "abc123==" }
                    ]
                }
            }]
        });
        let urls = extract_image_urls(&data);
        assert_eq!(urls.len(), 1);
        assert!(urls[0].starts_with("data:image/png;base64,"));
    }
}
