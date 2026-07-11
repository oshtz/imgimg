//! Canvas AI agent with tool-use via OpenRouter.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::error::AppResult;
use crate::providers::openrouter_proxy::OpenRouterProxy;
use crate::services::event_hub::EventHub;

const DEFAULT_SYSTEM_PROMPT: &str = r#"You are a helpful AI assistant integrated into a visual canvas application. You can help users generate images, organize their canvas, and provide creative guidance.

You have access to tools for generating images, managing canvas nodes, and creating visual layouts. Use these tools when appropriate to help the user accomplish their goals.

Be concise and action-oriented. When the user asks to generate images, use the generate_image tool. When they ask to organize or arrange content, use the appropriate canvas tools.

ORGANIZING THE CANVAS: When the user asks to organize, clean up, or tidy the canvas, first use resize_nodes with target "medium" to normalize image sizes, then use arrange_nodes with "auto_masonry" (for mixed-size content) or "auto_grid" (for uniform grids) to lay them out cleanly. This two-step approach (normalize sizes → auto-arrange) produces the best results.

VIEWPORT & PLACEMENT: The canvas context includes a "__viewport__" entry showing what the user currently sees (x, y, width, height in canvas coordinates). When placing new content (generate_image, add_text_note, create_frame), you do NOT need to specify x/y — the system auto-places items near the viewport. When using move_nodes, keep positions within or near the viewport bounds so the user can see the result. Never move nodes thousands of pixels away from the viewport unless the user explicitly requests it.

IMPORTANT: Image generation is asynchronous — after calling generate_image the image is still rendering. Never say you "have generated" or "here is" the image. Instead say the image is "being generated" or "on its way". Keep your follow-up brief — don't over-explain what you did.

IMPORTANT: Each generate_image call produces exactly ONE image. The prompt must describe a SINGLE scene, not a grid, collage, comic strip, or multi-panel layout. Never use words like "grid", "panels", "four scenes", "comic", or "collage" in prompts. If the user wants multiple images, make separate generate_image calls each with a distinct single-scene prompt."#;

/// Return the default system prompt so the admin UI can display it.
pub fn default_system_prompt() -> &'static str {
    DEFAULT_SYSTEM_PROMPT
}

/// Canvas chat event payload.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasChatEvent {
    pub request_id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Run the canvas agent chat with streaming.
pub async fn chat(
    proxy: &OpenRouterProxy,
    request_id: &str,
    messages: &[serde_json::Value],
    canvas_context: Option<&[serde_json::Value]>,
    workflows: Option<&[serde_json::Value]>,
    models: Option<&[serde_json::Value]>,
    provider_model_id: Option<&str>,
    model: Option<&str>,
    system_prompt: Option<&str>,
    temperature: Option<f64>,
    cancellation: Arc<AtomicBool>,
    event_hub: &EventHub,
) -> AppResult<String> {
    let system = system_prompt.unwrap_or(DEFAULT_SYSTEM_PROMPT);
    let temp = temperature.unwrap_or(0.7);

    if cancellation.load(Ordering::Relaxed) {
        log::info!(
            "canvas_chat request_id={} cancelled before provider request",
            request_id
        );
        return Ok(String::new());
    }

    // Build tool definitions
    let tools = build_tool_definitions(workflows, models);

    // Build full messages with system prompt and canvas context
    let mut full_messages = vec![serde_json::json!({
        "role": "system",
        "content": build_system_message(system, workflows, models, provider_model_id, canvas_context),
    })];
    full_messages.extend_from_slice(messages);

    // Stream the response with tool support
    let eh_text = event_hub.clone();
    let eh_finish = event_hub.clone();
    let request_id_text = request_id.to_string();
    let request_id_finish = request_id.to_string();
    let result = proxy
        .chat_completion_stream_with_tools(
            &full_messages,
            model,
            Some(temp),
            Some(4096),
            Some(&tools),
            Some(cancellation),
            // on_chunk: text deltas
            move |chunk| {
                eh_text.emit(
                    "canvas-chat-event",
                    &CanvasChatEvent {
                        request_id: request_id_text.clone(),
                        event_type: "content".to_string(),
                        text: Some(chunk.to_string()),
                        tool_call: None,
                        error: None,
                    },
                );
            },
            // on_tool_delta: ignored (we emit assembled tool calls after stream ends)
            |_| {},
            // on_finish: emit finish_reason
            move |reason| {
                eh_finish.emit(
                    "canvas-chat-event",
                    &CanvasChatEvent {
                        request_id: request_id_finish.clone(),
                        event_type: "finish".to_string(),
                        text: Some(reason.to_string()),
                        tool_call: None,
                        error: None,
                    },
                );
            },
        )
        .await?;

    if result.cancelled {
        log::info!(
            "canvas_chat request_id={} cancelled during stream partial_chars={}",
            request_id,
            result.text.chars().count()
        );
        return Ok(result.text);
    }

    log::info!(
        "canvas_chat request_id={} completed tool_calls={} response_chars={}",
        request_id,
        result.tool_calls.len(),
        result.text.chars().count()
    );

    // Emit assembled tool calls
    for tc in &result.tool_calls {
        event_hub.emit(
            "canvas-chat-event",
            &CanvasChatEvent {
                request_id: request_id.to_string(),
                event_type: "tool_call".to_string(),
                text: None,
                tool_call: Some(tc.clone()),
                error: None,
            },
        );
    }

    // Emit done event
    event_hub.emit(
        "canvas-chat-event",
        &CanvasChatEvent {
            request_id: request_id.to_string(),
            event_type: "done".to_string(),
            text: None,
            tool_call: None,
            error: None,
        },
    );

    Ok(result.text)
}

