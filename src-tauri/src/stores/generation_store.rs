use sqlx::SqlitePool;

use crate::db::models::{
    Asset, AssetRow, GalleryCursor, GalleryListResult, Generation, GenerationRow,
};
use crate::error::{AppError, AppResult};
use crate::utils::time::now_iso;

#[allow(dead_code)]

pub async fn create(pool: &SqlitePool, gen: &Generation) -> AppResult<()> {
    let mut tx = pool.begin().await?;

    let workflow_params_json = gen
        .workflow_params
        .as_ref()
        .map(|v| serde_json::to_string(v))
        .transpose()?;

    sqlx::query(
        "INSERT INTO generations (id, user_id, model_id, prompt, seed, workflow_used,
         status, job_id, error, created_at, updated_at,
         batch_size, width, height, image_input_url, workflow_params)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&gen.id)
    .bind(&gen.user_id)
    .bind(&gen.model_id)
    .bind(&gen.prompt)
    .bind(gen.seed)
    .bind(&gen.workflow_used)
    .bind(&gen.status)
    .bind(&gen.job_id)
    .bind(&gen.error)
    .bind(&gen.created_at)
    .bind(&gen.updated_at)
    .bind(gen.batch_size)
    .bind(gen.width)
    .bind(gen.height)
    .bind(&gen.image_input_url)
    .bind(&workflow_params_json)
    .execute(&mut *tx)
    .await?;

    for asset in &gen.assets {
        sqlx::query(
            "INSERT INTO assets (id, generation_id, type, url, item_index, created_at, is_active, prompt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&asset.id)
        .bind(&asset.generation_id)
        .bind(&asset.asset_type)
        .bind(&asset.url)
        .bind(asset.item_index)
        .bind(&asset.created_at)
        .bind(asset.is_active)
        .bind(&asset.prompt)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<Option<Generation>> {
    let row: Option<GenerationRow> = sqlx::query_as(
        "SELECT id, user_id, model_id, prompt, seed, workflow_used,
                status, job_id, error, created_at, updated_at,
                batch_size, width, height, image_input_url, workflow_params
         FROM generations WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    match row {
        Some(gen_row) => {
            let assets = get_active_assets(pool, &gen_row.id).await?;
            Ok(Some(gen_row.into_generation(assets)))
        }
        None => Ok(None),
    }
}

pub async fn list_all(pool: &SqlitePool) -> AppResult<Vec<Generation>> {
    let rows: Vec<GenerationRow> = sqlx::query_as(
        "SELECT id, user_id, model_id, prompt, seed, workflow_used,
                status, job_id, error, created_at, updated_at,
                batch_size, width, height, image_input_url, workflow_params
         FROM generations ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;

    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        let assets = get_active_assets(pool, &row.id).await?;
        result.push(row.into_generation(assets));
    }
    Ok(result)
}

pub async fn list_for_user(pool: &SqlitePool, user_ids: &[String]) -> AppResult<Vec<Generation>> {
    if user_ids.is_empty() {
        return Ok(vec![]);
    }
    // Build placeholders for IN clause
    let placeholders: Vec<String> = (0..user_ids.len()).map(|_| "?".to_string()).collect();
    let sql = format!(
        "SELECT id, user_id, model_id, prompt, seed, workflow_used,
                status, job_id, error, created_at, updated_at,
                batch_size, width, height, image_input_url, workflow_params
         FROM generations WHERE user_id IN ({}) ORDER BY created_at DESC",
        placeholders.join(", ")
    );

    let mut query = sqlx::query_as::<_, GenerationRow>(&sql);
    for uid in user_ids {
        query = query.bind(uid);
    }

    let rows: Vec<GenerationRow> = query.fetch_all(pool).await?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        let assets = get_active_assets(pool, &row.id).await?;
        result.push(row.into_generation(assets));
    }
    Ok(result)
}


pub async fn list_gallery_users(pool: &SqlitePool) -> AppResult<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT user_id FROM generations WHERE user_id IS NOT NULL ORDER BY user_id ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id,)| id)
        .filter(|id| !id.trim().is_empty())
        .collect())
}

