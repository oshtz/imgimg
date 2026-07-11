use tauri::State;

use crate::error::AppResult;
use crate::providers::openrouter_proxy::OpenRouterProxy;
use crate::providers::{prompt_enhancer, prompt_variants};
use crate::state::AppState;
use crate::stores::{admin_settings, enhancer_presets};

#[tauri::command]
pub async fn enhance_prompt(
    state: State<'_, AppState>,
    prompt: String,
    model: Option<String>,
    request_id: Option<String>,
) -> AppResult<String> {
    let proxy = OpenRouterProxy::new(
        state.http_client.clone(),
        state.config.clone(),
        state.storage.clone(),
        state.db.clone(),
    );

    // Fall back to admin-configured model/prompt if not provided
    let admin_model = admin_settings::get_prompt_enhancer_model(&state.db)
        .await
        .ok()
        .flatten();
    let effective_model = model.or(admin_model);

    // Priority: active enhancer preset > admin setting > hardcoded default
    let effective_prompt = match enhancer_presets::get_active_preset(&state.db)
        .await
        .ok()
        .flatten()
    {
        Some(preset) => Some(preset.system_prompt),
        None => admin_settings::get_prompt_enhancer_system_prompt(&state.db)
            .await
            .ok()
            .flatten(),
    };

    if let Some(rid) = request_id {
        // Streaming mode
        prompt_enhancer::enhance_stream(
            &proxy,
            &prompt,
            effective_model.as_deref(),
            effective_prompt.as_deref(),
            &state.event_hub,
            &rid,
        )
        .await
    } else {
        // Non-streaming mode
        prompt_enhancer::enhance(
            &proxy,
            &prompt,
            effective_model.as_deref(),
            effective_prompt.as_deref(),
        )
        .await
    }
}

#[tauri::command]
pub async fn explore_variants(
    state: State<'_, AppState>,
    prompt: String,
    count: Option<i64>,
    creativity: Option<f64>,
) -> AppResult<Vec<String>> {
    let proxy = OpenRouterProxy::new(
        state.http_client.clone(),
        state.config.clone(),
        state.storage.clone(),
        state.db.clone(),
    );

    prompt_variants::generate(
        &proxy,
        &prompt,
        count.unwrap_or(3) as usize,
        creativity.unwrap_or(0.5),
        None,
    )
    .await
}