fn build_system_message(
    base_prompt: &str,
    workflows: Option<&[serde_json::Value]>,
    models: Option<&[serde_json::Value]>,
    provider_model_id: Option<&str>,
    canvas_context: Option<&[serde_json::Value]>,
) -> String {
    let mut msg = base_prompt.to_string();

    // Append available workflows section
    if let Some(wfs) = workflows {
        if !wfs.is_empty() {
            msg.push_str("\n\nAvailable workflows:\n");
            for wf in wfs {
                let id = wf.get("id").and_then(|v| v.as_str()).unwrap_or("?");
                let label = wf.get("label").and_then(|v| v.as_str()).unwrap_or("?");
                let output_mode = wf
                    .get("outputMode")
                    .and_then(|v| v.as_str())
                    .unwrap_or("single_image");
                let mode_label = match output_mode {
                    "single_image" => "single image",
                    "full_set" => "full set",
                    "layered_image" => "layered image",
                    "single_audio" => "audio",
                    other => other,
                };
                let desc = wf.get("description").and_then(|v| v.as_str()).unwrap_or("");
                if desc.is_empty() {
                    msg.push_str(&format!("- \"{}\": {} [{}]\n", id, label, mode_label));
                } else {
                    msg.push_str(&format!(
                        "- \"{}\": {} [{}] — {}\n",
                        id, label, mode_label, desc
                    ));
                }
            }

            if wfs.len() == 1 {
                if let Some(id) = wfs[0].get("id").and_then(|v| v.as_str()) {
                    msg.push_str(&format!(
                        "\nYou MUST use workflow \"{}\" for all image generation.\n",
                        id
                    ));
                }
            }
        }
    }

    if let Some(provider_model) = provider_model_id {
        if !provider_model.trim().is_empty() {
            msg.push_str(&format!(
                "\nSelected provider model: \"{}\". The app will apply this provider model automatically for provider-backed generation workflows.\n",
                provider_model.trim()
            ));
        }
    }

    // Append available models section
    if let Some(mdls) = models {
        if !mdls.is_empty() {
            msg.push_str("\nAvailable LoRA models (use model_id to select):\n");
            for m in mdls {
                let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("?");
                let name = m.get("name").and_then(|v| v.as_str()).unwrap_or("?");
                let tags: Vec<&str> = m
                    .get("tags")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|t| t.as_str()).collect())
                    .unwrap_or_default();
                msg.push_str(&format!("- \"{}\": {} [{}]\n", id, name, tags.join(", ")));
            }
            if mdls.len() == 1 {
                if let Some(id) = mdls[0].get("id").and_then(|v| v.as_str()) {
                    msg.push_str(&format!(
                        "\nIMPORTANT: ALWAYS include model_id \"{}\" in every generate_image call. This is the user's assigned model for this canvas.\n",
                        id
                    ));
                }
            } else {
                msg.push_str("\nModel selection guidelines:\n");
                msg.push_str(
                    "- ALWAYS include a model_id in every generate_image call — pick the model whose name and tags best match the user's request\n",
                );
                msg.push_str("- If unsure which model fits best, use the first one in the list\n");
            }
        }
    }

    // Append canvas context
    if let Some(nodes) = canvas_context {
        // Separate viewport entry from real nodes
        let viewport_entry = nodes
            .iter()
            .find(|n| n.get("type").and_then(|v| v.as_str()) == Some("viewport"));
        let real_nodes: Vec<&serde_json::Value> = nodes
            .iter()
            .filter(|n| n.get("type").and_then(|v| v.as_str()) != Some("viewport"))
            .collect();

        // Emit viewport info
        if let Some(vp) = viewport_entry {
            let vx = vp.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let vy = vp.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let vw = vp.get("width").and_then(|v| v.as_f64()).unwrap_or(1200.0);
            let vh = vp.get("height").and_then(|v| v.as_f64()).unwrap_or(800.0);
            msg.push_str(&format!(
                "\nCurrent viewport: x={}, y={}, width={}, height={} (this is the area the user can see)\n",
                vx as i64, vy as i64, vw as i64, vh as i64,
            ));
        }

        if !real_nodes.is_empty() {
            msg.push_str(&format!(
                "\nCurrent canvas state ({} node{} on canvas):\n",
                real_nodes.len(),
                if real_nodes.len() == 1 { "" } else { "s" }
            ));
            for (i, node) in real_nodes.iter().take(30).enumerate() {
                if let Some(summary) = format_node_summary(node) {
                    msg.push_str(&format!("  {}. {}\n", i + 1, summary));
                }
            }
            if real_nodes.len() > 30 {
                msg.push_str(&format!("  ... and {} more\n", real_nodes.len() - 30));
            }
            msg.push_str("\nUse node IDs when calling delete_nodes, move_nodes, arrange_nodes, or create_frame with existing nodes.\n");
        } else {
            msg.push_str(
                "\nThe canvas is currently empty. Help the user get started by suggesting what to create.\n",
            );
        }
    }

    msg
}

