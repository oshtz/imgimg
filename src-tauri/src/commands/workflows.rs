use serde::Deserialize;
use tauri::State;

use crate::db::models::WorkflowRecord;
use crate::error::{AppError, AppResult};
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

    // Sync to disk as JSON file. User-saved workflows go to the app's writable
    // data_dir/workflows so they survive across launches and don't depend on cwd.
    let wf_dir = state.data_dir.join("workflows");
    if let Err(e) = std::fs::create_dir_all(&wf_dir) {
        log::warn!("Failed to create workflows dir at {:?}: {e}", wf_dir);
        return Ok(());
    }
    let file_path = wf_dir.join(format!("{}.json", workflow.id));
    let json_value = serde_json::json!({
        "meta": workflow.meta,
        "prompt": workflow.template,
    });
    let json_str = serde_json::to_string_pretty(&json_value)
        .map_err(|e| AppError::Internal(format!("Failed to serialize workflow: {e}")))?;
    if let Err(e) = std::fs::write(&file_path, json_str) {
        log::warn!("Failed to write workflow to disk at {:?}: {e}", file_path);
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_workflow(
    state: State<'_, AppState>,
    workflow_id: String,
) -> AppResult<bool> {
    let deleted = workflow_store::delete(&state.db, &workflow_id).await?;

    // Remove JSON file from disk if it exists (only the writable copy in data_dir;
    // bundled defaults in resource_dir are read-only and re-synced on next launch).
    if deleted {
        let file_path = state
            .data_dir
            .join("workflows")
            .join(format!("{}.json", workflow_id));
        if file_path.exists() {
            if let Err(e) = std::fs::remove_file(&file_path) {
                log::warn!("Failed to remove workflow file {:?}: {e}", file_path);
            }
        }
    }

    Ok(deleted)
}
