use serde::{Deserialize, Serialize};

// ── Generation ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct GenerationRow {
    pub id: String,
    pub user_id: String,
    pub model_id: String,
    pub prompt: String,
    pub seed: i64,
    pub workflow_used: String,
    pub status: String,
    pub job_id: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub batch_size: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub image_input_url: Option<String>,
    pub workflow_params: Option<String>, // JSON text
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Generation {
    pub id: String,
    pub user_id: String,
    pub model_id: String,
    pub prompt: String,
    pub seed: i64,
    pub workflow_used: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub job_id: Option<String>,
    pub error: Option<String>,
    pub assets: Vec<Asset>,
    pub batch_size: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub image_input_url: Option<String>,
    pub workflow_params: Option<serde_json::Value>,
}

impl GenerationRow {
    pub fn into_generation(self, assets: Vec<Asset>) -> Generation {
        let workflow_params = self
            .workflow_params
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok());

        Generation {
            id: self.id,
            user_id: self.user_id,
            model_id: self.model_id,
            prompt: self.prompt,
            seed: self.seed,
            workflow_used: self.workflow_used,
            status: self.status,
            created_at: self.created_at,
            updated_at: self.updated_at,
            job_id: self.job_id,
            error: self.error,
            assets,
            batch_size: self.batch_size,
            width: self.width,
            height: self.height,
            image_input_url: self.image_input_url,
            workflow_params,
        }
    }
}

// ── Asset ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AssetRow {
    pub id: String,
    pub generation_id: String,
    #[sqlx(rename = "type")]
    pub asset_type: String,
    pub url: String,
    pub item_index: Option<i64>,
    pub created_at: String,
    pub is_active: bool,
    pub prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub generation_id: String,
    #[serde(rename = "type")]
    pub asset_type: String,
    pub url: String,
    pub item_index: Option<i64>,
    pub created_at: String,
    pub is_active: bool,
    pub prompt: Option<String>,
}

impl From<AssetRow> for Asset {
    fn from(row: AssetRow) -> Self {
        Asset {
            id: row.id,
            generation_id: row.generation_id,
            asset_type: row.asset_type,
            url: row.url,
            item_index: row.item_index,
            created_at: row.created_at,
            is_active: row.is_active,
            prompt: row.prompt,
        }
    }
}

// ── Workflow ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRecord {
    pub id: String,
    pub label: String,
    pub engine: String,
    pub output_mode: String,
    pub meta: serde_json::Value,
    pub template: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

// ── Asset Type ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetTypeRecord {
    pub id: String,
    pub display_name: String,
    pub description: Option<String>,
    pub aspect_ratio: String,
    pub display_sort_order: i64,
    pub grid_row: String,
    pub grid_size_class: String,
    pub default_prompt_template: Option<String>,
    pub default_width: i64,
    pub default_height: i64,
    pub is_downloadable: bool,
    pub is_regenable: bool,
    pub is_inpaintable: bool,
    pub is_visible: bool,
    pub is_system: bool,
    pub created_at: String,
    pub updated_at: String,
}

// ── Canvas Meta ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasMeta {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

// ── Canvas State ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasState {
    pub game_id: String,
    pub nodes: serde_json::Value,
    pub chat_messages: serde_json::Value,
    pub chat_workflow_id: Option<String>,
    pub next_z_index: i64,
    pub pinned_model_ids: serde_json::Value,
    pub pinned_workflow_ids: serde_json::Value,
    pub selected_provider_model_id: Option<String>,
    pub active_engine: Option<String>,
    pub updated_at: String,
    pub updated_by_email: Option<String>,
}

// ── Chat Threads ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatThread {
    pub id: String,
    pub canvas_id: String,
    pub title: String,
    pub messages: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

/// Lightweight summary for thread list (no messages blob).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatThreadSummary {
    pub id: String,
    pub canvas_id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

// ── Gallery ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryCursor {
    pub created_at: String,
    pub id: String,
    pub rank: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryListResult {
    pub items: Vec<Generation>,
    pub next_cursor: Option<GalleryCursor>,
}

// ── Workflow Organization ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowFolder {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowOrderItem {
    pub workflow_id: String,
    pub folder_id: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowOrganization {
    pub folders: Vec<WorkflowFolder>,
    pub items: Vec<WorkflowOrderItem>,
}

// ── Preset ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub image_urls: Vec<String>,
    #[serde(default)]
    pub prompt_prefix: String,
    #[serde(default)]
    pub prompt_suffix: String,
    #[serde(default)]
    pub preview_url: String,
}

fn default_true() -> bool {
    true
}