fn format_node_summary(node: &serde_json::Value) -> Option<String> {
    let node_type = node
        .get("type")
        .and_then(|t| t.as_str())
        .unwrap_or("unknown");
    let id = node.get("id").and_then(|i| i.as_str()).unwrap_or("?");
    let x = node.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let y = node.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let w = node.get("width").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let h = node.get("height").and_then(|v| v.as_f64()).unwrap_or(0.0);

    // Include prompt/text snippet for richer context
    let detail = if let Some(prompt) = node.get("prompt").and_then(|v| v.as_str()) {
        let snippet: String = prompt.chars().take(60).collect();
        format!(" prompt=\"{}\"", snippet)
    } else if let Some(text) = node.get("text").and_then(|v| v.as_str()) {
        let snippet: String = text.chars().take(60).collect();
        format!(" text=\"{}\"", snippet)
    } else if let Some(title) = node.get("title").and_then(|v| v.as_str()) {
        format!(" title=\"{}\"", title)
    } else {
        String::new()
    };

    let frame_info = node
        .get("parentFrameId")
        .and_then(|v| v.as_str())
        .map(|fid| format!(" in_frame={}", fid))
        .unwrap_or_default();

    Some(format!(
        "[{}] {} at ({}, {}) size {}x{}{}{}",
        node_type, id, x, y, w as i64, h as i64, detail, frame_info,
    ))
}