pub async fn update_status(
    pool: &SqlitePool,
    id: &str,
    status: &str,
    job_id: Option<Option<&str>>,
    error: Option<Option<&str>>,
) -> AppResult<()> {
    let now = now_iso();

    match (job_id, error) {
        (Some(jid), Some(err)) => {
            sqlx::query(
                "UPDATE generations SET status = ?, updated_at = ?, job_id = ?, error = ? WHERE id = ?",
            )
            .bind(status)
            .bind(&now)
            .bind(jid)
            .bind(err)
            .bind(id)
            .execute(pool)
            .await?;
        }
        (Some(jid), None) => {
            sqlx::query(
                "UPDATE generations SET status = ?, updated_at = ?, job_id = ? WHERE id = ?",
            )
            .bind(status)
            .bind(&now)
            .bind(jid)
            .bind(id)
            .execute(pool)
            .await?;
        }
        (None, Some(err)) => {
            sqlx::query(
                "UPDATE generations SET status = ?, updated_at = ?, error = ? WHERE id = ?",
            )
            .bind(status)
            .bind(&now)
            .bind(err)
            .bind(id)
            .execute(pool)
            .await?;
        }
        (None, None) => {
            sqlx::query("UPDATE generations SET status = ?, updated_at = ? WHERE id = ?")
                .bind(status)
                .bind(&now)
                .bind(id)
                .execute(pool)
                .await?;
        }
    }
    Ok(())
}

