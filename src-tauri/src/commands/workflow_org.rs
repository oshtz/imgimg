use tauri::State;

use crate::db::models::{WorkflowFolder, WorkflowOrderItem, WorkflowOrganization};
use crate::error::AppResult;
use crate::state::AppState;
use crate::stores::pinned_workflow;
use crate::stores::workflow_org;
use crate::utils::ids::new_id;

const LOCAL_USER: &str = "local-user";

#[tauri::command]
pub async fn get_pinned_workflows(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    pinned_workflow::get_pinned_for_user(&state.db, LOCAL_USER).await
}

#[tauri::command]
pub async fn pin_workflow(state: State<'_, AppState>, workflow_id: String) -> AppResult<()> {
    pinned_workflow::pin(&state.db, LOCAL_USER, &workflow_id).await
}

#[tauri::command]
pub async fn unpin_workflow(state: State<'_, AppState>, workflow_id: String) -> AppResult<()> {
    pinned_workflow::unpin(&state.db, LOCAL_USER, &workflow_id).await
}

#[tauri::command]
pub async fn get_workflow_organization(
    state: State<'_, AppState>,
) -> AppResult<WorkflowOrganization> {
    workflow_org::get_for_user(&state.db, LOCAL_USER).await
}

#[tauri::command]
pub async fn reorder_workflow_items(
    state: State<'_, AppState>,
    items: Vec<WorkflowOrderItem>,
) -> AppResult<()> {
    workflow_org::reorder_items(&state.db, LOCAL_USER, &items).await
}

#[tauri::command]
pub async fn create_workflow_folder(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<WorkflowFolder> {
    let id = new_id("folder");
    workflow_org::create_folder(&state.db, LOCAL_USER, &id, &name).await
}

#[tauri::command]
pub async fn rename_workflow_folder(
    state: State<'_, AppState>,
    folder_id: String,
    name: String,
) -> AppResult<()> {
    workflow_org::rename_folder(&state.db, LOCAL_USER, &folder_id, &name).await
}

#[tauri::command]
pub async fn delete_workflow_folder(
    state: State<'_, AppState>,
    folder_id: String,
) -> AppResult<()> {
    workflow_org::delete_folder(&state.db, LOCAL_USER, &folder_id).await
}

#[tauri::command]
pub async fn reorder_workflow_folders(
    state: State<'_, AppState>,
    folders: Vec<(String, i64)>,
) -> AppResult<()> {
    workflow_org::reorder_folders(&state.db, LOCAL_USER, &folders).await
}