fn build_tool_definitions(
    workflows: Option<&[serde_json::Value]>,
    models: Option<&[serde_json::Value]>,
) -> Vec<serde_json::Value> {
    // Build generate_image tool — dynamic when workflows are available, fallback otherwise
    let generate_image_tool = if let Some(wfs) = workflows {
        if !wfs.is_empty() {
            build_dynamic_generate_image_tool(wfs, models)
        } else {
            build_fallback_generate_image_tool()
        }
    } else {
        build_fallback_generate_image_tool()
    };

    vec![
        generate_image_tool,
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "delete_nodes",
                "description": "Remove one or more nodes from the canvas by their IDs.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_ids": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Array of node IDs to delete from the canvas."
                        }
                    },
                    "required": ["node_ids"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "move_nodes",
                "description": "Move one or more nodes to new absolute positions on the canvas.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "moves": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "node_id": { "type": "string", "description": "ID of the node to move" },
                                    "x": { "type": "number", "description": "New absolute X position" },
                                    "y": { "type": "number", "description": "New absolute Y position" }
                                },
                                "required": ["node_id", "x", "y"]
                            },
                            "description": "Array of moves, each specifying a node ID and its new position."
                        }
                    },
                    "required": ["moves"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "add_text_note",
                "description": "Add a sticky note with text content to the canvas.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": { "type": "string", "description": "Text content for the sticky note." },
                        "x": { "type": "number", "description": "X position (optional, auto-placed if omitted)." },
                        "y": { "type": "number", "description": "Y position (optional, auto-placed if omitted)." },
                        "color": {
                            "type": "string",
                            "enum": ["yellow", "green", "blue", "pink", "orange", "purple"],
                            "description": "Sticky note color. Default is yellow."
                        }
                    },
                    "required": ["text"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "create_frame",
                "description": "Create a frame to visually group nodes together. If node_ids are provided, the frame will be sized to contain them.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string", "description": "Title label for the frame." },
                        "node_ids": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "IDs of nodes to include in the frame. The frame auto-sizes to contain them."
                        },
                        "x": { "type": "number", "description": "X position (used when no node_ids provided)." },
                        "y": { "type": "number", "description": "Y position (used when no node_ids provided)." },
                        "width": { "type": "number", "description": "Frame width (used when no node_ids provided). Default 800." },
                        "height": { "type": "number", "description": "Frame height (used when no node_ids provided). Default 600." }
                    },
                    "required": ["title"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "arrange_nodes",
                "description": "Arrange nodes on the canvas. Use 'auto_masonry' for visually appealing layouts with mixed-size content (like Pinterest). Use 'auto_grid' for uniform grid layouts. Use alignment to line up edges/centers, or distribution to space nodes evenly.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_ids": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "IDs of nodes to arrange."
                        },
                        "arrangement": {
                            "type": "string",
                            "enum": ["auto_masonry", "auto_grid", "auto_tree", "align_left", "align_center", "align_right", "align_top", "align_middle", "align_bottom", "distribute_horizontal", "distribute_vertical"],
                            "description": "How to arrange the nodes. Use 'auto_masonry' for the best visual layout with mixed sizes. Use 'auto_grid' for uniform grids. Use 'auto_tree' to arrange by lineage/connections."
                        }
                    },
                    "required": ["node_ids", "arrangement"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "resize_nodes",
                "description": "Resize image nodes to a uniform size. Use before arranging to make layouts look clean and consistent.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_ids": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "IDs of nodes to resize."
                        },
                        "target": {
                            "type": "string",
                            "enum": ["small", "medium", "large", "original"],
                            "description": "Target size: small (200px), medium (400px), large (600px), or original (natural resolution). The longest edge is constrained to this size while preserving aspect ratio."
                        }
                    },
                    "required": ["node_ids", "target"]
                }
            }
        }),
    ]
}

