//! Provider model search and discovery (Replicate, fal.ai, OpenRouter).

use serde::Serialize;

use crate::error::AppResult;
use crate::providers::common::{bearer_headers, get_json, key_headers};

const REPLICATE_BASE: &str = "https://api.replicate.com/v1";
const FAL_BASE: &str = "https://api.fal.ai/v1";
const OPENROUTER_BASE: &str = "https://openrouter.ai/api/v1";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredModel {
    pub model_id: String,
    pub display_name: String,
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_count: Option<u64>,
    pub provider: String,
}

/// Search Replicate image generation models.
///
/// Uses the `text-to-image` collection for curated image models,
/// then filters client-side by query.
pub async fn search_replicate_models(
    client: &reqwest::Client,
    api_key: &str,
    query: Option<&str>,
    limit: Option<usize>,
    _cursor: Option<&str>,
) -> AppResult<(Vec<DiscoveredModel>, Option<String>)> {
    let limit = limit.unwrap_or(25).min(100);

    let url = format!("{}/collections/official", REPLICATE_BASE);

    let data: serde_json::Value =
        get_json(client, &url, Some(bearer_headers(api_key)?), 10_000).await?;

    let results = data["models"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let query_lower = query.map(|q| q.to_lowercase());

    let models: Vec<DiscoveredModel> = results
        .iter()
        .filter(|m| {
            if let Some(ref q) = query_lower {
                let owner = m["owner"].as_str().unwrap_or("");
                let name = m["name"].as_str().unwrap_or("");
                let desc = m["description"].as_str().unwrap_or("");
                let full_name = format!("{}/{}", owner, name).to_lowercase();
                full_name.contains(q) || desc.to_lowercase().contains(q)
            } else {
                true
            }
        })
        .take(limit)
        .filter_map(|m| {
            let owner = m["owner"].as_str()?;
            let name = m["name"].as_str()?;
            Some(DiscoveredModel {
                model_id: format!("{}/{}", owner, name),
                display_name: format!("{}/{}", owner, name),
                description: m["description"].as_str().map(|s| s.to_string()),
                thumbnail_url: m["cover_image_url"].as_str().map(|s| s.to_string()),
                run_count: m["run_count"].as_u64(),
                provider: "replicate".to_string(),
            })
        })
        .collect();

    Ok((models, None))
}

/// Get Replicate model details including schema.
pub async fn get_replicate_model_detail(
    client: &reqwest::Client,
    api_key: &str,
    owner: &str,
    name: &str,
) -> AppResult<serde_json::Value> {
    let url = format!("{}/models/{}/{}", REPLICATE_BASE, owner, name);
    get_json(client, &url, Some(bearer_headers(api_key)?), 10_000).await
}

/// Get Replicate model input parameters from its OpenAPI schema.
pub async fn get_replicate_model_parameters(
    client: &reqwest::Client,
    api_key: &str,
    owner: &str,
    name: &str,
) -> AppResult<serde_json::Value> {
    let readme_url = format!("{}/models/{}/{}/readme", REPLICATE_BASE, owner, name);
    let headers = bearer_headers(api_key)?;

    // Fetch model detail and readme in parallel
    let (model, readme_res) = tokio::join!(
        get_replicate_model_detail(client, api_key, owner, name),
        get_json(client, &readme_url, Some(headers.clone()), 10_000)
    );

    let model = model?;
    let readme: Option<String> = readme_res.ok().and_then(|v: serde_json::Value| {
        v.get("content").and_then(|c: &serde_json::Value| c.as_str().map(|s: &str| s.to_string()))
    });
    let description = model.get("description")
        .and_then(|d| d.as_str().map(|s| s.to_string()));

    let schemas = model
        .get("latest_version")
        .and_then(|v| v.get("openapi_schema"))
        .and_then(|s| s.get("components"))
        .and_then(|c| c.get("schemas"));

    let input_schema = schemas
        .and_then(|s| s.get("Input"))
        .cloned()
        .unwrap_or(serde_json::json!({}));

    // Return the Input schema, sibling definitions, readme, and description
    let mut result = serde_json::json!({
        "input": input_schema,
        "readme": readme,
        "description": description,
    });
    if let Some(s) = schemas {
        result["definitions"] = s.clone();
    }
    Ok(result)
}

/// Search fal.ai models.
pub async fn search_fal_models(
    client: &reqwest::Client,
    api_key: &str,
    query: Option<&str>,
    category: Option<&str>,
    limit: Option<usize>,
) -> AppResult<(Vec<DiscoveredModel>, Option<String>)> {
    let limit = limit.unwrap_or(25).min(100);
    let mut url = format!("{}/models?limit={}", FAL_BASE, limit);

    if let Some(q) = query {
        url.push_str(&format!("&q={}", urlencoding::encode(q)));
    }
    if let Some(cat) = category {
        url.push_str(&format!("&category={}", urlencoding::encode(cat)));
    }

    let data: serde_json::Value =
        get_json(client, &url, Some(key_headers(api_key)?), 10_000).await?;

    let results = data["models"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let models: Vec<DiscoveredModel> = results
        .iter()
        .filter_map(|m| {
            let endpoint_id = m["endpoint_id"].as_str()?;
            let meta = &m["metadata"];
            Some(DiscoveredModel {
                model_id: endpoint_id.to_string(),
                display_name: meta["display_name"]
                    .as_str()
                    .unwrap_or(endpoint_id)
                    .to_string(),
                description: meta["description"].as_str().map(|s| s.to_string()),
                thumbnail_url: meta["thumbnail_url"].as_str().map(|s| s.to_string()),
                run_count: None,
                provider: "fal".to_string(),
            })
        })
        .collect();

    let next_cursor = data["next_cursor"].as_str().map(|s| s.to_string());

    Ok((models, next_cursor))
}

/// Get fal.ai model detail with OpenAPI schema.
pub async fn get_fal_model_detail(
    client: &reqwest::Client,
    api_key: &str,
    endpoint_id: &str,
) -> AppResult<serde_json::Value> {
    let url = format!("https://fal.run/{}?_openapi=true", endpoint_id);
    get_json(client, &url, Some(key_headers(api_key)?), 10_000).await
}

/// Get fal.ai model input parameters from its OpenAPI schema.
pub async fn get_fal_model_parameters(
    client: &reqwest::Client,
    api_key: &str,
    endpoint_id: &str,
) -> AppResult<serde_json::Value> {
    let openapi = get_fal_model_detail(client, api_key, endpoint_id).await?;

    // FAL OpenAPI schemas expose input under paths → /{endpoint_id} → post → requestBody
    let input_schema = openapi
        .get("paths")
        .and_then(|p| {
            // Try the first path entry
            p.as_object()
                .and_then(|obj| obj.values().next())
        })
        .and_then(|path| path.get("post"))
        .and_then(|post| post.get("requestBody"))
        .and_then(|rb| rb.get("content"))
        .and_then(|c| c.get("application/json"))
        .and_then(|j| j.get("schema"))
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    let definitions = openapi
        .get("components")
        .and_then(|c| c.get("schemas"))
        .cloned();

    let info = openapi.get("info").cloned().unwrap_or(serde_json::json!({}));
    let description = info.get("description").and_then(|d| d.as_str()).map(|s| s.to_string());

    let mut result = serde_json::json!({
        "input": input_schema,
        "description": description,
    });
    if let Some(defs) = definitions {
        result["definitions"] = defs;
    }
    Ok(result)
}

/// Search OpenRouter models with image output modality.
pub async fn search_openrouter_models(
    client: &reqwest::Client,
    api_key: &str,
    query: Option<&str>,
    limit: Option<usize>,
) -> AppResult<(Vec<DiscoveredModel>, Option<String>)> {
    let url = format!("{}/models?output_modalities=image", OPENROUTER_BASE);

    let mut headers = bearer_headers(api_key)?;
    headers.insert(
        reqwest::header::HeaderName::from_static("http-referer"),
        reqwest::header::HeaderValue::from_static("https://imgimg.app"),
    );

    let data: serde_json::Value = get_json(client, &url, Some(headers), 15_000).await?;

    let results = data["data"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let limit = limit.unwrap_or(25).min(100);
    let query_lower = query.map(|q| q.to_lowercase());

    let models: Vec<DiscoveredModel> = results
        .iter()
        .filter(|m| {
            if let Some(ref q) = query_lower {
                let id = m["id"].as_str().unwrap_or("");
                let name = m["name"].as_str().unwrap_or("");
                id.to_lowercase().contains(q) || name.to_lowercase().contains(q)
            } else {
                true
            }
        })
        .take(limit)
        .filter_map(|m| {
            let id = m["id"].as_str()?;
            Some(DiscoveredModel {
                model_id: id.to_string(),
                display_name: m["name"].as_str().unwrap_or(id).to_string(),
                description: m["description"].as_str().map(|s| s.to_string()),
                thumbnail_url: None,
                run_count: None,
                provider: "openrouter".to_string(),
            })
        })
        .collect();

    Ok((models, None))
}
