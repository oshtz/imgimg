use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::providers::health::{ProviderHealthService, ProviderStatus};
use crate::state::AppState;
use crate::stores::{generation_store, workflow_store};

// ── Compare Models ──

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareModel {
    pub id: String,
    pub provider: String,
    pub display_name: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub workflow_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replicate_model: Option<String>,
    pub supports_aspect_ratio: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supported_aspect_ratios: Option<Vec<String>>,
    pub supports_image_input: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareModelsResponse {
    pub models: Vec<CompareModel>,
    pub provider_status: ProviderStatus,
}

#[tauri::command]
pub async fn get_compare_models(state: State<'_, AppState>) -> AppResult<CompareModelsResponse> {
    let workflows = workflow_store::list(&state.db).await?;

    let health = ProviderHealthService::new();
    let provider_status = health
        .get_status(
            &state.comfy_pool,
            &state.http_client,
            &state.config,
            &state.storage,
            &state.db,
        )
        .await;

    let mut models = Vec::new();

    for wf in &workflows {
        let meta = &wf.meta;

        // Skip regen-only workflows (contain __ITEM_INDEX__ tokens)
        let template_str = serde_json::to_string(&wf.template).unwrap_or_default();
        if template_str.contains("__ITEM_INDEX__") {
            continue;
        }

        // Skip hidden workflows
        if meta.get("hidden").and_then(|v| v.as_bool()).unwrap_or(false) {
            continue;
        }

        // Only include image-output workflows
        match wf.output_mode.as_str() {
            "single_image" | "full_set" | "layered_image" => {}
            _ => continue,
        }

        // Skip dynamic-model workflows (they need a model picker, not useful as standalone compare entries)
        if meta.get("dynamicModel").and_then(|v| v.as_bool()).unwrap_or(false) {
            continue;
        }

        let engine = match wf.engine.as_str() {
            "replicate" => "replicate",
            "openrouter" => "openrouter",
            "fal" => "fal",
            "kie" => "kie",
            _ => "comfyui",
        };

        let ui = meta.get("ui").unwrap_or(&serde_json::Value::Null);
        let supports_aspect_ratio = ui
            .get("aspectRatio")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let supported_aspect_ratios = meta
            .get("supportedAspectRatios")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            });

        let description = meta
            .get("description")
            .and_then(|v| v.as_str())
            .map(String::from);

        let supports_image_input = if meta.get("supportsImageInput").and_then(|v| v.as_bool()) == Some(false) {
            false
        } else {
            meta.get("supportsImageInput").and_then(|v| v.as_bool()).unwrap_or(false)
                || matches!(engine, "openrouter" | "replicate" | "fal" | "kie")
                || template_str.contains("__IMAGE__")
        };

        models.push(CompareModel {
            id: format!("workflow:{}", wf.id),
            provider: engine.to_string(),
            display_name: wf.label.clone(),
            description,
            thumbnail_url: None,
            workflow_id: wf.id.clone(),
            replicate_model: None,
            supports_aspect_ratio,
            supported_aspect_ratios,
            supports_image_input,
        });
    }

    Ok(CompareModelsResponse {
        models,
        provider_status,
    })
}

// ── Compare Groups ──

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareGroupEntry {
    pub generation_id: String,
    pub workflow_id: String,
    pub workflow_label: String,
    pub provider: String,
    pub status: String,
    pub assets: Vec<crate::db::models::Asset>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareGroup {
    pub group_id: String,
    pub prompt: String,
    pub created_at: String,
    pub entries: Vec<CompareGroupEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareGroupsResponse {
    pub groups: Vec<CompareGroup>,
}

#[tauri::command]
pub async fn get_compare_groups(state: State<'_, AppState>) -> AppResult<CompareGroupsResponse> {
    let all_generations = generation_store::list_all(&state.db).await?;
    let all_workflows = workflow_store::list(&state.db).await?;
    let workflow_map: std::collections::HashMap<&str, &crate::db::models::WorkflowRecord> =
        all_workflows.iter().map(|w| (w.id.as_str(), w)).collect();

    let mut groups: std::collections::HashMap<String, CompareGroup> =
        std::collections::HashMap::new();

    for gen in &all_generations {
        let compare_group_id = gen
            .workflow_params
            .as_ref()
            .and_then(|wp| wp.get("compare_group_id"))
            .and_then(|v| v.as_str());

        let group_id = match compare_group_id {
            Some(id) => id.to_string(),
            None => continue,
        };

        let wf = workflow_map.get(gen.workflow_used.as_str());
        let engine = wf
            .map(|w| match w.engine.as_str() {
                "replicate" => "replicate",
                "openrouter" => "openrouter",
                "fal" => "fal",
                "kie" => "kie",
                _ => "comfyui",
            })
            .unwrap_or("comfyui");

        let entry = CompareGroupEntry {
            generation_id: gen.id.clone(),
            workflow_id: gen.workflow_used.clone(),
            workflow_label: wf.map(|w| w.label.clone()).unwrap_or_else(|| gen.workflow_used.clone()),
            provider: engine.to_string(),
            status: gen.status.clone(),
            assets: gen.assets.clone(),
        };

        groups
            .entry(group_id.clone())
            .and_modify(|g| {
                g.entries.push(entry.clone());
                if gen.created_at < g.created_at {
                    g.created_at = gen.created_at.clone();
                }
            })
            .or_insert_with(|| CompareGroup {
                group_id,
                prompt: gen.prompt.clone(),
                created_at: gen.created_at.clone(),
                entries: vec![entry],
            });
    }

    let mut sorted: Vec<CompareGroup> = groups.into_values().collect();
    sorted.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    sorted.truncate(50);

    Ok(CompareGroupsResponse { groups: sorted })
}
