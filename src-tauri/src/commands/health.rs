use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::providers::health::ProviderStatus;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub database: String,
}

#[tauri::command]
pub async fn health_check(state: State<'_, AppState>) -> AppResult<HealthResponse> {
    // Verify database is reachable
    let db_status = match sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(&state.db)
        .await
    {
        Ok(_) => "ok".to_string(),
        Err(e) => format!("error: {e}"),
    };

    let status = if db_status == "ok" { "ok" } else { "error" };
    Ok(HealthResponse {
        status: status.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        database: db_status,
    })
}

#[tauri::command]
pub async fn get_provider_status(state: State<'_, AppState>) -> AppResult<ProviderStatus> {
    Ok(state
        .provider_health
        .get_status(
            &state.comfy_pool,
            &state.http_client,
            &state.config,
            &state.storage,
            &state.db,
        )
        .await)
}
