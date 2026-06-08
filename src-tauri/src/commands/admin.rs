use std::collections::HashMap;
use tauri::State;

use crate::error::AppResult;
use crate::providers::{canvas_agent, prompt_enhancer};
use crate::state::AppState;
use crate::stores::admin_settings::{self, AdminSettings};

#[tauri::command]
pub async fn get_admin_settings(state: State<'_, AppState>) -> AppResult<AdminSettings> {
    admin_settings::get_settings(&state.db).await
}

#[tauri::command]
pub async fn update_admin_settings(
    state: State<'_, AppState>,
    settings: AdminSettings,
) -> AppResult<()> {
    admin_settings::save_settings(&state.db, &settings).await
}

#[tauri::command]
pub async fn get_openrouter_api_key(state: State<'_, AppState>) -> AppResult<Option<String>> {
    admin_settings::get_openrouter_api_key(&state.db).await
}

#[tauri::command]
pub async fn set_openrouter_api_key(
    state: State<'_, AppState>,
    value: Option<String>,
) -> AppResult<()> {
    admin_settings::set_openrouter_api_key(&state.db, value).await
}

#[tauri::command]
pub async fn get_replicate_api_key(state: State<'_, AppState>) -> AppResult<Option<String>> {
    admin_settings::get_replicate_api_key(&state.db).await
}

#[tauri::command]
pub async fn set_replicate_api_key(
    state: State<'_, AppState>,
    value: Option<String>,
) -> AppResult<()> {
    admin_settings::set_replicate_api_key(&state.db, value).await
}

#[tauri::command]
pub async fn get_fal_api_key(state: State<'_, AppState>) -> AppResult<Option<String>> {
    admin_settings::get_fal_api_key(&state.db).await
}

#[tauri::command]
pub async fn set_fal_api_key(
    state: State<'_, AppState>,
    value: Option<String>,
) -> AppResult<()> {
    admin_settings::set_fal_api_key(&state.db, value).await
}

#[tauri::command]
pub async fn get_kie_api_key(state: State<'_, AppState>) -> AppResult<Option<String>> {
    admin_settings::get_kie_api_key(&state.db).await
}

#[tauri::command]
pub async fn set_kie_api_key(
    state: State<'_, AppState>,
    value: Option<String>,
) -> AppResult<()> {
    admin_settings::set_kie_api_key(&state.db, value).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureWorkflowConfig {
    pub inpaint_workflow_id: Option<String>,
    pub outpaint_workflow_id: Option<String>,
    pub rembg_workflow_id: Option<String>,
}

#[tauri::command]
pub async fn get_feature_workflow_config(
    state: State<'_, AppState>,
) -> AppResult<FeatureWorkflowConfig> {
    let s = admin_settings::get_settings(&state.db).await?;
    Ok(FeatureWorkflowConfig {
        inpaint_workflow_id: s.inpaint_workflow_id,
        outpaint_workflow_id: s.outpaint_workflow_id,
        rembg_workflow_id: s.rembg_workflow_id,
    })
}

#[tauri::command]
pub async fn get_default_system_prompts() -> AppResult<HashMap<String, String>> {
    let mut map = HashMap::new();
    map.insert(
        "canvasAgent".to_string(),
        canvas_agent::default_system_prompt().to_string(),
    );
    map.insert(
        "promptEnhancer".to_string(),
        prompt_enhancer::default_system_prompt().to_string(),
    );
    Ok(map)
}
