//! Types and workflow-parsing helpers for ComfyUI.

use std::collections::HashMap;

use serde::Deserialize;

use crate::db::models::Asset;

// ── Types ──

#[derive(Debug, Clone, Deserialize)]
pub struct ComfyImageRef {
    pub filename: String,
    #[serde(default)]
    pub subfolder: Option<String>,
    #[serde(rename = "type", default)]
    pub image_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ComfyHistoryOutput {
    #[serde(default)]
    pub images: Option<Vec<ComfyImageRef>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ComfyHistoryItem {
    #[serde(default)]
    pub outputs: Option<HashMap<String, ComfyHistoryOutput>>,
}

#[derive(Debug, Clone)]
pub struct SaveNodeMapping {
    pub node_id: String,
    pub asset_type: String,
    pub item_index: Option<i64>,
    pub filename: String,
}

pub type PreviewCallback = Box<dyn Fn(Asset) + Send + Sync>;
pub type AssetCallback = Box<dyn Fn(Asset) + Send + Sync>;

/// Parameters for simple image generation.
pub struct SimpleImageParams {
    pub generation_id: String,
    pub prompt: String,
    pub seed: i64,
    pub width: i64,
    pub height: i64,
    pub batch_size: i64,
    pub workflow: serde_json::Value,
    pub on_preview: Option<PreviewCallback>,
    pub item_index: Option<i64>,
    pub filename_prefix: Option<String>,
    pub asset_type: Option<String>,
}

/// Parameters for full-set generation.
pub struct FullSetParams {
    pub generation_id: String,
    pub prompt: String,
    pub seed: i64,
    pub workflow: serde_json::Value,
    pub on_preview: Option<PreviewCallback>,
    pub on_asset: Option<AssetCallback>,
    pub expected_item_count: Option<usize>,
}

/// Parameters for background removal.
pub struct RemoveBackgroundParams {
    pub generation_id: String,
    pub workflow: serde_json::Value,
    pub on_preview: Option<PreviewCallback>,
    pub item_index: i64,
}

// ── Free Functions ──

/// Flatten all image references from a history item.
pub fn flatten_images(item: &ComfyHistoryItem) -> Vec<ComfyImageRef> {
    let mut result = Vec::new();
    if let Some(outputs) = &item.outputs {
        for output in outputs.values() {
            if let Some(images) = &output.images {
                for img in images {
                    if !img.filename.is_empty() {
                        result.push(img.clone());
                    }
                }
            }
        }
    }
    result
}

/// Parse SaveImage node mappings from a ComfyUI workflow.
pub fn parse_save_node_mappings(workflow: &serde_json::Value) -> Vec<SaveNodeMapping> {
    static ITEM_PATTERN: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let item_pattern = ITEM_PATTERN.get_or_init(|| regex::Regex::new(r"(?i)Item(\d+)").unwrap());
    // Unwrap workflow.prompt if it exists
    let nodes = if let Some(prompt) = workflow.get("prompt") {
        prompt
    } else {
        workflow
    };

    let obj = match nodes.as_object() {
        Some(o) => o,
        None => return vec![],
    };

    let mut mappings = Vec::new();

    for (node_id, node) in obj {
        let class_type = node.get("class_type").and_then(|v| v.as_str());
        if class_type != Some("SaveImage") {
            continue;
        }

        let title = node
            .get("_meta")
            .and_then(|m| m.get("title"))
            .and_then(|t| t.as_str())
            .unwrap_or("");

        let title_lower = title.to_lowercase();

        if title_lower.contains("album") || title_lower.contains("main") {
            mappings.push(SaveNodeMapping {
                node_id: node_id.clone(),
                asset_type: "landscape".to_string(),
                item_index: None,
                filename: "main.png".to_string(),
            });
        } else if title_lower.contains("itembg") || title_lower.contains("background") {
            mappings.push(SaveNodeMapping {
                node_id: node_id.clone(),
                asset_type: "landscape".to_string(),
                item_index: None,
                filename: "background.png".to_string(),
            });
        } else {
            // Match Item<N> pattern
            if let Some(caps) = item_pattern.captures(title) {
                if let Ok(num) = caps[1].parse::<i64>() {
                    let item_index = num - 1; // 1-based → 0-based
                    mappings.push(SaveNodeMapping {
                        node_id: node_id.clone(),
                        asset_type: "square".to_string(),
                        item_index: Some(item_index),
                        filename: format!("item_{}.png", item_index),
                    });
                }
            }
        }
    }

    mappings
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ── parse_save_node_mappings ──

    #[test]
    fn parse_save_node_mappings_album_node() {
        let workflow = json!({
            "1": {
                "class_type": "SaveImage",
                "_meta": { "title": "Album Cover" }
            }
        });
        let mappings = parse_save_node_mappings(&workflow);
        assert_eq!(mappings.len(), 1);
        assert_eq!(mappings[0].node_id, "1");
        assert_eq!(mappings[0].asset_type, "landscape");
        assert_eq!(mappings[0].filename, "main.png");
        assert!(mappings[0].item_index.is_none());
    }

    #[test]
    fn parse_save_node_mappings_main_node() {
        let workflow = json!({
            "5": {
                "class_type": "SaveImage",
                "_meta": { "title": "Main Output" }
            }
        });
        let mappings = parse_save_node_mappings(&workflow);
        assert_eq!(mappings.len(), 1);
        assert_eq!(mappings[0].filename, "main.png");
    }

    #[test]
    fn parse_save_node_mappings_background_node() {
        let workflow = json!({
            "2": {
                "class_type": "SaveImage",
                "_meta": { "title": "ItemBG" }
            }
        });
        let mappings = parse_save_node_mappings(&workflow);
        assert_eq!(mappings.len(), 1);
        assert_eq!(mappings[0].filename, "background.png");
        assert_eq!(mappings[0].asset_type, "landscape");
    }

    #[test]
    fn parse_save_node_mappings_item_nodes() {
        let workflow = json!({
            "10": {
                "class_type": "SaveImage",
                "_meta": { "title": "Item1" }
            },
            "11": {
                "class_type": "SaveImage",
                "_meta": { "title": "Item3" }
            }
        });
        let mappings = parse_save_node_mappings(&workflow);
        assert_eq!(mappings.len(), 2);
        // Items are 1-based in title, 0-based in item_index
        let m1 = mappings.iter().find(|m| m.node_id == "10").unwrap();
        assert_eq!(m1.item_index, Some(0));
        assert_eq!(m1.filename, "item_0.png");
        assert_eq!(m1.asset_type, "square");

        let m3 = mappings.iter().find(|m| m.node_id == "11").unwrap();
        assert_eq!(m3.item_index, Some(2));
        assert_eq!(m3.filename, "item_2.png");
    }

    #[test]
    fn parse_save_node_mappings_with_prompt_wrapper() {
        let workflow = json!({
            "prompt": {
                "7": {
                    "class_type": "SaveImage",
                    "_meta": { "title": "Album" }
                }
            }
        });
        let mappings = parse_save_node_mappings(&workflow);
        assert_eq!(mappings.len(), 1);
        assert_eq!(mappings[0].node_id, "7");
    }

    #[test]
    fn parse_save_node_mappings_skips_non_save_nodes() {
        let workflow = json!({
            "1": {
                "class_type": "KSampler",
                "_meta": { "title": "Album" }
            }
        });
        let mappings = parse_save_node_mappings(&workflow);
        assert!(mappings.is_empty());
    }

    #[test]
    fn parse_save_node_mappings_empty_object() {
        let workflow = json!({});
        let mappings = parse_save_node_mappings(&workflow);
        assert!(mappings.is_empty());
    }

    #[test]
    fn parse_save_node_mappings_invalid_json_type() {
        let workflow = json!([1, 2, 3]);
        let mappings = parse_save_node_mappings(&workflow);
        assert!(mappings.is_empty());
    }

    // ── replace_extension ──

    // ── flatten_images ──

    #[test]
    fn flatten_images_with_multiple_outputs() {
        let item = ComfyHistoryItem {
            outputs: Some(HashMap::from([
                (
                    "node1".to_string(),
                    ComfyHistoryOutput {
                        images: Some(vec![
                            ComfyImageRef {
                                filename: "a.png".to_string(),
                                subfolder: None,
                                image_type: None,
                            },
                            ComfyImageRef {
                                filename: "b.png".to_string(),
                                subfolder: None,
                                image_type: None,
                            },
                        ]),
                    },
                ),
                (
                    "node2".to_string(),
                    ComfyHistoryOutput {
                        images: Some(vec![ComfyImageRef {
                            filename: "c.png".to_string(),
                            subfolder: Some("sub".to_string()),
                            image_type: Some("output".to_string()),
                        }]),
                    },
                ),
            ])),
        };
        let flat = flatten_images(&item);
        assert_eq!(flat.len(), 3);
    }

    #[test]
    fn flatten_images_skips_empty_filenames() {
        let item = ComfyHistoryItem {
            outputs: Some(HashMap::from([(
                "n".to_string(),
                ComfyHistoryOutput {
                    images: Some(vec![ComfyImageRef {
                        filename: "".to_string(),
                        subfolder: None,
                        image_type: None,
                    }]),
                },
            )])),
        };
        let flat = flatten_images(&item);
        assert!(flat.is_empty());
    }

    #[test]
    fn flatten_images_no_outputs() {
        let item = ComfyHistoryItem { outputs: None };
        let flat = flatten_images(&item);
        assert!(flat.is_empty());
    }

    #[test]
    fn flatten_images_output_with_no_images() {
        let item = ComfyHistoryItem {
            outputs: Some(HashMap::from([(
                "n".to_string(),
                ComfyHistoryOutput { images: None },
            )])),
        };
        let flat = flatten_images(&item);
        assert!(flat.is_empty());
    }
}
