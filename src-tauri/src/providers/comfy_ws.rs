//! WebSocket binary message parsing helpers for ComfyUI preview streaming.

/// Extract preview image bytes from a WebSocket binary message.
pub(crate) fn extract_preview_from_binary(raw: &[u8]) -> Option<Vec<u8>> {
    // Try to parse as a framed event first
    if let Some(payload) = try_parse_binary_framed_event(raw) {
        if let Some(img) = extract_image_bytes(&payload) {
            return Some(img);
        }
        // Try with type header offsets
        if payload.len() >= 4 {
            if let Some(img) = extract_image_bytes(&payload[4..]) {
                return Some(img);
            }
        }
        if payload.len() >= 8 {
            if let Some(img) = extract_image_bytes(&payload[8..]) {
                return Some(img);
            }
        }
        return None;
    }

    // Try directly on raw bytes
    if let Some(img) = extract_image_bytes(raw) {
        return Some(img);
    }

    // Try with offset for type header
    if raw.len() >= 4 {
        if let Some(img) = extract_image_bytes(&raw[4..]) {
            return Some(img);
        }
    }
    if raw.len() >= 8 {
        if let Some(img) = extract_image_bytes(&raw[8..]) {
            return Some(img);
        }
    }

    None
}

/// Try to parse a binary framed event: [length_header][event_name][payload]
fn try_parse_binary_framed_event(bytes: &[u8]) -> Option<Vec<u8>> {
    let event_name_re =
        regex::Regex::new(r"^[a-z0-9_:\-]{3,64}$").unwrap();

    // Format 1: 4-byte LE length header
    if bytes.len() >= 6 {
        let len = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
        if len > 0 && len < 256 && 4 + len <= bytes.len() {
            if let Ok(name) = std::str::from_utf8(&bytes[4..4 + len]) {
                if event_name_re.is_match(name) {
                    return Some(bytes[4 + len..].to_vec());
                }
            }
        }
    }

    // Format 2: 1-byte length header
    if bytes.len() >= 2 {
        let len = bytes[0] as usize;
        if len > 0 && len < 256 && 1 + len <= bytes.len() {
            if let Ok(name) = std::str::from_utf8(&bytes[1..1 + len]) {
                if event_name_re.is_match(name) {
                    return Some(bytes[1 + len..].to_vec());
                }
            }
        }
    }

    None
}

/// Search for known image signatures in a byte slice and return the image data.
fn extract_image_bytes(bytes: &[u8]) -> Option<Vec<u8>> {
    // PNG
    let png_sig: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    if let Some(pos) = find_subsequence(bytes, png_sig) {
        return Some(bytes[pos..].to_vec());
    }

    // JPEG
    let jpeg_sig: &[u8] = &[0xFF, 0xD8, 0xFF];
    if let Some(pos) = find_subsequence(bytes, jpeg_sig) {
        return Some(bytes[pos..].to_vec());
    }

    // WebP (RIFF....WEBP)
    let riff_sig: &[u8] = b"RIFF";
    if let Some(pos) = find_subsequence(bytes, riff_sig) {
        if pos + 12 <= bytes.len() && &bytes[pos + 8..pos + 12] == b"WEBP" {
            return Some(bytes[pos..].to_vec());
        }
    }

    None
}

