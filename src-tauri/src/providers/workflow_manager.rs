//! Workflow template loading and token injection.

use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::stores::workflow_store;

/// Supported generation engines.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Engine {
    ComfyUI,
    OpenRouter,
    Replicate,
    Fal,
    Kie,
}

impl Engine {
    pub fn as_str(&self) -> &'static str {
        match self {
            Engine::ComfyUI => "comfyui",
            Engine::OpenRouter => "openrouter",
            Engine::Replicate => "replicate",
            Engine::Fal => "fal",
            Engine::Kie => "kie",
        }
    }
}

/// Parameters for token injection into a workflow template.
#[derive(Debug, Clone, Default)]
pub struct InjectParams {
    pub prompt: String,
    pub seed: i64,
    pub item_index: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub lora_name: Option<String>,
    pub batch_size: Option<i64>,
    pub aspect_ratio: Option<String>,
    pub image: Option<String>,
    pub image2: Option<String>,
    pub mask: Option<String>,
    pub layers: Option<i64>,
    pub expand_left: Option<i64>,
    pub expand_right: Option<i64>,
    pub expand_top: Option<i64>,
    pub expand_bottom: Option<i64>,
    pub denoise: Option<f64>,
    pub edge_blend: Option<i64>,
    pub openrouter_api_key: Option<String>,
}

/// Load a workflow template from the database.
pub async fn load_template(db: &SqlitePool, workflow_id: &str) -> AppResult<serde_json::Value> {
    // Strip .json suffix if present
    let id = workflow_id.strip_suffix(".json").unwrap_or(workflow_id);

    let full = workflow_store::get_full_template(db, id).await?;
    full.ok_or_else(|| AppError::NotFound(format!("Workflow not found: {id}")))
}

/// Get the meta object from a workflow template.
pub fn get_meta(template: &serde_json::Value) -> serde_json::Value {
    template
        .get("meta")
        .cloned()
        .unwrap_or(serde_json::Value::Null)
}

/// Detect the engine from a workflow template's meta.
pub fn detect_engine(template: &serde_json::Value) -> Engine {
    let engine_str = template
        .get("meta")
        .and_then(|m| m.get("engine"))
        .and_then(|e| e.as_str())
        .unwrap_or("");

    match engine_str {
        "openrouter" => Engine::OpenRouter,
        "replicate" => Engine::Replicate,
        "fal" => Engine::Fal,
        "kie" => Engine::Kie,
        _ => Engine::ComfyUI,
    }
}

/// Inject parameters into a workflow template by replacing tokens.
pub fn inject(template: &serde_json::Value, params: &InjectParams) -> serde_json::Value {
    let mut result = walk(template, params);
    // When no LoRA is selected, bypass LoRA loader nodes by rewiring
    // downstream references to point at the loader's own inputs.
    if params.lora_name.is_none() {
        strip_lora_nodes(&mut result);
    }
    result
}

