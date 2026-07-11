use serde::Deserialize;
use tauri::State;

use crate::db::models::WorkflowRecord;
use crate::error::AppResult;
use crate::state::AppState;
use crate::stores::workflow_store;

#[tauri::command]
pub async fn list_workflows(state: State<'_, AppState>) -> AppResult<Vec<WorkflowRecord>> {
    workflow_store::list(&state.db).await
}

#[tauri::command]
pub async fn get_workflow(
    state: State<'_, AppState>,
    workflow_id: String,
) -> AppResult<Option<WorkflowRecord>> {
    workflow_store::get_by_id(&state.db, &workflow_id).await
}

#[tauri::command]
pub async fn get_workflow_template(
    state: State<'_, AppState>,
    workflow_id: String,
) -> AppResult<Option<serde_json::Value>> {
    workflow_store::get_full_template(&state.db, &workflow_id).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertWorkflowInput {
    pub id: String,
    pub label: String,
    #[serde(default = "default_engine")]
    pub engine: String,
    #[serde(default = "default_output_mode")]
    pub output_mode: String,
    pub meta: serde_json::Value,
    pub template: serde_json::Value,
}

fn default_engine() -> String {
    "comfyui".into()
}
fn default_output_mode() -> String {
    "single_image".into()
}

#[tauri::command]
pub async fn upsert_workflow(
    state: State<'_, AppState>,
    workflow: UpsertWorkflowInput,
) -> AppResult<()> {
    workflow_store::upsert(
        &state.db,
        &workflow.id,
        &workflow.label,
        &workflow.engine,
        &workflow.output_mode,
        &workflow.meta,
        &workflow.template,
    )
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn delete_workflow(state: State<'_, AppState>, workflow_id: String) -> AppResult<bool> {
    workflow_store::delete(&state.db, &workflow_id).await
}
