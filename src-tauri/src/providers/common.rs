use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::de::DeserializeOwned;

use crate::error::{AppError, AppResult};

// ── HTTP Helpers ──

/// Perform an HTTP GET and deserialize JSON response.
pub async fn get_json<T: DeserializeOwned>(
    client: &reqwest::Client,
    url: &str,
    headers: Option<HeaderMap>,
    timeout_ms: u64,
) -> AppResult<T> {
    let mut req = client.get(url);
    if let Some(h) = headers {
        req = req.headers(h);
    }
    if timeout_ms > 0 {
        req = req.timeout(Duration::from_millis(timeout_ms));
    }
    let resp = req.send().await?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::ProviderError(format!(
            "HTTP {status} from {url}: {body}"
        )));
    }
    let data = resp.json::<T>().await?;
    Ok(data)
}

/// Perform an HTTP POST with JSON body and deserialize response.
pub async fn post_json<T: DeserializeOwned>(
    client: &reqwest::Client,
    url: &str,
    headers: Option<HeaderMap>,
    body: &serde_json::Value,
    timeout_ms: u64,
) -> AppResult<T> {
    let mut req = client.post(url).json(body);
    if let Some(h) = headers {
        req = req.headers(h);
    }
    if timeout_ms > 0 {
        req = req.timeout(Duration::from_millis(timeout_ms));
    }
    let resp = req.send().await?;
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return Err(AppError::ProviderError(format!(
            "HTTP {status} from POST {url}: {body_text}"
        )));
    }
    let data = resp.json::<T>().await?;
    Ok(data)
}

/// Download raw bytes from a URL with optional auth headers.
pub async fn download_bytes(
    client: &reqwest::Client,
    url: &str,
    headers: Option<HeaderMap>,
    timeout_ms: u64,
) -> AppResult<(Vec<u8>, String)> {
    let mut req = client.get(url);
    if let Some(h) = headers {
        req = req.headers(h);
    }
    if timeout_ms > 0 {
        req = req.timeout(Duration::from_millis(timeout_ms));
    }
    let resp = req.send().await?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::ProviderError(format!(
            "HTTP {status} downloading {url}: {body}"
        )));
    }
    let content_type = resp
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let bytes = resp.bytes().await?.to_vec();
    Ok((bytes, content_type))
}

// ── Data URL ──

/// Parse a data URL into (bytes, content_type).
/// Supports `data:<mime>;base64,<data>` format.
pub fn parse_data_url(data_url: &str) -> AppResult<(Vec<u8>, String)> {
    let stripped = data_url
        .strip_prefix("data:")
        .ok_or_else(|| AppError::BadRequest("Not a data URL".into()))?;

    let (mime, encoded) = stripped
        .split_once(";base64,")
        .ok_or_else(|| AppError::BadRequest("Data URL missing ;base64, marker".into()))?;

    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
        .map_err(|e| AppError::BadRequest(format!("Invalid base64 in data URL: {e}")))?;

    Ok((bytes, mime.to_string()))
}

/// Build a data URL from bytes and content type.
pub fn build_data_url(bytes: &[u8], content_type: &str) -> String {
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:{content_type};base64,{encoded}")
}

// ── Content Type / Extension ──

/// Infer MIME content type from a file extension.
pub fn infer_content_type(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        _ => "application/octet-stream",
    }
}

/// Infer file extension from a content type string.
pub fn extension_from_content_type(content_type: &str) -> &'static str {
    let ct = content_type.split(';').next().unwrap_or(content_type).trim();
    match ct {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/svg+xml" => "svg",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        "audio/mpeg" => "mp3",
        "audio/wav" => "wav",
        "audio/ogg" => "ogg",
        _ => "bin",
    }
}

/// Detect image format from first few bytes (magic numbers).
pub fn detect_image_format(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() < 4 {
        return None;
    }
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.starts_with(b"RIFF") && bytes.len() >= 12 && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else if bytes.starts_with(b"GIF8") {
        Some("gif")
    } else {
        None
    }
}

// ── Auth header builders ──

/// Build a Bearer auth header map.
/// Returns an error if the token contains characters that can't be sent in an HTTP header
/// (non-visible ASCII, control chars). The user sees "API token contains invalid characters"
/// instead of a panic when they paste a corrupted key.
pub fn bearer_headers(token: &str) -> AppResult<HeaderMap> {
    let mut headers = HeaderMap::new();
    let value = HeaderValue::from_str(&format!("Bearer {token}"))
        .map_err(|_| AppError::BadRequest("API token contains invalid characters".into()))?;
    headers.insert(reqwest::header::AUTHORIZATION, value);
    Ok(headers)
}

/// Build a Key auth header map (used by fal.ai). See `bearer_headers` for error semantics.
pub fn key_headers(api_key: &str) -> AppResult<HeaderMap> {
    let mut headers = HeaderMap::new();
    let value = HeaderValue::from_str(&format!("Key {api_key}"))
        .map_err(|_| AppError::BadRequest("API key contains invalid characters".into()))?;
    headers.insert(reqwest::header::AUTHORIZATION, value);
    Ok(headers)
}

// ── Polling helper ──

/// Poll a URL until a condition is met or timeout expires.
pub async fn poll_until<T, F>(
    client: &reqwest::Client,
    url: &str,
    headers: Option<HeaderMap>,
    timeout_ms: u64,
    poll_interval_ms: u64,
    check: F,
) -> AppResult<T>
where
    T: DeserializeOwned,
    F: Fn(&T) -> PollResult,
{
    let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms);

    loop {
        let data: T = get_json(client, url, headers.clone(), timeout_ms).await?;

        match check(&data) {
            PollResult::Done => return Ok(data),
            PollResult::Failed(msg) => {
                return Err(AppError::ProviderError(msg));
            }
            PollResult::Continue => {}
        }

        if tokio::time::Instant::now() >= deadline {
            return Err(AppError::Timeout(format!(
                "Polling timed out after {timeout_ms}ms for {url}"
            )));
        }

        tokio::time::sleep(Duration::from_millis(poll_interval_ms)).await;
    }
}

pub enum PollResult {
    Done,
    Continue,
    Failed(String),
}

// ── Timestamp helper for unique filenames ──

/// Generate a timestamp suffix for unique filenames (milliseconds since epoch).
pub fn timestamp_suffix() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