/// Remove LoRA loader nodes from a ComfyUI prompt and rewire references.
///
/// A LoRA loader node sits between model/clip sources and their consumers.
/// When bypassed, every reference `[lora_node_id, output_index]` in the
/// workflow is replaced with the corresponding input from the LoRA node itself.
fn strip_lora_nodes(workflow: &mut serde_json::Value) {
    let prompt = match workflow.get_mut("prompt") {
        Some(p) => p,
        None => workflow,
    };

    let obj = match prompt.as_object() {
        Some(o) => o,
        None => return,
    };

    // Find LoRA loader nodes: they still contain the un-injected "__LORA_NAME__" token.
    let mut lora_nodes: Vec<String> = Vec::new();
    // Map from (lora_node_id, output_index) -> the input link to remap to.
    let mut rewire_map: std::collections::HashMap<(String, u64), serde_json::Value> =
        std::collections::HashMap::new();

    for (node_id, node) in obj {
        let class = node
            .get("class_type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let is_lora = class.to_lowercase().contains("lora");
        if !is_lora {
            continue;
        }
        let inputs = match node.get("inputs").and_then(|v| v.as_object()) {
            Some(i) => i,
            None => continue,
        };
        // Check if this node still has the un-injected __LORA_NAME__ token
        let has_uninjected = inputs
            .get("lora_name")
            .and_then(|v| v.as_str())
            .map(|s| s == "__LORA_NAME__")
            .unwrap_or(false);
        if !has_uninjected {
            continue;
        }
        lora_nodes.push(node_id.clone());
        // Map outputs to inputs: output 0 = model input, output 1 = clip input
        if let Some(model_link) = inputs.get("model") {
            rewire_map.insert((node_id.clone(), 0), model_link.clone());
        }
        if let Some(clip_link) = inputs.get("clip") {
            rewire_map.insert((node_id.clone(), 1), clip_link.clone());
        }
    }

    if lora_nodes.is_empty() {
        return;
    }

    // Rewire: scan all nodes' inputs and replace references to removed lora nodes
    let prompt_mut = match prompt.as_object_mut() {
        Some(o) => o,
        None => return,
    };

    // Remove the lora nodes
    for id in &lora_nodes {
        prompt_mut.remove(id);
    }

    // Rewire references in remaining nodes
    for (_node_id, node) in prompt_mut.iter_mut() {
        if let Some(inputs) = node.get_mut("inputs").and_then(|v| v.as_object_mut()) {
            for (_key, value) in inputs.iter_mut() {
                rewire_link(value, &rewire_map);
            }
        }
    }
}

/// Recursively replace link references `[node_id, output_idx]` using the rewire map.
fn rewire_link(
    value: &mut serde_json::Value,
    rewire_map: &std::collections::HashMap<(String, u64), serde_json::Value>,
) {
    if let Some(arr) = value.as_array() {
        if arr.len() == 2 {
            let node_ref = arr[0].as_str().map(|s| s.to_string());
            let output_idx = arr[1].as_u64();
            if let (Some(nref), Some(idx)) = (node_ref, output_idx) {
                if let Some(replacement) = rewire_map.get(&(nref, idx)) {
                    *value = replacement.clone();
                    // The replacement itself might chain through another lora node
                    rewire_link(value, rewire_map);
                }
            }
        }
    }
}

/// Validate that no required tokens remain in an injected workflow.
pub fn validate_injected(workflow: &serde_json::Value, engine: &Engine) -> AppResult<()> {
    // Skip validation for non-ComfyUI engines
    if *engine != Engine::ComfyUI {
        return Ok(());
    }

    let json_str = serde_json::to_string(workflow).unwrap_or_default();

    let required_tokens = [
        "__PROMPT__",
        "__SEED__",
        "__ITEM_INDEX__",
        "__WIDTH__",
        "__HEIGHT__",
        "__LORA_NAME__",
        "__BATCH_SIZE__",
        "__ASPECT_RATIO__",
        "__IMAGE__",
        "__IMAGE_2__",
        "__MASK__",
        "__LAYERS__",
        "__EXPAND_LEFT__",
        "__EXPAND_RIGHT__",
        "__EXPAND_TOP__",
        "__EXPAND_BOTTOM__",
        "__DENOISE__",
        "__EDGE_BLEND__",
        // __OPENROUTER_API_KEY__ is optional — not validated
    ];

    let mut leftover = Vec::new();
    for token in &required_tokens {
        if json_str.contains(token) {
            leftover.push(*token);
        }
    }

    if !leftover.is_empty() {
        return Err(AppError::BadRequest(format!(
            "Workflow still contains uninjected tokens: {}",
            leftover.join(", ")
        )));
    }

    Ok(())
}

// ── Recursive JSON walking ──

fn walk(value: &serde_json::Value, params: &InjectParams) -> serde_json::Value {
    match value {
        serde_json::Value::String(s) => walk_string(s, params),
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(|v| walk(v, params)).collect())
        }
        serde_json::Value::Object(obj) => {
            let mut new_obj = serde_json::Map::new();
            for (k, v) in obj {
                new_obj.insert(k.clone(), walk(v, params));
            }
            serde_json::Value::Object(new_obj)
        }
        other => other.clone(),
    }
}

