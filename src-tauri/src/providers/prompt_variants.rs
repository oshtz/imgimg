//! Prompt variant generation via OpenRouter LLM.

use crate::error::{AppError, AppResult};
use crate::providers::openrouter_proxy::OpenRouterProxy;

const SYSTEM_TEMPLATE: &str = r#"You are an expert image prompt engineer. Your task is to generate multiple distinct prompt variations from a single original prompt.

{GUIDANCE}

Rules:
1. Each variant must be a complete, standalone image generation prompt — not a diff or partial edit.
2. Keep the same general prompt style and format as the original.
3. Do NOT add conversational text, numbering, labels, or explanations.
4. Do NOT wrap prompts in quotes.
5. Maintain the same level of technical detail as the original prompt.
6. If the original prompt mentions specific named characters or IPs, keep those names in all variants.
7. Output ONLY valid JSON: an array of strings, one per variant.
8. The array length must exactly match the requested count.

Respond with ONLY the JSON array, nothing else."#;

const SUBTLE_GUIDANCE: &str = "Generate SUBTLE variations of the original prompt. Keep the core subject, composition, and style very close to the original. Only vary minor details such as slight lighting changes, minor color shifts, small background elements, or subtle texture differences. Each variant should be clearly recognizable as the same concept.";

const MODERATE_GUIDANCE: &str = "Generate MODERATE variations of the original prompt. Keep the main subject but explore different interpretations. Vary the lighting, composition, atmosphere, color palette, camera angle, or time of day. Each variant should share the core concept but feel like a meaningfully different take on it.";

const BOLD_GUIDANCE: &str = "Generate BOLD, CREATIVE variations of the original prompt. Take significant creative liberties — reimagine the concept from different perspectives, moods, and visual styles. Vary dramatically: different camera angles, extreme lighting changes, altered atmospheres, unexpected compositions, or shifted emotional tones. Each variant should feel like a fresh creative interpretation while still being thematically connected to the original.";

/// Generate prompt variants with a given creativity level (0.0–1.0).
pub async fn generate(
    proxy: &OpenRouterProxy,
    prompt: &str,
    count: usize,
    creativity: f64,
    model: Option<&str>,
) -> AppResult<Vec<String>> {
    let count = count.clamp(1, 8);
    let creativity = creativity.clamp(0.0, 1.0);

    let guidance = if creativity <= 0.3 {
        SUBTLE_GUIDANCE
    } else if creativity <= 0.7 {
        MODERATE_GUIDANCE
    } else {
        BOLD_GUIDANCE
    };

    let system_prompt = SYSTEM_TEMPLATE.replace("{GUIDANCE}", guidance);
    let temperature = 0.3 + (creativity * 0.7);

    let messages = vec![
        serde_json::json!({
            "role": "system",
            "content": system_prompt,
        }),
        serde_json::json!({
            "role": "user",
            "content": format!("Generate exactly {} variations of this prompt:\n\n{}", count, prompt.trim()),
        }),
    ];

    let result = proxy
        .chat_completion(&messages, model, Some(temperature), Some(4096))
        .await?;

    let mut variants = parse_variants(&result, count)?;

    // If the LLM returned fewer variants than requested, pad with the original prompt
    // so the caller always gets the expected count.
    if variants.len() < count {
        log::warn!(
            "LLM returned {} variants but {} were requested, padding with original prompt",
            variants.len(),
            count
        );
        while variants.len() < count {
            variants.push(prompt.trim().to_string());
        }
    }

    Ok(variants)
}

/// Parse the LLM response into a vector of variant strings.
fn parse_variants(raw: &str, expected_count: usize) -> AppResult<Vec<String>> {
    // Strip markdown code fences if present
    let cleaned = raw
        .trim()
        .strip_prefix("```json")
        .or_else(|| raw.trim().strip_prefix("```"))
        .unwrap_or(raw.trim());
    let cleaned = cleaned.strip_suffix("```").unwrap_or(cleaned).trim();

    // Try JSON parse first
    if let Ok(arr) = serde_json::from_str::<Vec<String>>(cleaned) {
        let variants: Vec<String> = arr
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .take(expected_count)
            .collect();
        if !variants.is_empty() {
            return Ok(variants);
        }
    }

    // Fallback: try parsing as serde_json::Value array
    if let Ok(serde_json::Value::Array(arr)) = serde_json::from_str::<serde_json::Value>(cleaned) {
        let variants: Vec<String> = arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty())
            .take(expected_count)
            .collect();
        if !variants.is_empty() {
            return Ok(variants);
        }
    }

    // Fallback: split by newlines, strip numbering
    let re = regex::Regex::new(r"^\d+[\.\)]\s*").unwrap();
    let variants: Vec<String> = cleaned
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            let stripped = re.replace(trimmed, "").to_string();
            stripped.trim_matches('"').trim().to_string()
        })
        .filter(|s| !s.is_empty())
        .take(expected_count)
        .collect();

    if variants.is_empty() {
        return Err(AppError::ProviderError(
            "Failed to parse prompt variants from LLM response".into(),
        ));
    }

    Ok(variants)
}
