use sqlx::{FromRow, SqlitePool};

use crate::db::models::AssetTypeRecord;
use crate::error::{AppError, AppResult};

#[derive(Debug, FromRow)]
struct AssetTypeRow {
    id: String,
    display_name: String,
    description: Option<String>,
    aspect_ratio: String,
    display_sort_order: i64,
    grid_row: String,
    grid_size_class: Option<String>,
    default_prompt_template: Option<String>,
    default_width: i64,
    default_height: i64,
    is_downloadable: bool,
    is_regenable: bool,
    is_inpaintable: bool,
    is_visible: bool,
    is_system: bool,
    created_at: String,
    updated_at: String,
}

impl From<AssetTypeRow> for AssetTypeRecord {
    fn from(r: AssetTypeRow) -> Self {
        AssetTypeRecord {
            id: r.id,
            display_name: r.display_name,
            description: r.description,
            aspect_ratio: r.aspect_ratio,
            display_sort_order: r.display_sort_order,
            grid_row: r.grid_row,
            grid_size_class: r.grid_size_class.unwrap_or_else(|| "w-1/4".into()),
            default_prompt_template: r.default_prompt_template,
            default_width: r.default_width,
            default_height: r.default_height,
            is_downloadable: r.is_downloadable,
            is_regenable: r.is_regenable,
            is_inpaintable: r.is_inpaintable,
            is_visible: r.is_visible,
            is_system: r.is_system,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

pub async fn list_all(pool: &SqlitePool) -> AppResult<Vec<AssetTypeRecord>> {
    let rows: Vec<AssetTypeRow> = sqlx::query_as(
        "SELECT id, display_name, description, aspect_ratio, display_sort_order, grid_row,
                grid_size_class, default_prompt_template, default_width, default_height,
                is_downloadable, is_regenable, is_inpaintable, is_visible, is_system,
                created_at, updated_at
         FROM asset_types ORDER BY display_sort_order ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(AssetTypeRecord::from).collect())
}

pub async fn get_by_id(pool: &SqlitePool, id: &str) -> AppResult<Option<AssetTypeRecord>> {
    let row: Option<AssetTypeRow> = sqlx::query_as(
        "SELECT id, display_name, description, aspect_ratio, display_sort_order, grid_row,
                grid_size_class, default_prompt_template, default_width, default_height,
                is_downloadable, is_regenable, is_inpaintable, is_visible, is_system,
                created_at, updated_at
         FROM asset_types WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(AssetTypeRecord::from))
}

pub async fn create(pool: &SqlitePool, record: &AssetTypeRecord) -> AppResult<AssetTypeRecord> {
    sqlx::query(
        "INSERT INTO asset_types (id, display_name, description, aspect_ratio, display_sort_order, grid_row,
         grid_size_class, default_prompt_template, default_width, default_height,
         is_downloadable, is_regenable, is_inpaintable, is_visible, is_system)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&record.id)
    .bind(&record.display_name)
    .bind(&record.description)
    .bind(&record.aspect_ratio)
    .bind(record.display_sort_order)
    .bind(&record.grid_row)
    .bind(&record.grid_size_class)
    .bind(&record.default_prompt_template)
    .bind(record.default_width)
    .bind(record.default_height)
    .bind(record.is_downloadable)
    .bind(record.is_regenable)
    .bind(record.is_inpaintable)
    .bind(record.is_visible)
    .bind(record.is_system)
    .execute(pool)
    .await?;

    get_by_id(pool, &record.id)
        .await?
        .ok_or_else(|| AppError::Internal("Failed to create asset type".into()))
}

pub async fn update(
    pool: &SqlitePool,
    id: &str,
    record: &AssetTypeRecord,
) -> AppResult<AssetTypeRecord> {
    sqlx::query(
        "UPDATE asset_types SET display_name = ?, description = ?, aspect_ratio = ?,
         display_sort_order = ?, grid_row = ?, grid_size_class = ?,
         default_prompt_template = ?, default_width = ?, default_height = ?,
         is_downloadable = ?, is_regenable = ?, is_inpaintable = ?, is_visible = ?,
         updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(&record.display_name)
    .bind(&record.description)
    .bind(&record.aspect_ratio)
    .bind(record.display_sort_order)
    .bind(&record.grid_row)
    .bind(&record.grid_size_class)
    .bind(&record.default_prompt_template)
    .bind(record.default_width)
    .bind(record.default_height)
    .bind(record.is_downloadable)
    .bind(record.is_regenable)
    .bind(record.is_inpaintable)
    .bind(record.is_visible)
    .bind(id)
    .execute(pool)
    .await?;

    get_by_id(pool, id)
        .await?
        .ok_or_else(|| AppError::Internal("Asset type not found after update".into()))
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<bool> {
    let result = sqlx::query("DELETE FROM asset_types WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn get_asset_count(pool: &SqlitePool, type_id: &str) -> AppResult<i64> {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM assets WHERE type = ?")
        .bind(type_id)
        .fetch_one(pool)
        .await?;
    Ok(row.0)
}