fn walk_string(s: &str, params: &InjectParams) -> serde_json::Value {
    // Check for exact token matches first (return correct JSON type)
    match s {
        "__PROMPT__" => return serde_json::Value::String(params.prompt.clone()),
        "__SEED__" => return serde_json::json!(params.seed),
        "__BATCH_SIZE__" => return serde_json::json!(params.batch_size.unwrap_or(1)),
        _ => {}
    }

    // Tokens that return numbers when matched exactly
    if s == "__ITEM_INDEX__" {
        return match params.item_index {
            Some(v) => serde_json::json!(v),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__WIDTH__" {
        return match params.width {
            Some(v) => serde_json::json!(v),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__HEIGHT__" {
        return match params.height {
            Some(v) => serde_json::json!(v),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__LAYERS__" {
        return match params.layers {
            Some(v) => serde_json::json!(v),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__EXPAND_LEFT__" {
        return match params.expand_left {
            Some(v) => serde_json::json!(v),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__EXPAND_RIGHT__" {
        return match params.expand_right {
            Some(v) => serde_json::json!(v),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__EXPAND_TOP__" {
        return match params.expand_top {
            Some(v) => serde_json::json!(v),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__EXPAND_BOTTOM__" {
        return match params.expand_bottom {
            Some(v) => serde_json::json!(v),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__DENOISE__" {
        return match params.denoise {
            Some(v) => serde_json::json!(v),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__EDGE_BLEND__" {
        return match params.edge_blend {
            Some(v) => serde_json::json!(v),
            None => serde_json::Value::String(s.to_string()),
        };
    }

    // String-type exact matches
    if s == "__LORA_NAME__" {
        return match &params.lora_name {
            Some(v) => serde_json::Value::String(v.clone()),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__ASPECT_RATIO__" {
        return match &params.aspect_ratio {
            Some(v) => serde_json::Value::String(v.clone()),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__IMAGE__" {
        return match &params.image {
            Some(v) => serde_json::Value::String(v.clone()),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__IMAGE_2__" {
        return match &params.image2 {
            Some(v) => serde_json::Value::String(v.clone()),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__MASK__" {
        return match &params.mask {
            Some(v) => serde_json::Value::String(v.clone()),
            None => serde_json::Value::String(s.to_string()),
        };
    }
    if s == "__OPENROUTER_API_KEY__" {
        return match &params.openrouter_api_key {
            Some(v) => serde_json::Value::String(v.clone()),
            None => serde_json::Value::String(s.to_string()),
        };
    }

    // Partial token replacement in strings
    let result = replace_tokens_in_string(s, params);
    serde_json::Value::String(result)
}

fn replace_tokens_in_string(s: &str, params: &InjectParams) -> String {
    let mut result = s.to_string();

    result = result.replace("__PROMPT__", &params.prompt);
    result = result.replace("__SEED__", &params.seed.to_string());
    result = result.replace(
        "__BATCH_SIZE__",
        &params.batch_size.unwrap_or(1).to_string(),
    );

    if let Some(v) = params.item_index {
        result = result.replace("__ITEM_INDEX__", &v.to_string());
    }
    if let Some(v) = params.width {
        result = result.replace("__WIDTH__", &v.to_string());
    }
    if let Some(v) = params.height {
        result = result.replace("__HEIGHT__", &v.to_string());
    }
    if let Some(ref v) = params.lora_name {
        result = result.replace("__LORA_NAME__", v);
    }
    if let Some(ref v) = params.aspect_ratio {
        result = result.replace("__ASPECT_RATIO__", v);
    }
    if let Some(ref v) = params.image {
        result = result.replace("__IMAGE__", v);
    }
    if let Some(ref v) = params.image2 {
        result = result.replace("__IMAGE_2__", v);
    }
    if let Some(ref v) = params.mask {
        result = result.replace("__MASK__", v);
    }
    if let Some(v) = params.layers {
        result = result.replace("__LAYERS__", &v.to_string());
    }
    if let Some(v) = params.expand_left {
        result = result.replace("__EXPAND_LEFT__", &v.to_string());
    }
    if let Some(v) = params.expand_right {
        result = result.replace("__EXPAND_RIGHT__", &v.to_string());
    }
    if let Some(v) = params.expand_top {
        result = result.replace("__EXPAND_TOP__", &v.to_string());
    }
    if let Some(v) = params.expand_bottom {
        result = result.replace("__EXPAND_BOTTOM__", &v.to_string());
    }
    if let Some(v) = params.denoise {
        result = result.replace("__DENOISE__", &v.to_string());
    }
    if let Some(v) = params.edge_blend {
        result = result.replace("__EDGE_BLEND__", &v.to_string());
    }
    if let Some(ref v) = params.openrouter_api_key {
        result = result.replace("__OPENROUTER_API_KEY__", v);
    }

    result
}

/// Convert an aspect ratio string (e.g. "16:9") to width/height.
/// Mirrors the algorithm in `web/src/workflows.ts::aspectRatioToSize` so any
/// ratio the UI offers maps to non-square dimensions on the backend.
pub fn aspect_ratio_to_size(ar: &str) -> Option<(i64, i64)> {
    let (w_str, h_str) = ar.split_once(':')?;
    let w: f64 = w_str.parse().ok()?;
    let h: f64 = h_str.parse().ok()?;
    if !w.is_finite() || !h.is_finite() || w <= 0.0 || h <= 0.0 {
        return None;
    }
    let ratio = w / h;
    if (ratio - 1.0).abs() < f64::EPSILON {
        return Some((1024, 1024));
    }

    const MULTIPLE: f64 = 64.0;
    const BASE: f64 = 1104.0;
    const MAX_DIM: f64 = 2048.0;

    let round_to_multiple = |n: f64| -> f64 {
        let r = (n / MULTIPLE).round() * MULTIPLE;
        if r < MULTIPLE {
            MULTIPLE
        } else {
            r
        }
    };

    let s = ratio.sqrt();
    let mut width = round_to_multiple(BASE * s);
    let mut height = round_to_multiple(BASE / s);
    let scale = (MAX_DIM / width.max(height)).min(1.0);
    width = round_to_multiple(width * scale);
    height = round_to_multiple(height * scale);
    Some((width as i64, height as i64))
}

#[cfg(test)]
mod injection_tests {
    use super::{inject, validate_injected, Engine, InjectParams};

    #[test]
    fn injects_edge_blend_tokens() {
        let template = serde_json::json!({
            "prompt": {
                "10": {
                    "class_type": "MaskBlur",
                    "inputs": {
                        "radius": "__EDGE_BLEND__",
                        "label": "blend __EDGE_BLEND__ px"
                    }
                }
            }
        });

        let injected = inject(
            &template,
            &InjectParams {
                edge_blend: Some(64),
                ..Default::default()
            },
        );

        assert_eq!(injected["prompt"]["10"]["inputs"]["radius"], 64);
        assert_eq!(injected["prompt"]["10"]["inputs"]["label"], "blend 64 px");
    }

    #[test]
    fn validates_uninjected_edge_blend_token() {
        let workflow = serde_json::json!({
            "prompt": {
                "10": {
                    "class_type": "MaskBlur",
                    "inputs": { "radius": "__EDGE_BLEND__" }
                }
            }
        });

        let err = validate_injected(&workflow, &Engine::ComfyUI).expect_err("token should fail");
        assert!(err.to_string().contains("__EDGE_BLEND__"));
    }
}

#[cfg(test)]
mod aspect_ratio_tests {
    use super::aspect_ratio_to_size;

    #[test]
    fn square_returns_1024() {
        assert_eq!(aspect_ratio_to_size("1:1"), Some((1024, 1024)));
    }

    #[test]
    fn common_ratios_match_legacy_table() {
        assert_eq!(aspect_ratio_to_size("16:9"), Some((1472, 832)));
        assert_eq!(aspect_ratio_to_size("9:16"), Some((832, 1472)));
        assert_eq!(aspect_ratio_to_size("4:3"), Some((1280, 960)));
        assert_eq!(aspect_ratio_to_size("3:4"), Some((960, 1280)));
    }

    #[test]
    fn previously_unsupported_ratios_now_resolve() {
        // These all returned None before — silently producing 1024×1024.
        assert!(aspect_ratio_to_size("4:5").is_some());
        assert!(aspect_ratio_to_size("5:4").is_some());
        assert!(aspect_ratio_to_size("16:10").is_some());
        assert!(aspect_ratio_to_size("1:2").is_some());
        assert!(aspect_ratio_to_size("8:1").is_some());
    }

    #[test]
    fn dimensions_are_multiples_of_64() {
        for ar in [
            "1:1", "16:9", "9:16", "4:5", "5:4", "16:10", "1:2", "8:1", "1:8",
        ] {
            let (w, h) = aspect_ratio_to_size(ar).expect(ar);
            assert_eq!(w % 64, 0, "{ar} width {w} not multiple of 64");
            assert_eq!(h % 64, 0, "{ar} height {h} not multiple of 64");
            assert!(w <= 2048 && h <= 2048, "{ar} exceeds 2048: {w}x{h}");
            assert!(w >= 64 && h >= 64, "{ar} below 64: {w}x{h}");
        }
    }

    #[test]
    fn invalid_input_returns_none() {
        assert_eq!(aspect_ratio_to_size(""), None);
        assert_eq!(aspect_ratio_to_size("abc"), None);
        assert_eq!(aspect_ratio_to_size("1:0"), None);
        assert_eq!(aspect_ratio_to_size("0:1"), None);
        assert_eq!(aspect_ratio_to_size("1"), None);
    }
}
