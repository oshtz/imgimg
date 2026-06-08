//! Prompt enhancement via OpenRouter LLM.

use crate::error::AppResult;
use crate::providers::openrouter_proxy::OpenRouterProxy;
use crate::services::event_hub::EventHub;

const DEFAULT_SYSTEM_PROMPT: &str = r#"You are an expert image prompt engineer specializing in creating detailed, technical descriptions for stable diffusion models. Your task is to enhance and expand the given prompt, making it as detailed and specific as possible while adhering to the following guidelines:

1. Read the prompt carefully and consider all elements described.
2. If the prompt is in any non-english language, translate it to English. All output must be in English only.
3. Create a highly detailed, technical description for image generation. Your enhanced prompt should:
    - Contain at least 20 lines of details
    - Separate individual instructions with commas
    - Be direct and specific, avoiding unnecessary words
    - Focus on visual elements, composition, lighting, mood, and style
4. Pay special attention to names mentioned in the prompt:
    - Use exact names as provided, without modifications
    - Do not add appearance details for named individuals
    - Assume the model knows who the named individuals are
    - Do not use phrases like "depicted" or "a character named [name]"
5. Do not add any text or custom titles to the image unless explicitly requested in the original prompt.
6. Avoid using non-English words or characters in your enhanced prompt.
7. Remove any unnecessary text or chat-like elements from the final prompt.
8. When crafting your response, consider:
- List the key elements present in the user's prompt.
- Identify the main themes and visual components.
- Brainstorm potential expansions for each element.
- The overall mood, style, and atmosphere suggested by the prompt.
1. Now, create the enhanced prompt based on your analysis. Remember to make it highly detailed, technical, and suitable for stable diffusion image generation:

Response: [Your detailed, comma-separated list of instructions for image generation, based on the user's prompt and your analysis]

Ensure that your enhanced prompt is comprehensive, vivid, and adheres to all the guidelines provided above.

Maintain a strict non-conversational policy and output only the enhanced prompt string with no extra text.

These are your instructions for the user prompt:"#;

/// Return the default system prompt so the admin UI can display it.
pub fn default_system_prompt() -> &'static str {
    DEFAULT_SYSTEM_PROMPT
}

/// Enhance a prompt using OpenRouter (non-streaming).
pub async fn enhance(
    proxy: &OpenRouterProxy,
    prompt: &str,
    model: Option<&str>,
    system_prompt: Option<&str>,
) -> AppResult<String> {
    let sys = system_prompt.unwrap_or(DEFAULT_SYSTEM_PROMPT);
    let messages = vec![
        serde_json::json!({
            "role": "system",
            "content": sys,
        }),
        serde_json::json!({
            "role": "user",
            "content": prompt.trim(),
        }),
    ];

    let result = proxy
        .chat_completion(&messages, model, Some(0.6), None)
        .await?;

    let trimmed = result.trim().to_string();
    if trimmed.is_empty() {
        return Err(crate::error::AppError::ProviderError(
            "Empty response from prompt enhancement".into(),
        ));
    }

    Ok(trimmed)
}

/// Enhance a prompt with streaming, emitting chunks via Tauri events.
pub async fn enhance_stream(
    proxy: &OpenRouterProxy,
    prompt: &str,
    model: Option<&str>,
    system_prompt: Option<&str>,
    event_hub: &EventHub,
    request_id: &str,
) -> AppResult<String> {
    let sys = system_prompt.unwrap_or(DEFAULT_SYSTEM_PROMPT);
    let messages = vec![
        serde_json::json!({
            "role": "system",
            "content": sys,
        }),
        serde_json::json!({
            "role": "user",
            "content": prompt.trim(),
        }),
    ];

    let rid = request_id.to_string();
    let eh = event_hub.clone();

    let result = proxy
        .chat_completion_stream(&messages, model, Some(0.6), None, move |chunk| {
            eh.emit(
                "prompt-enhance-chunk",
                &serde_json::json!({
                    "requestId": rid,
                    "chunk": chunk,
                }),
            );
        })
        .await?;

    // Emit done event
    event_hub.emit(
        "prompt-enhance-chunk",
        &serde_json::json!({
            "requestId": request_id,
            "done": true,
            "result": result.trim(),
        }),
    );

    Ok(result.trim().to_string())
}
