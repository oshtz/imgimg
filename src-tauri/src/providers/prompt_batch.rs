//! Batch prompt generation via OpenRouter LLM.

use crate::error::AppResult;
use crate::providers::openrouter_proxy::OpenRouterProxy;

/// Request for batch prompt generation.
pub struct PromptBatchRequest {
    pub prompt_template: String,
    pub theme: String,
    pub delimiter: String,
    pub expected_count: usize,
    pub model: Option<String>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<u64>,
}

/// Generate a batch of prompts from a template and theme.
pub async fn generate(
    proxy: &OpenRouterProxy,
    request: &PromptBatchRequest,
) -> AppResult<Vec<String>> {
    let prompt = build_prompt_from_template(&request.prompt_template, &request.theme);

    let messages = vec![serde_json::json!({
        "role": "user",
        "content": prompt,
    })];

    let temperature = request.temperature.unwrap_or(1.0);
    let max_tokens = request.max_tokens.unwrap_or(8192);

    let result = proxy
        .chat_completion(
            &messages,
            request.model.as_deref(),
            Some(temperature),
            Some(max_tokens),
        )
        .await?;

    let prompts = split_delimited_prompts(&result, &request.delimiter);

    if prompts.len() < request.expected_count {
        log::warn!(
            "Prompt batch returned {} prompts, expected {}",
            prompts.len(),
            request.expected_count
        );
    }

    Ok(prompts)
}

/// Replace __PROMPT__ in the template with the theme.
pub fn build_prompt_from_template(template: &str, theme: &str) -> String {
    template.replace("__PROMPT__", theme)
}

/// Split a delimited response into individual prompts.
pub fn split_delimited_prompts(raw: &str, delimiter: &str) -> Vec<String> {
    // Normalize delimiter (handle escape sequences)
    let delim = delimiter
        .replace("\\n", "\n")
        .replace("\\r\\n", "\r\n")
        .replace("\\t", "\t");

    raw.split(&delim)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}
