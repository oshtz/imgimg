//! OpenAPI schema to WorkflowParameter conversion.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowParameter {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub default: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<ParameterOption>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterOption {
    pub label: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaConversionResult {
    pub parameters: Vec<WorkflowParameter>,
    pub file_input_keys: Vec<String>,
    pub output_mode: String,
}

/// Skipped parameter names (file inputs).
const SKIP_PATTERNS: &[&str] = &[
    "image_url",
    "image",
    "audio",
    "video",
    "mask",
    "reference_audio",
    "input_image",
    "init_image",
];

/// Convert OpenAPI schema properties to WorkflowParameter list.
pub fn convert_schema_to_parameters(
    properties: &serde_json::Value,
    _required: Option<&[String]>,
) -> SchemaConversionResult {
    let mut parameters = Vec::new();
    let mut file_input_keys = Vec::new();

    let props = match properties.as_object() {
        Some(p) => p,
        None => {
            return SchemaConversionResult {
                parameters,
                file_input_keys,
                output_mode: "single_image".to_string(),
            }
        }
    };

    let mut entries: Vec<_> = props.iter().collect();
    // Sort by x-order, then alphabetically
    entries.sort_by(|(a_name, a_val), (b_name, b_val)| {
        let a_order = a_val.get("x-order").and_then(|v| v.as_i64()).unwrap_or(999);
        let b_order = b_val.get("x-order").and_then(|v| v.as_i64()).unwrap_or(999);
        a_order.cmp(&b_order).then(a_name.cmp(b_name))
    });

    for (name, schema) in entries {
        let name_lower = name.to_lowercase();

        // Skip file input fields
        if schema.get("format").and_then(|f| f.as_str()) == Some("uri") {
            file_input_keys.push(name.to_string());
            continue;
        }
        if SKIP_PATTERNS.iter().any(|p| name_lower.contains(p)) {
            file_input_keys.push(name.to_string());
            continue;
        }

        let schema_type = schema.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let label = name.replace('_', " ");
        let description = schema
            .get("description")
            .and_then(|d| d.as_str())
            .map(|s| s.to_string());
        let default_val = schema
            .get("default")
            .cloned()
            .unwrap_or(serde_json::Value::Null);

        // Check for enum
        if let Some(enum_vals) = schema.get("enum").and_then(|e| e.as_array()) {
            let options: Vec<ParameterOption> = enum_vals
                .iter()
                .map(|v| ParameterOption {
                    label: v
                        .as_str()
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| v.to_string()),
                    value: v.clone(),
                })
                .collect();

            parameters.push(WorkflowParameter {
                name: name.to_string(),
                param_type: "select".to_string(),
                label,
                description,
                default: default_val,
                min: None,
                max: None,
                step: None,
                options: Some(options),
            });
            continue;
        }

        match schema_type {
            "number" | "integer" => {
                let min = schema.get("minimum").and_then(|v| v.as_f64());
                let max = schema.get("maximum").and_then(|v| v.as_f64());
                let step = if schema_type == "integer" {
                    Some(1.0)
                } else {
                    None
                };

                parameters.push(WorkflowParameter {
                    name: name.to_string(),
                    param_type: "number".to_string(),
                    label,
                    description,
                    default: default_val,
                    min,
                    max,
                    step,
                    options: None,
                });
            }
            "boolean" => {
                parameters.push(WorkflowParameter {
                    name: name.to_string(),
                    param_type: "boolean".to_string(),
                    label,
                    description,
                    default: default_val,
                    min: None,
                    max: None,
                    step: None,
                    options: None,
                });
            }
            "string" => {
                parameters.push(WorkflowParameter {
                    name: name.to_string(),
                    param_type: "text".to_string(),
                    label,
                    description,
                    default: default_val,
                    min: None,
                    max: None,
                    step: None,
                    options: None,
                });
            }
            _ => {}
        }
    }

    SchemaConversionResult {
        parameters,
        file_input_keys,
        output_mode: "single_image".to_string(),
    }
}
