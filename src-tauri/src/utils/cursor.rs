use base64::{engine::general_purpose::STANDARD, Engine};

use crate::db::models::GalleryCursor;

/// Encode a gallery cursor to a base64 string for the frontend.
pub fn encode_cursor(cursor: &GalleryCursor) -> String {
    let json = serde_json::to_string(cursor).unwrap_or_default();
    STANDARD.encode(json.as_bytes())
}

/// Decode a base64-encoded cursor string from the frontend.
pub fn decode_cursor(encoded: &str) -> Option<GalleryCursor> {
    let bytes = STANDARD.decode(encoded).ok()?;
    let json = String::from_utf8(bytes).ok()?;
    serde_json::from_str(&json).ok()
}