/// Build the generate_image tool with dynamic workflow_id enum and model_id from available data.
fn build_dynamic_generate_image_tool(
    workflows: &[serde_json::Value],
    models: Option<&[serde_json::Value]>,
) -> serde_json::Value {
    let workflow_enum: Vec<&str> = workflows
        .iter()
        .filter_map(|w| w.get("id").and_then(|v| v.as_str()))
        .collect();

    let size_required: Vec<&str> = workflows
        .iter()
        .filter(|w| {
            w.get("requiresSize")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        })
        .filter_map(|w| w.get("id").and_then(|v| v.as_str()))
        .collect();

    let full_set_workflows: Vec<&str> = workflows
        .iter()
        .filter(|w| {
            w.get("outputMode")
                .and_then(|v| v.as_str())
                .map(|m| m == "full_set")
                .unwrap_or(false)
        })
        .filter_map(|w| w.get("id").and_then(|v| v.as_str()))
        .collect();

    // Build per-workflow descriptions
    let workflow_descriptions: String = workflows
        .iter()
        .map(|w| {
            let id = w.get("id").and_then(|v| v.as_str()).unwrap_or("?");
            let label = w.get("label").and_then(|v| v.as_str()).unwrap_or("?");
            let desc = w
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("No description");
            let output_mode = w
                .get("outputMode")
                .and_then(|v| v.as_str())
                .unwrap_or("single_image");
            let supports_image = w
                .get("supportsImageInput")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let requires_size = w
                .get("requiresSize")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let mut tags = Vec::new();
            match output_mode {
                "single_image" => tags.push("single image".to_string()),
                "full_set" => {
                    tags.push("full set — produces album, items, and background".to_string())
                }
                "layered_image" => tags.push("layered image".to_string()),
                _ => {}
            }
            if supports_image {
                tags.push("supports image input".to_string());
            }
            if requires_size {
                tags.push("requires aspect_ratio".to_string());
            }
            let suffix = if tags.is_empty() {
                String::new()
            } else {
                format!(" ({})", tags.join(", "))
            };
            format!("- \"{}\": {} — {}{}", id, label, desc, suffix)
        })
        .collect::<Vec<_>>()
        .join("\n");

    let mut description = format!(
        "Generate an image using one of the available workflows.\n\nAvailable workflows:\n{}",
        workflow_descriptions
    );

    if !size_required.is_empty() {
        description.push_str(&format!(
            "\n\nIMPORTANT: The following workflows REQUIRE aspect_ratio to be provided: {}. Always include aspect_ratio when using these workflows.",
            size_required
                .iter()
                .map(|id| format!("\"{}\"", id))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    if !full_set_workflows.is_empty() {
        description.push_str(
            "\n\nFull-set workflows produce a complete set of game assets from a single call.",
        );
    }

    let mut properties = serde_json::json!({
        "workflow_id": {
            "type": "string",
            "enum": workflow_enum,
            "description": "The ID of the workflow to use for generation"
        },
        "prompt": {
            "type": "string",
            "description": "The image generation prompt. Be descriptive and specific."
        },
        "aspect_ratio": {
            "type": "string",
            "enum": ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
            "description": "Aspect ratio for the generated image. REQUIRED for workflows that need sizing. Default to 1:1 if unsure."
        },
    });

    // Add model_id enum if models are available
    if let Some(mdls) = models {
        if !mdls.is_empty() {
            let model_enum: Vec<&str> = mdls
                .iter()
                .filter_map(|m| m.get("id").and_then(|v| v.as_str()))
                .collect();
            let model_descriptions: String = mdls
                .iter()
                .map(|m| {
                    let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("?");
                    let name = m.get("name").and_then(|v| v.as_str()).unwrap_or("?");
                    let tags: Vec<&str> = m
                        .get("tags")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|t| t.as_str()).collect())
                        .unwrap_or_default();
                    format!("- \"{}\": {} [{}]", id, name, tags.join(", "))
                })
                .collect::<Vec<_>>()
                .join("\n");

            if let Some(props) = properties.as_object_mut() {
                props.insert(
                    "model_id".to_string(),
                    serde_json::json!({
                        "type": "string",
                        "enum": model_enum,
                        "description": format!(
                            "The LoRA model to use. Pick the model whose name/tags best match the request.\n\nAvailable models:\n{}",
                            model_descriptions
                        )
                    }),
                );
            }
        }
    }

    serde_json::json!({
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": ["workflow_id", "prompt"]
            }
        }
    })
}

/// Fallback generate_image tool when no workflows are loaded (backwards compat).
fn build_fallback_generate_image_tool() -> serde_json::Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": "Generate an image using a workflow",
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_id": { "type": "string", "description": "Workflow ID to use" },
                    "prompt": { "type": "string", "description": "Image generation prompt" },
                    "aspect_ratio": {
                        "type": "string",
                        "enum": ["1:1", "16:9", "9:16", "4:3", "3:4"],
                        "description": "Aspect ratio"
                    },
                    "model_id": { "type": "string", "description": "Optional model ID" }
                },
                "required": ["workflow_id", "prompt"]
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dynamic_generate_image_schema_requires_workflow_id_and_omits_count() {
        let workflows = vec![serde_json::json!({
            "id": "wf-1",
            "label": "Workflow",
            "description": "Generates one image",
            "outputMode": "single_image",
            "supportsImageInput": false,
            "requiresSize": true
        })];

        let tool = build_dynamic_generate_image_tool(&workflows, None);
        let parameters = &tool["function"]["parameters"];

        assert_eq!(
            parameters["required"].as_array().unwrap(),
            &vec![
                serde_json::json!("workflow_id"),
                serde_json::json!("prompt")
            ]
        );
        assert!(parameters["properties"].get("count").is_none());
    }

    #[test]
    fn fallback_generate_image_schema_requires_workflow_id_and_omits_count() {
        let tool = build_fallback_generate_image_tool();
        let parameters = &tool["function"]["parameters"];

        assert_eq!(
            parameters["required"].as_array().unwrap(),
            &vec![
                serde_json::json!("workflow_id"),
                serde_json::json!("prompt")
            ]
        );
        assert!(parameters["properties"].get("count").is_none());
    }
}
