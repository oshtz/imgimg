use std::collections::HashMap;

use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use crate::db::models::{
    Asset, AssetRow, GalleryCursor, GalleryListResult, Generation, GenerationRow,
};
use crate::error::{AppError, AppResult};
use crate::utils::time::now_iso;

const RECENT_GENERATION_LIMIT: i64 = 500;

#[allow(dead_code)]
pub async fn create(pool: &SqlitePool, gen: &Generation) -> AppResult<()> {
    let mut tx = pool.begin().await?;

    let workflow_params_json = gen
        .workflow_params
        .as_ref()
        .map(serde_json::to_string)
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
         FROM generations ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .bind(RECENT_GENERATION_LIMIT)
    .fetch_all(pool)
    .await?;

    hydrate_generations(pool, rows).await
}

pub async fn list_for_user(pool: &SqlitePool, user_ids: &[String]) -> AppResult<Vec<Generation>> {
    if user_ids.is_empty() {
        return Ok(vec![]);
    }
    let mut builder = QueryBuilder::<Sqlite>::new(
        "SELECT id, user_id, model_id, prompt, seed, workflow_used,
                status, job_id, error, created_at, updated_at,
                batch_size, width, height, image_input_url, workflow_params
         FROM generations WHERE user_id IN (",
    );
    {
        let mut separated = builder.separated(", ");
        for user_id in user_ids {
            separated.push_bind(user_id);
        }
        separated.push_unseparated(")");
    }
    builder
        .push(" ORDER BY created_at DESC, id DESC LIMIT ")
        .push_bind(RECENT_GENERATION_LIMIT);

    let rows = builder.build_query_as().fetch_all(pool).await?;
    hydrate_generations(pool, rows).await
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

pub async fn reconcile_interrupted_jobs(pool: &SqlitePool) -> AppResult<u64> {
    let result = sqlx::query(
        "UPDATE generations
         SET status = 'interrupted',
             error = 'The app closed before this operation finished. Retry it when ready.',
             updated_at = ?
         WHERE status IN ('queued', 'running', 'cancel_requested')",
    )
    .bind(now_iso())
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

pub async fn mark_job_running(pool: &SqlitePool, id: &str, job_id: &str) -> AppResult<bool> {
    let result = sqlx::query(
        "UPDATE generations SET status = 'running', updated_at = ?
         WHERE id = ? AND job_id = ? AND status = 'queued'",
    )
    .bind(now_iso())
    .bind(id)
    .bind(job_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() == 1)
}

pub async fn request_job_cancellation(
    pool: &SqlitePool,
    id: &str,
    job_id: &str,
) -> AppResult<bool> {
    let result = sqlx::query(
        "UPDATE generations SET status = 'cancel_requested', updated_at = ?
         WHERE id = ? AND job_id = ? AND status IN ('queued', 'running')",
    )
    .bind(now_iso())
    .bind(id)
    .bind(job_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() == 1)
}

pub async fn finish_job(
    pool: &SqlitePool,
    id: &str,
    job_id: &str,
    status: &str,
    error: Option<&str>,
) -> AppResult<bool> {
    let result = sqlx::query(
        "UPDATE generations SET status = ?, error = ?, updated_at = ?
         WHERE id = ? AND job_id = ? AND status = 'running'",
    )
    .bind(status)
    .bind(error)
    .bind(now_iso())
    .bind(id)
    .bind(job_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() == 1)
}

pub async fn finish_cancellation(pool: &SqlitePool, id: &str, job_id: &str) -> AppResult<bool> {
    let result = sqlx::query(
        "UPDATE generations SET status = 'cancelled', error = NULL, updated_at = ?
         WHERE id = ? AND job_id = ? AND status = 'cancel_requested'",
    )
    .bind(now_iso())
    .bind(id)
    .bind(job_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() == 1)
}

pub async fn upsert_asset(pool: &SqlitePool, generation_id: &str, asset: &Asset) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    upsert_asset_in_tx(&mut tx, generation_id, asset).await?;
    tx.commit().await?;
    Ok(())
}

async fn upsert_asset_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    generation_id: &str,
    asset: &Asset,
) -> AppResult<()> {
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
    .execute(&mut **tx)
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
    .execute(&mut **tx)
    .await?;

    // Update generation's updated_at
    let now = now_iso();
    sqlx::query("UPDATE generations SET updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(generation_id)
        .execute(&mut **tx)
        .await?;

    Ok(())
}

pub async fn upsert_assets(
    pool: &SqlitePool,
    generation_id: &str,
    assets: &[Asset],
) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for asset in assets {
        upsert_asset_in_tx(&mut tx, generation_id, asset).await?;
    }
    tx.commit().await?;
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
    let mut tx = pool.begin().await?;
    // Find the asset to get its type and item_index
    let row: Option<(String, Option<i64>)> =
        sqlx::query_as("SELECT type, item_index FROM assets WHERE id = ? AND generation_id = ?")
            .bind(asset_id)
            .bind(generation_id)
            .fetch_optional(&mut *tx)
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
    .execute(&mut *tx)
    .await?;

    // Mark requested asset active
    sqlx::query("UPDATE assets SET is_active = 1 WHERE id = ?")
        .bind(asset_id)
        .execute(&mut *tx)
        .await?;

    // Update generation's updated_at
    let now = now_iso();
    sqlx::query("UPDATE generations SET updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(generation_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
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

async fn hydrate_generations(
    pool: &SqlitePool,
    rows: Vec<GenerationRow>,
) -> AppResult<Vec<Generation>> {
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let mut assets_query = QueryBuilder::<Sqlite>::new(
        "SELECT id, generation_id, type, url, item_index, created_at, is_active, prompt
         FROM assets WHERE is_active = 1 AND generation_id IN (",
    );
    {
        let mut separated = assets_query.separated(", ");
        for row in &rows {
            separated.push_bind(&row.id);
        }
        separated.push_unseparated(") ORDER BY generation_id, created_at");
    }

    let asset_rows: Vec<AssetRow> = assets_query.build_query_as().fetch_all(pool).await?;
    let mut assets_by_generation: HashMap<String, Vec<Asset>> = HashMap::new();
    for asset in asset_rows.into_iter().map(Asset::from) {
        assets_by_generation
            .entry(asset.generation_id.clone())
            .or_default()
            .push(asset);
    }

    Ok(rows
        .into_iter()
        .map(|row| {
            let assets = assets_by_generation.remove(&row.id).unwrap_or_default();
            row.into_generation(assets)
        })
        .collect())
}

#[derive(sqlx::FromRow)]
struct GalleryGenerationRow {
    id: String,
    user_id: String,
    model_id: String,
    prompt: String,
    seed: i64,
    workflow_used: String,
    status: String,
    job_id: Option<String>,
    error: Option<String>,
    created_at: String,
    updated_at: String,
    batch_size: Option<i64>,
    width: Option<i64>,
    height: Option<i64>,
    image_input_url: Option<String>,
    workflow_params: Option<String>,
    search_rank: Option<f64>,
}

impl GalleryGenerationRow {
    fn into_generation_row(self) -> GenerationRow {
        GenerationRow {
            id: self.id,
            user_id: self.user_id,
            model_id: self.model_id,
            prompt: self.prompt,
            seed: self.seed,
            workflow_used: self.workflow_used,
            status: self.status,
            job_id: self.job_id,
            error: self.error,
            created_at: self.created_at,
            updated_at: self.updated_at,
            batch_size: self.batch_size,
            width: self.width,
            height: self.height,
            image_input_url: self.image_input_url,
            workflow_params: self.workflow_params,
        }
    }
}

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

    let mut builder = QueryBuilder::<Sqlite>::new(
        "SELECT g.id, g.user_id, g.model_id, g.prompt, g.seed, g.workflow_used,
                g.status, g.job_id, g.error, g.created_at, g.updated_at,
                g.batch_size, g.width, g.height, g.image_input_url, g.workflow_params, ",
    );
    if let Some(search_query) = search_query {
        builder.push("-bm25(generations_fts) AS search_rank FROM generations g INNER JOIN generations_fts ON generations_fts.rowid = g.rowid WHERE generations_fts MATCH ");
        builder.push_bind(search_query);
    } else {
        builder.push("NULL AS search_rank FROM generations g WHERE 1 = 1");
    }
    if let Some(workflow_id) = workflow_id {
        builder
            .push(" AND g.workflow_used = ")
            .push_bind(workflow_id);
    }
    if let Some(model_id) = model_id {
        builder.push(" AND g.model_id = ").push_bind(model_id);
    }
    if let Some(cursor) = cursor {
        if search_query.is_some() {
            let rank = cursor
                .rank
                .ok_or_else(|| AppError::BadRequest("Search cursor is missing its rank".into()))?;
            builder
                .push(" AND (-bm25(generations_fts) < ")
                .push_bind(rank);
            builder
                .push(" OR (-bm25(generations_fts) = ")
                .push_bind(rank);
            builder
                .push(" AND g.created_at < ")
                .push_bind(&cursor.created_at)
                .push(")");
            builder
                .push(" OR (-bm25(generations_fts) = ")
                .push_bind(rank);
            builder
                .push(" AND g.created_at = ")
                .push_bind(&cursor.created_at);
            builder
                .push(" AND g.id < ")
                .push_bind(&cursor.id)
                .push("))");
        } else {
            builder
                .push(" AND (g.created_at < ")
                .push_bind(&cursor.created_at);
            builder
                .push(" OR (g.created_at = ")
                .push_bind(&cursor.created_at);
            builder
                .push(" AND g.id < ")
                .push_bind(&cursor.id)
                .push("))");
        }
    }
    if search_query.is_some() {
        builder.push(" ORDER BY search_rank DESC, g.created_at DESC, g.id DESC");
    } else {
        builder.push(" ORDER BY g.created_at DESC, g.id DESC");
    }
    builder.push(" LIMIT ").push_bind(limit + 1);
    let mut rows: Vec<GalleryGenerationRow> = builder.build_query_as().fetch_all(pool).await?;

    let has_more = rows.len() as i64 > limit;
    if has_more {
        rows.truncate(limit as usize);
    }
    let next_cursor = if has_more {
        rows.last().map(|row| GalleryCursor {
            created_at: row.created_at.clone(),
            id: row.id.clone(),
            rank: row.search_rank,
        })
    } else {
        None
    };

    let mut assets_by_generation: HashMap<String, Vec<Asset>> = HashMap::new();
    if !rows.is_empty() {
        let mut assets_query = QueryBuilder::<Sqlite>::new(
            "SELECT id, generation_id, type, url, item_index, created_at, is_active, prompt FROM assets WHERE is_active = 1 AND generation_id IN (",
        );
        let mut separated = assets_query.separated(", ");
        for row in &rows {
            separated.push_bind(&row.id);
        }
        separated.push_unseparated(") ORDER BY generation_id, is_active DESC, created_at DESC");
        let asset_rows: Vec<AssetRow> = assets_query.build_query_as().fetch_all(pool).await?;
        for asset in asset_rows.into_iter().map(Asset::from) {
            assets_by_generation
                .entry(asset.generation_id.clone())
                .or_default()
                .push(asset);
        }
    }
    let items = rows
        .into_iter()
        .map(|row| {
            let assets = assets_by_generation.remove(&row.id).unwrap_or_default();
            row.into_generation_row().into_generation(assets)
        })
        .collect();

    Ok(GalleryListResult { items, next_cursor })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::migrations::run_migrations(&pool, None)
            .await
            .unwrap();
        pool
    }

    fn generation(id: &str, prompt: &str, workflow: &str, model: &str) -> Generation {
        Generation {
            id: id.into(),
            user_id: "local-user".into(),
            model_id: model.into(),
            prompt: prompt.into(),
            seed: 1,
            workflow_used: workflow.into(),
            status: "queued".into(),
            created_at: format!("2026-01-01T00:00:0{}Z", &id[id.len() - 1..]),
            updated_at: "2026-01-01T00:00:00Z".into(),
            job_id: Some(format!("job-{id}")),
            error: None,
            assets: vec![],
            batch_size: Some(1),
            width: None,
            height: None,
            image_input_url: None,
            workflow_params: None,
        }
    }

    #[tokio::test]
    async fn cancellation_wins_over_a_late_completion() {
        let pool = pool().await;
        let generation = generation("g1", "cat", "w1", "m1");
        create(&pool, &generation).await.unwrap();
        assert!(mark_job_running(&pool, "g1", "job-g1").await.unwrap());
        assert!(request_job_cancellation(&pool, "g1", "job-g1")
            .await
            .unwrap());
        assert!(!finish_job(&pool, "g1", "job-g1", "succeeded", None)
            .await
            .unwrap());
        assert!(finish_cancellation(&pool, "g1", "job-g1").await.unwrap());
        assert_eq!(get(&pool, "g1").await.unwrap().unwrap().status, "cancelled");
    }

    #[tokio::test]
    async fn gallery_combines_filters_and_preserves_search_cursor_rank() {
        let pool = pool().await;
        for generation in [
            generation("g1", "red cat", "w1", "m1"),
            generation("g2", "blue cat", "w2", "m1"),
            generation("g3", "red dog", "w1", "m1"),
        ] {
            create(&pool, &generation).await.unwrap();
        }

        let result = list_gallery_simple(&pool, Some("w1"), Some("m1"), Some("cat"), 1, None)
            .await
            .unwrap();
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].id, "g1");
        assert!(result.next_cursor.is_none());

        let first_page = list_gallery_simple(&pool, None, None, Some("cat"), 1, None)
            .await
            .unwrap();
        let cursor = first_page.next_cursor.expect("second search page");
        assert!(cursor.rank.is_some());
        let second_page = list_gallery_simple(&pool, None, None, Some("cat"), 1, Some(&cursor))
            .await
            .unwrap();
        assert_eq!(second_page.items.len(), 1);
        assert_ne!(first_page.items[0].id, second_page.items[0].id);
    }

    #[tokio::test]
    async fn recent_list_is_bounded_and_hydrates_only_active_assets() {
        let pool = pool().await;
        for index in 0..=RECENT_GENERATION_LIMIT {
            let id = format!("g{index:03}");
            let mut generation = generation(&id, "prompt", "w1", "m1");
            generation.created_at = format!("2026-01-01T00:{index:03}:00Z");
            create(&pool, &generation).await.unwrap();
        }

        for (id, created_at) in [
            ("old", "2026-01-01T00:00:00Z"),
            ("current", "2026-01-02T00:00:00Z"),
        ] {
            upsert_asset(
                &pool,
                "g500",
                &Asset {
                    id: id.into(),
                    generation_id: "g500".into(),
                    asset_type: "image".into(),
                    url: format!("/storage/{id}.png"),
                    item_index: Some(0),
                    created_at: created_at.into(),
                    is_active: true,
                    prompt: None,
                },
            )
            .await
            .unwrap();
        }

        let items = list_all(&pool).await.unwrap();
        assert_eq!(items.len(), RECENT_GENERATION_LIMIT as usize);
        assert!(!items.iter().any(|item| item.id == "g000"));
        let newest = items.iter().find(|item| item.id == "g500").unwrap();
        assert_eq!(newest.assets.len(), 1);
        assert_eq!(newest.assets[0].id, "current");
    }
}
