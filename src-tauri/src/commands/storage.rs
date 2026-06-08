use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

/// Serve a storage file's bytes. The frontend uses this when asset:// protocol isn't available.
#[tauri::command]
pub async fn get_storage_file(
    state: State<'_, AppState>,
    url: String,
) -> AppResult<Vec<u8>> {
    state.storage.get_buffer(&url).await
}

/// Return the absolute path to the storage directory so the frontend can
/// build `asset://` protocol URLs via `convertFileSrc()`.
#[tauri::command]
pub async fn get_storage_base_path(
    state: State<'_, AppState>,
) -> AppResult<String> {
    Ok(state.storage_dir.to_string_lossy().to_string())
}

/// Open the storage directory in the OS file explorer.
#[tauri::command]
pub async fn open_storage_folder(
    state: State<'_, AppState>,
) -> AppResult<()> {
    let path = &state.storage_dir;
    opener::open(path).map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    Ok(())
}

/// Whether a URL is safe to hand to the OS opener. Only web URLs are allowed —
/// this guards against `file://`, `javascript:`, `data:`, etc. coming from
/// untrusted text (e.g. agent-generated chat messages).
fn is_allowed_external_url(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

/// Open an external URL in the user's default browser. Used for links inside
/// agent chat output so they don't navigate the app's own webview away.
#[tauri::command]
pub async fn open_external_url(url: String) -> AppResult<()> {
    if !is_allowed_external_url(&url) {
        return Err(crate::error::AppError::BadRequest(format!(
            "Refusing to open non-http(s) URL: {url}"
        )));
    }
    opener::open(&url).map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    Ok(())
}

/// Upload binary data to storage for a generation.
#[tauri::command]
pub async fn upload_to_storage(
    state: State<'_, AppState>,
    generation_id: String,
    filename: String,
    data: Vec<u8>,
) -> AppResult<String> {
    state
        .storage
        .save_buffer(&generation_id, &filename, &data)
        .await
}

#[cfg(test)]
mod tests {
    use super::is_allowed_external_url;

    #[test]
    fn allows_web_urls() {
        assert!(is_allowed_external_url("http://example.com"));
        assert!(is_allowed_external_url("https://example.com/path?q=1#frag"));
    }

    #[test]
    fn rejects_non_web_schemes() {
        assert!(!is_allowed_external_url("file:///etc/passwd"));
        assert!(!is_allowed_external_url("javascript:alert(1)"));
        assert!(!is_allowed_external_url("data:text/html,<script>1</script>"));
        assert!(!is_allowed_external_url("ftp://example.com"));
        assert!(!is_allowed_external_url(""));
    }
}
