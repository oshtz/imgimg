use std::collections::HashMap;
use tauri::State;

use crate::error::AppResult;
use crate::providers::model_discovery;
use crate::state::AppState;
use crate::stores::lora_settings;

const DEFAULT_GAME: &str = "default";

#[tauri::command]
pub async fn list_available_loras(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    let lora_svc = crate::providers::lora_service::LoraService::new();
    lora_svc.list_available(&state.comfy_pool).await
}

#[tauri::command]
pub async fn get_lora_settings(
    state: State<'_, AppState>,
    game_id: Option<String>,
) -> AppResult<serde_json::Value> {
    let gid = game_id.as_deref().unwrap_or(DEFAULT_GAME);
    let enabled = lora_settings::get_enabled_for_game(&state.db, gid).await?;
    let display_names = lora_settings::get_display_names_for_game(&state.db, gid).await?;
    let preview_urls = lora_settings::get_preview_urls_for_game(&state.db, gid).await?;
    let prompt_prefixes = lora_settings::get_prompt_prefixes_for_game(&state.db, gid).await?;
    let workflow_overrides = lora_settings::get_workflow_overrides_for_game(&state.db, gid).await?;
    let keyword_replacements =
        lora_settings::get_keyword_replacements_for_game(&state.db, gid).await?;

    Ok(serde_json::json!({
        "enabled": enabled,
        "displayNames": display_names,
        "previewUrls": preview_urls,
        "promptPrefixes": prompt_prefixes,
        "workflowOverrides": workflow_overrides,
        "keywordReplacements": keyword_replacements,
    }))
}

#[tauri::command]
pub async fn update_lora_settings(
    state: State<'_, AppState>,
    game_id: Option<String>,
    enabled: Option<Vec<String>>,
    display_names: Option<HashMap<String, String>>,
    preview_urls: Option<HashMap<String, String>>,
    prompt_prefixes: Option<HashMap<String, String>>,
    workflow_overrides: Option<HashMap<String, String>>,
    keyword_replacements: Option<HashMap<String, HashMap<String, String>>>,
) -> AppResult<()> {
    let gid = game_id.as_deref().unwrap_or(DEFAULT_GAME);

    lora_settings::set_enabled_for_game(&state.db, gid, enabled).await?;
    lora_settings::set_display_names_for_game(&state.db, gid, display_names).await?;
    lora_settings::set_preview_urls_for_game(&state.db, gid, preview_urls).await?;
    lora_settings::set_prompt_prefixes_for_game(&state.db, gid, prompt_prefixes).await?;
    lora_settings::set_workflow_overrides_for_game(&state.db, gid, workflow_overrides).await?;
    lora_settings::set_keyword_replacements_for_game(&state.db, gid, keyword_replacements).await?;

    Ok(())
}

#[tauri::command]
pub async fn search_provider_models(
    state: State<'_, AppState>,
    provider: String,
    query: Option<String>,
    limit: Option<usize>,
    cursor: Option<String>,
) -> AppResult<serde_json::Value> {
    match provider.as_str() {
        "replicate" => {
            let token = crate::stores::admin_settings::get_replicate_api_key(&state.db)
                .await?
                .ok_or_else(|| {
                    crate::error::AppError::Config("Replicate API key not configured".into())
                })?;
            let (models, next) = model_discovery::search_replicate_models(
                &state.http_client,
                &token,
                query.as_deref(),
                limit,
                cursor.as_deref(),
            )
            .await?;
            Ok(serde_json::json!({ "models": models, "nextCursor": next }))
        }
        "fal" => {
            let key = crate::stores::admin_settings::get_fal_api_key(&state.db)
                .await?
                .ok_or_else(|| {
                    crate::error::AppError::Config("fal.ai API key not configured".into())
                })?;
            let (models, next) = model_discovery::search_fal_models(
                &state.http_client,
                &key,
                query.as_deref(),
                Some("text-to-image"),
                limit,
            )
            .await?;
            Ok(serde_json::json!({ "models": models, "nextCursor": next }))
        }
        "openrouter" => {
            let key = crate::stores::admin_settings::get_openrouter_api_key(&state.db)
                .await?
                .ok_or_else(|| {
                    crate::error::AppError::Config("OpenRouter API key not configured".into())
                })?;
            let (models, next) = model_discovery::search_openrouter_models(
                &state.http_client,
                &key,
                query.as_deref(),
                limit,
            )
            .await?;
            Ok(serde_json::json!({ "models": models, "nextCursor": next }))
        }
        _ => Err(crate::error::AppError::BadRequest(format!(
            "Unknown provider: {provider}"
        ))),
    }
}

#[tauri::command]
pub async fn get_provider_model_detail(
    state: State<'_, AppState>,
    provider: String,
    model_id: String,
) -> AppResult<serde_json::Value> {
    match provider.as_str() {
        "replicate" => {
            let token = crate::stores::admin_settings::get_replicate_api_key(&state.db)
                .await?
                .ok_or_else(|| {
                    crate::error::AppError::Config("Replicate API key not configured".into())
                })?;
            let parts: Vec<&str> = model_id.splitn(2, '/').collect();
            if parts.len() != 2 {
                return Err(crate::error::AppError::BadRequest(
                    "Invalid model ID format, expected owner/name".into(),
                ));
            }
            model_discovery::get_replicate_model_detail(
                &state.http_client,
                &token,
                parts[0],
                parts[1],
            )
            .await
        }
        "fal" => {
            let key = crate::stores::admin_settings::get_fal_api_key(&state.db)
                .await?
                .ok_or_else(|| {
                    crate::error::AppError::Config("fal.ai API key not configured".into())
                })?;
            model_discovery::get_fal_model_detail(&state.http_client, &key, &model_id).await
        }
        _ => Err(crate::error::AppError::BadRequest(format!(
            "Unknown provider: {provider}"
        ))),
    }
}

#[tauri::command]
pub async fn get_replicate_model_parameters(
    state: State<'_, AppState>,
    owner: String,
    name: String,
) -> AppResult<serde_json::Value> {
    let token = crate::stores::admin_settings::get_replicate_api_key(&state.db)
        .await?
        .ok_or_else(|| crate::error::AppError::Config("Replicate API key not configured".into()))?;
    model_discovery::get_replicate_model_parameters(&state.http_client, &token, &owner, &name).await
}

#[tauri::command]
pub async fn get_fal_model_parameters(
    state: State<'_, AppState>,
    endpoint_id: String,
) -> AppResult<serde_json::Value> {
    let key = crate::stores::admin_settings::get_fal_api_key(&state.db)
        .await?
        .ok_or_else(|| crate::error::AppError::Config("fal.ai API key not configured".into()))?;
    model_discovery::get_fal_model_parameters(&state.http_client, &key, &endpoint_id).await
}