pub async fn upsert_asset(pool: &SqlitePool, generation_id: &str, asset: &Asset) -> AppResult<()> {
    // Mark existing assets with same type and itemIndex as inactive
    sqlx::query(
        "UPDATE assets SET is_active = 0 WHERE generation_id = ? AND type = ? AND
         (item_index = ? OR (item_index IS NULL AND ? IS NULL)) AND is_active = 1 AND id != ?",
    )
    .bind(generation_id)
    .bind(&asset.asset_type)
    .bind(asset.item_index)
    .bind(asset.item_index)
    .bind(&asset.id)
    .execute(pool)
    .await?;

    // Insert new asset or update existing
    sqlx::query(
        "INSERT INTO assets (id, generation_id, type, url, item_index, created_at, is_active, prompt)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT (id) DO UPDATE SET
           url = excluded.url,
           is_active = 1,
           type = excluded.type,
           item_index = excluded.item_index,
           prompt = COALESCE(excluded.prompt, assets.prompt)",
    )
    .bind(&asset.id)
    .bind(generation_id)
    .bind(&asset.asset_type)
    .bind(&asset.url)
    .bind(asset.item_index)
    .bind(&asset.created_at)
    .bind(&asset.prompt)
    .execute(pool)
    .await?;

    // Update generation's updated_at
    let now = now_iso();
    sqlx::query("UPDATE generations SET updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(generation_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn upsert_assets(
    pool: &SqlitePool,
    generation_id: &str,
    assets: &[Asset],
) -> AppResult<()> {
    for asset in assets {
        upsert_asset(pool, generation_id, asset).await?;
    }
    Ok(())
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM generations WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_asset_versions(
    pool: &SqlitePool,
    generation_id: &str,
    asset_type: &str,
    item_index: Option<i64>,
) -> AppResult<Vec<Asset>> {
    let rows: Vec<AssetRow> = sqlx::query_as(
        "SELECT id, generation_id, type, url, item_index, created_at, is_active, prompt
         FROM assets
         WHERE generation_id = ? AND type = ? AND
         (item_index = ? OR (item_index IS NULL AND ? IS NULL))
         ORDER BY created_at DESC",
    )
    .bind(generation_id)
    .bind(asset_type)
    .bind(item_index)
    .bind(item_index)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(Asset::from).collect())
}

pub async fn set_active_asset_version(
    pool: &SqlitePool,
    generation_id: &str,
    asset_id: &str,
) -> AppResult<()> {
    // Find the asset to get its type and item_index
    let row: Option<(String, Option<i64>)> = sqlx::query_as(
        "SELECT type, item_index FROM assets WHERE id = ? AND generation_id = ?",
    )
    .bind(asset_id)
    .bind(generation_id)
    .fetch_optional(pool)
    .await?;

    let (asset_type, item_index) =
        row.ok_or_else(|| AppError::NotFound(format!("Asset {asset_id} not found")))?;

    // Mark all versions inactive
    sqlx::query(
        "UPDATE assets SET is_active = 0 WHERE generation_id = ? AND type = ? AND
         (item_index = ? OR (item_index IS NULL AND ? IS NULL))",
    )
    .bind(generation_id)
    .bind(&asset_type)
    .bind(item_index)
    .bind(item_index)
    .execute(pool)
    .await?;

    // Mark requested asset active
    sqlx::query("UPDATE assets SET is_active = 1 WHERE id = ?")
        .bind(asset_id)
        .execute(pool)
        .await?;

    // Update generation's updated_at
    let now = now_iso();
    sqlx::query("UPDATE generations SET updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(generation_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn get_all_assets_for_generation(
    pool: &SqlitePool,
    generation_id: &str,
) -> AppResult<Vec<Asset>> {
    let rows: Vec<AssetRow> = sqlx::query_as(
        "SELECT id, generation_id, type, url, item_index, created_at, is_active, prompt
         FROM assets WHERE generation_id = ? ORDER BY type, item_index, created_at DESC",
    )
    .bind(generation_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(Asset::from).collect())
}

// ── Internal helpers ──

async fn get_active_assets(pool: &SqlitePool, generation_id: &str) -> AppResult<Vec<Asset>> {
    let rows: Vec<AssetRow> = sqlx::query_as(
        "SELECT id, generation_id, type, url, item_index, created_at, is_active, prompt
         FROM assets WHERE generation_id = ? AND is_active = 1 ORDER BY created_at",
    )
    .bind(generation_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(Asset::from).collect())
}


/// Simplified gallery query that handles the common cases directly.
/// This replaces the complex dynamic SQL approach above.
pub async fn list_gallery_simple(
    pool: &SqlitePool,
    workflow_id: Option<&str>,
    model_id: Option<&str>,
    query: Option<&str>,
    limit: i64,
    cursor: Option<&GalleryCursor>,
) -> AppResult<GalleryListResult> {
    let limit = limit.clamp(1, 200);
    let search_query = query.map(|q| q.trim()).filter(|q| !q.is_empty());

    let gen_rows: Vec<GenerationRow>;

    if let Some(q) = search_query {
        // FTS5 search
        if let Some(c) = cursor {
            let rank = c.rank.unwrap_or(0.0);
            gen_rows = sqlx::query_as(
                "SELECT g.id, g.user_id, g.model_id, g.prompt, g.seed, g.workflow_used,
                        g.status, g.job_id, g.error, g.created_at, g.updated_at,
                        g.batch_size, g.width, g.height, g.image_input_url, g.workflow_params
                 FROM generations g
                 INNER JOIN generations_fts ON generations_fts.rowid = g.rowid
                 WHERE generations_fts MATCH ?1
                 AND (-bm25(generations_fts) < ?2
                      OR (-bm25(generations_fts) = ?2 AND g.created_at < ?3)
                      OR (-bm25(generations_fts) = ?2 AND g.created_at = ?3 AND g.id < ?4))
                 ORDER BY -bm25(generations_fts) DESC, g.created_at DESC, g.id DESC
                 LIMIT ?5",
            )
            .bind(q)
            .bind(rank)
            .bind(&c.created_at)
            .bind(&c.id)
            .bind(limit + 1)
            .fetch_all(pool)
            .await?;
        } else {
            gen_rows = sqlx::query_as(
                "SELECT g.id, g.user_id, g.model_id, g.prompt, g.seed, g.workflow_used,
                        g.status, g.job_id, g.error, g.created_at, g.updated_at,
                        g.batch_size, g.width, g.height, g.image_input_url, g.workflow_params
                 FROM generations g
                 INNER JOIN generations_fts ON generations_fts.rowid = g.rowid
                 WHERE generations_fts MATCH ?1
                 ORDER BY -bm25(generations_fts) DESC, g.created_at DESC, g.id DESC
                 LIMIT ?2",
            )
            .bind(q)
            .bind(limit + 1)
            .fetch_all(pool)
            .await?;
        }
    } else if let Some(wid) = workflow_id {
        if let Some(c) = cursor {
            gen_rows = sqlx::query_as(
                "SELECT id, user_id, model_id, prompt, seed, workflow_used,
                        status, job_id, error, created_at, updated_at,
                        batch_size, width, height, image_input_url, workflow_params
                 FROM generations
                 WHERE workflow_used = ?1
                 AND (created_at < ?2 OR (created_at = ?2 AND id < ?3))
                 ORDER BY created_at DESC, id DESC
                 LIMIT ?4",
            )
            .bind(wid)
            .bind(&c.created_at)
            .bind(&c.id)
            .bind(limit + 1)
            .fetch_all(pool)
            .await?;
        } else {
            gen_rows = sqlx::query_as(
                "SELECT id, user_id, model_id, prompt, seed, workflow_used,
                        status, job_id, error, created_at, updated_at,
                        batch_size, width, height, image_input_url, workflow_params
                 FROM generations
                 WHERE workflow_used = ?1
                 ORDER BY created_at DESC, id DESC
                 LIMIT ?2",
            )
            .bind(wid)
            .bind(limit + 1)
            .fetch_all(pool)
            .await?;
        }
    } else if let Some(mid) = model_id {
        if let Some(c) = cursor {
            gen_rows = sqlx::query_as(
                "SELECT id, user_id, model_id, prompt, seed, workflow_used,
                        status, job_id, error, created_at, updated_at,
                        batch_size, width, height, image_input_url, workflow_params
                 FROM generations
                 WHERE model_id = ?1
                 AND (created_at < ?2 OR (created_at = ?2 AND id < ?3))
                 ORDER BY created_at DESC, id DESC
                 LIMIT ?4",
            )
            .bind(mid)
            .bind(&c.created_at)
            .bind(&c.id)
            .bind(limit + 1)
            .fetch_all(pool)
            .await?;
        } else {
            gen_rows = sqlx::query_as(
                "SELECT id, user_id, model_id, prompt, seed, workflow_used,
                        status, job_id, error, created_at, updated_at,
                        batch_size, width, height, image_input_url, workflow_params
                 FROM generations
                 WHERE model_id = ?1
                 ORDER BY created_at DESC, id DESC
                 LIMIT ?2",
            )
            .bind(mid)
            .bind(limit + 1)
            .fetch_all(pool)
            .await?;
        }
    } else {
        // No filters
        if let Some(c) = cursor {
            gen_rows = sqlx::query_as(
                "SELECT id, user_id, model_id, prompt, seed, workflow_used,
                        status, job_id, error, created_at, updated_at,
                        batch_size, width, height, image_input_url, workflow_params
                 FROM generations
                 WHERE (created_at < ?1 OR (created_at = ?1 AND id < ?2))
                 ORDER BY created_at DESC, id DESC
                 LIMIT ?3",
            )
            .bind(&c.created_at)
            .bind(&c.id)
            .bind(limit + 1)
            .fetch_all(pool)
            .await?;
        } else {
            gen_rows = sqlx::query_as(
                "SELECT id, user_id, model_id, prompt, seed, workflow_used,
                        status, job_id, error, created_at, updated_at,
                        batch_size, width, height, image_input_url, workflow_params
                 FROM generations
                 ORDER BY created_at DESC, id DESC
                 LIMIT ?1",
            )
            .bind(limit + 1)
            .fetch_all(pool)
            .await?;
        }
    }

    // Load assets for each generation
    let mut items = Vec::with_capacity(gen_rows.len());
    for row in gen_rows {
        let assets = get_all_assets_for_generation(pool, &row.id).await?;
        let mut sorted = assets;
        sorted.sort_by(|a, b| {
            b.is_active
                .cmp(&a.is_active)
                .then_with(|| b.created_at.cmp(&a.created_at))
        });
        items.push(row.into_generation(sorted));
    }

    let has_more = items.len() as i64 > limit;
    if has_more {
        items.truncate(limit as usize);
    }

    let next_cursor = if has_more {
        let last = &items[items.len() - 1];
        Some(GalleryCursor {
            created_at: last.created_at.clone(),
            id: last.id.clone(),
            rank: None,
        })
    } else {
        None
    };

    Ok(GalleryListResult {
        items,
        next_cursor,
    })
}