/// Find the first occurrence of a subsequence in a byte slice.
fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── find_subsequence ──

    #[test]
    fn find_subsequence_basic_match() {
        let haystack = b"hello world";
        assert_eq!(find_subsequence(haystack, b"world"), Some(6));
    }

    #[test]
    fn find_subsequence_at_start() {
        assert_eq!(find_subsequence(b"abcdef", b"abc"), Some(0));
    }

    #[test]
    fn find_subsequence_no_match() {
        assert_eq!(find_subsequence(b"hello", b"xyz"), None);
    }

    #[test]
    #[should_panic(expected = "window size must be non-zero")]
    fn find_subsequence_empty_needle_panics() {
        // windows(0) panics in std
        find_subsequence(b"hello", b"");
    }

    #[test]
    fn find_subsequence_needle_longer_than_haystack() {
        assert_eq!(find_subsequence(b"hi", b"hello world"), None);
    }

    #[test]
    fn find_subsequence_returns_first_occurrence() {
        assert_eq!(find_subsequence(b"abcabc", b"abc"), Some(0));
    }

    // ── extract_image_bytes ──

    #[test]
    fn extract_image_bytes_png() {
        let png_sig: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        let mut data = vec![0x00, 0x00]; // garbage prefix
        data.extend_from_slice(png_sig);
        data.extend_from_slice(b"IDAT chunk data");

        let result = extract_image_bytes(&data).unwrap();
        assert_eq!(&result[..8], png_sig);
        assert_eq!(result.len(), png_sig.len() + b"IDAT chunk data".len());
    }

    #[test]
    fn extract_image_bytes_jpeg() {
        let mut data = vec![0x00];
        data.extend_from_slice(&[0xFF, 0xD8, 0xFF, 0xE0]);
        data.extend_from_slice(b"jpeg body");

        let result = extract_image_bytes(&data).unwrap();
        assert_eq!(result[0], 0xFF);
        assert_eq!(result[1], 0xD8);
    }

    #[test]
    fn extract_image_bytes_webp() {
        let mut data = Vec::new();
        data.extend_from_slice(b"RIFF");
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // file size placeholder
        data.extend_from_slice(b"WEBP");
        data.extend_from_slice(b"VP8 data here");

        let result = extract_image_bytes(&data).unwrap();
        assert_eq!(&result[..4], b"RIFF");
        assert_eq!(&result[8..12], b"WEBP");
    }

    #[test]
    fn extract_image_bytes_no_valid_header() {
        let data = b"just some random text data with no image header";
        assert!(extract_image_bytes(data).is_none());
    }

    #[test]
    fn extract_image_bytes_riff_without_webp() {
        let mut data = Vec::new();
        data.extend_from_slice(b"RIFF");
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]);
        data.extend_from_slice(b"AVI "); // AVI, not WEBP
        data.extend_from_slice(b"more data");

        assert!(extract_image_bytes(&data).is_none());
    }

    // ── try_parse_binary_framed_event ──

    #[test]
    fn try_parse_binary_framed_event_4byte_header() {
        let event_name = b"preview";
        let payload = b"image_data_here";
        let mut msg = Vec::new();
        msg.extend_from_slice(&(event_name.len() as u32).to_le_bytes());
        msg.extend_from_slice(event_name);
        msg.extend_from_slice(payload);

        let result = try_parse_binary_framed_event(&msg).unwrap();
        assert_eq!(result, payload);
    }

    #[test]
    fn try_parse_binary_framed_event_1byte_header() {
        let event_name = b"preview";
        let payload = b"some_payload";
        let mut msg = Vec::new();
        msg.push(event_name.len() as u8);
        msg.extend_from_slice(event_name);
        msg.extend_from_slice(payload);

        let result = try_parse_binary_framed_event(&msg).unwrap();
        assert_eq!(result, payload);
    }

    #[test]
    fn try_parse_binary_framed_event_no_valid_frame() {
        // Binary data that doesn't match any frame format
        let data = vec![0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
        assert!(try_parse_binary_framed_event(&data).is_none());
    }

    // ── extract_preview_from_binary ──

    #[test]
    fn extract_preview_from_binary_direct_png() {
        let png_sig: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        let mut data = Vec::new();
        data.extend_from_slice(png_sig);
        data.extend_from_slice(b"png body");

        let result = extract_preview_from_binary(&data).unwrap();
        assert_eq!(&result[..8], png_sig);
    }

    #[test]
    fn extract_preview_from_binary_with_4byte_offset() {
        let png_sig: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        let mut data = vec![0x01, 0x00, 0x00, 0x00]; // 4-byte type header
        data.extend_from_slice(png_sig);
        data.extend_from_slice(b"png body");

        let result = extract_preview_from_binary(&data).unwrap();
        assert_eq!(&result[..8], png_sig);
    }

    #[test]
    fn extract_preview_from_binary_no_image() {
        let data = b"not an image at all";
        assert!(extract_preview_from_binary(data).is_none());
    }

    #[test]
    fn extract_preview_from_binary_framed_with_png() {
        let png_sig: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        let event_name = b"preview";
        let mut msg = Vec::new();
        msg.push(event_name.len() as u8);
        msg.extend_from_slice(event_name);
        msg.extend_from_slice(png_sig);
        msg.extend_from_slice(b"image data");

        let result = extract_preview_from_binary(&msg).unwrap();
        assert_eq!(&result[..8], png_sig);
    }
}
