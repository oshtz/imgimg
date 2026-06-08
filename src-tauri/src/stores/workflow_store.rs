use std::path::Path;

use sqlx::SqlitePool;

use crate::db::models::WorkflowRecord;
use crate::error::AppResult;

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<WorkflowRecord>> {
    let rows: Vec<(String, String, String, String, String, String, String, String)> =
        sqlx::query_as(
            "SELECT id, label, engine, output_mode, meta, template, created_at, updated_at
             FROM workflows ORDER BY label ASC",
        )
        .fetch_all(pool)
        .await?;

    Ok(rows.into_iter().map(to_record).collect())
}

pub async fn get_by_id(pool: &SqlitePool, id: &str) -> AppResult<Option<WorkflowRecord>> {
    let row: Option<(String, String, String, String, String, String, String, String)> =
        sqlx::query_as(
            "SELECT id, label, engine, output_mode, meta, template, created_at, updated_at
             FROM workflows WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

    Ok(row.map(to_record))
}

/// Get the full workflow template for injection (meta + prompt/template).
pub async fn get_full_template(
    pool: &SqlitePool,
    id: &str,
) -> AppResult<Option<serde_json::Value>> {
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT meta, template FROM workflows WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;

    match row {
        Some((meta_str, template_str)) => {
            let meta: serde_json::Value =
                serde_json::from_str(&meta_str).unwrap_or(serde_json::json!({}));
            let prompt: serde_json::Value =
                serde_json::from_str(&template_str).unwrap_or(serde_json::json!({}));
            Ok(Some(serde_json::json!({ "meta": meta, "prompt": prompt })))
        }
        None => Ok(None),
    }
}

pub async fn upsert(
    pool: &SqlitePool,
    id: &str,
    label: &str,
    engine: &str,
    output_mode: &str,
    meta: &serde_json::Value,
    template: &serde_json::Value,
) -> AppResult<()> {
    let meta_str = serde_json::to_string(meta)?;
    let template_str = serde_json::to_string(template)?;

    sqlx::query(
        "INSERT INTO workflows (id, label, engine, output_mode, meta, template, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (id) DO UPDATE SET
           label = excluded.label,
           engine = excluded.engine,
           output_mode = excluded.output_mode,
           meta = excluded.meta,
           template = excluded.template,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
    )
    .bind(id)
    .bind(label)
    .bind(engine)
    .bind(output_mode)
    .bind(&meta_str)
    .bind(&template_str)
    .execute(pool)
    .await?;
    Ok(())
}

/// Sync workflow JSON files from a directory into the database.
/// Each `.json` file is parsed and upserted; the filename (minus extension) becomes the ID.
/// Stale bundled workflows (present in DB but not on disk) are removed.
pub async fn sync_from_disk(pool: &SqlitePool, workflows_dir: &Path) -> AppResult<usize> {
    // Remove all previously-bundled workflows first; valid ones will be re-inserted below.
    sqlx::query("DELETE FROM workflows WHERE bundled = 1")
        .execute(pool)
        .await?;

    let entries = match std::fs::read_dir(workflows_dir) {
        Ok(entries) => entries,
        Err(e) => {
            log::debug!("No workflows directory found at {}: {e}", workflows_dir.display());
            return Ok(0);
        }
    };

    let mut synced = 0usize;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) if n.ends_with(".json") => n.to_string(),
            _ => continue,
        };
        let id = name.trim_end_matches(".json");

        let raw_str = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("Failed to read workflow file {}: {e}", path.display());
                continue;
            }
        };
        let raw: serde_json::Value = match serde_json::from_str(&raw_str) {
            Ok(v) => v,
            Err(e) => {
                log::warn!("Failed to parse workflow file {}: {e}", path.display());
                continue;
            }
        };

        // Skip files that don't look like imgimg workflows.
        // A valid workflow must have a "meta" object with an "engine" field,
        // or a "prompt" key (legacy format).
        let has_meta_engine = raw
            .get("meta")
            .and_then(|m| m.get("engine"))
            .is_some();
        let has_prompt = raw.get("prompt").is_some();
        if !has_meta_engine && !has_prompt {
            log::debug!("Skipping non-workflow JSON file: {}", path.display());
            continue;
        }

        let meta = raw.get("meta").cloned().unwrap_or(serde_json::json!({}));
        // The template is either under "prompt" or is the whole object minus "meta"
        let template = if let Some(prompt) = raw.get("prompt") {
            prompt.clone()
        } else {
            let mut obj = raw.clone();
            if let Some(map) = obj.as_object_mut() {
                map.remove("meta");
            }
            obj
        };

        let label = meta
            .get("label")
            .and_then(|v| v.as_str())
            .unwrap_or(id)
            .to_string();
        let engine = meta
            .get("engine")
            .and_then(|v| v.as_str())
            .unwrap_or("comfyui")
            .to_string();
        let output_mode = meta
            .get("outputMode")
            .and_then(|v| v.as_str())
            .unwrap_or("single_image")
            .to_string();

        let meta_str = serde_json::to_string(&meta).unwrap_or_default();
        let template_str = serde_json::to_string(&template).unwrap_or_default();
        if let Err(e) = sqlx::query(
            "INSERT INTO workflows (id, label, engine, output_mode, meta, template, bundled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ON CONFLICT (id) DO UPDATE SET
               label = excluded.label,
               engine = excluded.engine,
               output_mode = excluded.output_mode,
               meta = excluded.meta,
               template = excluded.template,
               bundled = 1,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        )
        .bind(id)
        .bind(&label)
        .bind(&engine)
        .bind(&output_mode)
        .bind(&meta_str)
        .bind(&template_str)
        .execute(pool)
        .await {
            log::warn!("Failed to sync workflow {id} from disk: {e}");
            continue;
        }
        synced += 1;
    }

    if synced > 0 {
        log::info!("Synced {synced} workflows from disk");
    }
    Ok(synced)
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<bool> {
    let result = sqlx::query("DELETE FROM workflows WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

fn to_record(
    row: (String, String, String, String, String, String, String, String),
) -> WorkflowRecord {
    WorkflowRecord {
        id: row.0,
        label: row.1,
        engine: row.2,
        output_mode: row.3,
        meta: serde_json::from_str(&row.4).unwrap_or(serde_json::json!({})),
        template: serde_json::from_str(&row.5).unwrap_or(serde_json::json!({})),
        created_at: row.6,
        updated_at: row.7,
    }
}
