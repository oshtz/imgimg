use sqlx::SqlitePool;
use std::path::Path;

use crate::error::AppResult;

const DEPRECATED_BUNDLED_WORKFLOW_IDS: &[&str] = &[
    "openrouter-gemini-image",
    "openrouter-gemini-image-2-flash",
    "openrouter-preset-studio",
    "kie-flux-kontext",
    "replicate-grok-imagine-video",
    "replicate-qwen3-tts",
];
pub const LATEST_SCHEMA_VERSION: i64 = 3;

/// Add a column to a table if it doesn't already exist. Returns `true` if the
/// column was added, `false` if it was already present. Real ALTER errors
/// (lock, disk full, schema corruption) propagate instead of being swallowed.
async fn add_column_if_missing(
    pool: &SqlitePool,
    table: &str,
    column: &str,
    column_def: &str,
) -> AppResult<bool> {
    let exists: bool =
        sqlx::query_scalar::<_, i32>("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?")
            .bind(table)
            .bind(column)
            .fetch_one(pool)
            .await?
            > 0;
    if exists {
        return Ok(false);
    }
    let stmt = format!("ALTER TABLE {table} ADD COLUMN {column} {column_def}");
    sqlx::query(&stmt).execute(pool).await?;
    Ok(true)
}

/// Run all database migrations. Creates tables if they don't exist.
pub async fn run_migrations(pool: &SqlitePool, db_path: Option<&Path>) -> AppResult<()> {
    let previous_version = current_schema_version(pool).await?;
    if previous_version < LATEST_SCHEMA_VERSION {
        if let Some(path) = db_path {
            backup_database_if_populated(pool, path, previous_version).await?;
        }
    }

    // Enable WAL mode for better concurrent read performance
    sqlx::query("PRAGMA journal_mode=WAL").execute(pool).await?;
    sqlx::query("PRAGMA foreign_keys=ON").execute(pool).await?;
    // Wait up to 5s for locks instead of failing immediately
    sqlx::query("PRAGMA busy_timeout=5000")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )
    .execute(pool)
    .await?;

    // Users table (single local user, kept for FK integrity)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL DEFAULT 'admin',
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )
    .execute(pool)
    .await?;

    // Seed the local user
    sqlx::query(
        "INSERT INTO users (id, email, role) VALUES ('local-user', 'user@imgimg.local', 'admin')
         ON CONFLICT (id) DO NOTHING",
    )
    .execute(pool)
    .await?;

    // Generations table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS generations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            model_id TEXT NOT NULL,
            prompt TEXT NOT NULL,
            seed INTEGER NOT NULL,
            workflow_used TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            job_id TEXT,
            error TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            batch_size INTEGER,
            width INTEGER,
            height INTEGER,
            image_input_url TEXT,
            workflow_params TEXT
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC)",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_generations_workflow_used ON generations(workflow_used)",
    )
    .execute(pool)
    .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_generations_model_id ON generations(model_id)")
        .execute(pool)
        .await?;

    // FTS5 virtual table for full-text search on prompts
    sqlx::query(
        "CREATE VIRTUAL TABLE IF NOT EXISTS generations_fts USING fts5(
            prompt,
            content='generations',
            content_rowid='rowid'
        )",
    )
    .execute(pool)
    .await?;

    // Triggers to keep FTS5 in sync with generations table
    sqlx::query(
        "CREATE TRIGGER IF NOT EXISTS generations_fts_insert AFTER INSERT ON generations BEGIN
            INSERT INTO generations_fts(rowid, prompt) VALUES (new.rowid, new.prompt);
        END",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TRIGGER IF NOT EXISTS generations_fts_delete AFTER DELETE ON generations BEGIN
            INSERT INTO generations_fts(generations_fts, rowid, prompt) VALUES('delete', old.rowid, old.prompt);
        END",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TRIGGER IF NOT EXISTS generations_fts_update AFTER UPDATE OF prompt ON generations BEGIN
            INSERT INTO generations_fts(generations_fts, rowid, prompt) VALUES('delete', old.rowid, old.prompt);
            INSERT INTO generations_fts(rowid, prompt) VALUES (new.rowid, new.prompt);
        END",
    )
    .execute(pool)
    .await?;

    // Assets table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            url TEXT NOT NULL,
            item_index INTEGER,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            is_active INTEGER NOT NULL DEFAULT 1,
            prompt TEXT
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_assets_generation_id ON assets(generation_id)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_assets_version_lookup ON assets(generation_id, type, item_index)",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "UPDATE assets SET is_active = 0
         WHERE is_active = 1 AND EXISTS (
           SELECT 1 FROM assets newer
           WHERE newer.generation_id = assets.generation_id
             AND newer.type = assets.type
             AND (newer.item_index = assets.item_index OR (newer.item_index IS NULL AND assets.item_index IS NULL))
             AND newer.rowid > assets.rowid
         )",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_one_active_indexed_slot
         ON assets(generation_id, type, item_index)
         WHERE is_active = 1 AND item_index IS NOT NULL",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_one_active_null_slot
         ON assets(generation_id, type)
         WHERE is_active = 1 AND item_index IS NULL",
    )
    .execute(pool)
    .await?;

    // App settings table (key-value JSON store)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )
    .execute(pool)
    .await?;

    // User pinned workflows
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS user_pinned_workflows (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            workflow_id TEXT NOT NULL,
            pinned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            PRIMARY KEY (user_id, workflow_id)
        )",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_user_pinned_wf_user ON user_pinned_workflows(user_id)",
    )
    .execute(pool)
    .await?;

    // Workflow folders for sidebar organization
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS workflow_folders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_workflow_folders_user ON workflow_folders(user_id)",
    )
    .execute(pool)
    .await?;

    // Workflow sidebar ordering
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS workflow_sidebar_order (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            workflow_id TEXT NOT NULL,
            folder_id TEXT REFERENCES workflow_folders(id) ON DELETE SET NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, workflow_id)
        )",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_wf_sidebar_order_user ON workflow_sidebar_order(user_id)",
    )
    .execute(pool)
    .await?;

    // Workflow templates table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            engine TEXT NOT NULL DEFAULT 'comfyui',
            output_mode TEXT NOT NULL DEFAULT 'single_image',
            meta TEXT NOT NULL DEFAULT '{}',
            template TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )
    .execute(pool)
    .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_workflows_engine ON workflows(engine)")
        .execute(pool)
        .await?;

    // Asset types registry table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS asset_types (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            description TEXT,
            aspect_ratio TEXT NOT NULL DEFAULT '1:1',
            display_sort_order INTEGER NOT NULL DEFAULT 50,
            grid_row TEXT NOT NULL DEFAULT 'row2',
            grid_size_class TEXT DEFAULT 'w-1/4',
            default_prompt_template TEXT,
            default_width INTEGER NOT NULL DEFAULT 1024,
            default_height INTEGER NOT NULL DEFAULT 1024,
            is_downloadable INTEGER NOT NULL DEFAULT 1,
            is_regenable INTEGER NOT NULL DEFAULT 1,
            is_inpaintable INTEGER NOT NULL DEFAULT 1,
            is_visible INTEGER NOT NULL DEFAULT 1,
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )
    .execute(pool)
    .await?;

    // Seed default asset types
    sqlx::query(
        "INSERT OR IGNORE INTO asset_types (id, display_name, description, aspect_ratio, display_sort_order, grid_row, grid_size_class, default_prompt_template, default_width, default_height, is_downloadable, is_regenable, is_inpaintable, is_visible, is_system) VALUES
            ('square',      'Square',      '1:1 square format',       '1:1',  0,  'row1', 'w-1/4',  NULL, 1024, 1024, 1, 1, 1, 1, 1),
            ('portrait',    'Portrait',    '4:5 portrait format',     '4:5',  1,  'row1', 'w-1/4',  NULL, 832,  1024, 1, 1, 1, 1, 1),
            ('poster',      'Poster',      '2:3 tall poster format',  '2:3',  2,  'row1', 'w-1/4',  NULL, 680,  1024, 1, 1, 1, 1, 1),
            ('landscape',   'Landscape',   '3:2 landscape format',    '3:2',  3,  'row1', 'w-1/3',  NULL, 1536, 1024, 1, 1, 1, 1, 1),
            ('horizontal',  'Horizontal',  '16:9 widescreen format',  '16:9', 4,  'row1', 'w-1/2',  NULL, 1824, 1024, 1, 1, 1, 1, 1),
            ('panoramic',   'Panoramic',   '21:9 ultrawide format',   '21:9', 5,  'row1', 'w-full', NULL, 2400, 1024, 1, 1, 1, 1, 1),
            ('image',       'Image',       'Generic image output',    '1:1',  6,  'row1', 'w-1/4',  NULL, 1024, 1024, 1, 1, 1, 1, 1),
            ('video',       'Video',       NULL,                       '1:1',  10, 'row1', 'w-1/4',  NULL, 1024, 1024, 1, 0, 0, 1, 1),
            ('audio',       'Audio',       NULL,                       '1:1',  11, 'row1', 'w-1/4',  NULL, 1024, 1024, 1, 0, 0, 1, 1),
            ('rembg',       'Rembg',       NULL,                       '1:1',  80, 'row2', 'w-1/4',  NULL, 1024, 1024, 0, 0, 0, 0, 1),
            ('preview',     'Preview',     NULL,                       '1:1',  90, 'row2', 'w-1/4',  NULL, 1024, 1024, 0, 0, 0, 0, 1),
            ('placeholder', 'Placeholder', NULL,                       '1:1',  99, 'row2', 'w-1/4',  NULL, 1024, 1024, 0, 0, 0, 0, 1)",
    )
    .execute(pool)
    .await?;

    // Canvas metadata table (multi-canvas support)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS canvas_meta (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )
    .execute(pool)
    .await?;

    // Canvas states table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS canvas_states (
            game_id TEXT PRIMARY KEY DEFAULT 'default',
            nodes TEXT NOT NULL DEFAULT '[]',
            chat_messages TEXT NOT NULL DEFAULT '[]',
            chat_workflow_id TEXT,
            next_z_index INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_by_user_id TEXT,
            updated_by_email TEXT
        )",
    )
    .execute(pool)
    .await?;

    // Idempotently add new columns to canvas_states. Using a pragma-existence check
    // (rather than .ok() to swallow ALTER errors) means real failures — disk full,
    // lock, schema corruption — surface instead of being silenced.
    add_column_if_missing(
        pool,
        "canvas_states",
        "pinned_model_ids",
        "TEXT NOT NULL DEFAULT '[]'",
    )
    .await?;
    add_column_if_missing(pool, "canvas_states", "active_engine", "TEXT").await?;
    add_column_if_missing(
        pool,
        "canvas_states",
        "pinned_workflow_ids",
        "TEXT NOT NULL DEFAULT '[]'",
    )
    .await?;
    add_column_if_missing(pool, "canvas_states", "selected_provider_model_id", "TEXT").await?;

    // Chat threads table (per-canvas thread history)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS chat_threads (
            id TEXT PRIMARY KEY,
            canvas_id TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT 'New Thread',
            messages TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )
    .execute(pool)
    .await?;

    // Index for fast per-canvas listing
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_chat_threads_canvas ON chat_threads(canvas_id, updated_at DESC)",
    )
    .execute(pool)
    .await?;

    // Enhancer presets table (custom system prompts for prompt enhancer)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS enhancer_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            system_prompt TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )
    .execute(pool)
    .await?;

    // Seed the built-in "Default" enhancer preset
    sqlx::query(
        "INSERT OR IGNORE INTO enhancer_presets (id, name, system_prompt, is_default, sort_order)
         VALUES ('default', 'Default', ?1, 1, 0)",
    )
    .bind(crate::providers::prompt_enhancer::default_system_prompt())
    .execute(pool)
    .await?;

    // Add bundled column to workflows table (marks disk-synced vs user-created).
    // The first time this column is introduced, also clean up stale rows.
    if add_column_if_missing(pool, "workflows", "bundled", "INTEGER NOT NULL DEFAULT 0").await? {
        // Stale entries came from non-workflow JSON files (ComfyUI workflows,
        // client secrets, etc.) that were scanned from the wrong directory.
        // These all have meta='{}' because they lacked a "meta" key.
        let cleaned = sqlx::query("DELETE FROM workflows WHERE meta = '{}' OR meta = 'null'")
            .execute(pool)
            .await?;
        if cleaned.rows_affected() > 0 {
            log::info!(
                "Cleaned up {} stale workflow entries",
                cleaned.rows_affected()
            );
        }
    }
    cleanup_deprecated_bundled_workflows(pool).await?;

    // Saved prompts table (user-created reusable prompts)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS saved_prompts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            text TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS workspace_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )",
    )
    .execute(pool)
    .await?;

    for version in (previous_version + 1)..=LATEST_SCHEMA_VERSION {
        sqlx::query("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)")
            .bind(version)
            .execute(pool)
            .await?;
    }
    log::info!("Database migrations completed at schema version {LATEST_SCHEMA_VERSION}");
    Ok(())
}

async fn current_schema_version(pool: &SqlitePool) -> AppResult<i64> {
    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .fetch_one(pool)
    .await?;
    if exists == 0 {
        return Ok(0);
    }
    Ok(
        sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM schema_migrations")
            .fetch_one(pool)
            .await?,
    )
}

async fn backup_database_if_populated(
    pool: &SqlitePool,
    db_path: &Path,
    previous_version: i64,
) -> AppResult<()> {
    let user_table_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'",
    )
    .fetch_one(pool)
    .await?;
    if user_table_count == 0 {
        return Ok(());
    }

    let parent = db_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = db_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("imgimg");
    let backup_path = parent.join(format!(
        "{stem}.pre-v{LATEST_SCHEMA_VERSION}-from-v{previous_version}-{}.db",
        uuid::Uuid::new_v4()
    ));
    let escaped = backup_path.to_string_lossy().replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{escaped}'"))
        .execute(pool)
        .await?;
    log::info!("Created pre-migration backup at {}", backup_path.display());
    Ok(())
}

async fn cleanup_deprecated_bundled_workflows(pool: &SqlitePool) -> AppResult<u64> {
    let mut removed_ids = Vec::new();
    let mut removed_count = 0;

    for workflow_id in DEPRECATED_BUNDLED_WORKFLOW_IDS {
        let meta_pattern = format!("%\"workflow_id\":\"{workflow_id}\"%");
        let removed = sqlx::query(
            "DELETE FROM workflows
             WHERE id = ?
               AND bundled = 0
               AND meta LIKE ?",
        )
        .bind(workflow_id)
        .bind(&meta_pattern)
        .execute(pool)
        .await?;

        if removed.rows_affected() == 0 {
            continue;
        }

        removed_count += removed.rows_affected();
        removed_ids.push((*workflow_id).to_string());
    }

    let mut reference_cleanup_ids = removed_ids.clone();
    for workflow_id in DEPRECATED_BUNDLED_WORKFLOW_IDS {
        let workflow_exists: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM workflows WHERE id = ?")
                .bind(workflow_id)
                .fetch_one(pool)
                .await?;
        if workflow_exists == 0 && !reference_cleanup_ids.iter().any(|id| id == workflow_id) {
            reference_cleanup_ids.push((*workflow_id).to_string());
        }
    }

    if reference_cleanup_ids.is_empty() {
        return Ok(0);
    }

    for workflow_id in &reference_cleanup_ids {
        sqlx::query("DELETE FROM user_pinned_workflows WHERE workflow_id = ?")
            .bind(workflow_id)
            .execute(pool)
            .await?;
        sqlx::query("DELETE FROM workflow_sidebar_order WHERE workflow_id = ?")
            .bind(workflow_id)
            .execute(pool)
            .await?;
        sqlx::query("UPDATE canvas_states SET chat_workflow_id = NULL WHERE chat_workflow_id = ?")
            .bind(workflow_id)
            .execute(pool)
            .await?;
    }

    cleanup_canvas_pinned_workflow_ids(pool, &reference_cleanup_ids).await?;
    if removed_count > 0 {
        log::info!("Cleaned up {removed_count} deprecated bundled workflow entries");
    }
    Ok(removed_count)
}

async fn cleanup_canvas_pinned_workflow_ids(
    pool: &SqlitePool,
    removed_ids: &[String],
) -> AppResult<u64> {
    let removed_ids: std::collections::HashSet<&str> =
        removed_ids.iter().map(String::as_str).collect();
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT game_id, pinned_workflow_ids FROM canvas_states")
            .fetch_all(pool)
            .await?;
    let mut updated_count = 0;

    for (game_id, pinned_workflow_ids) in rows {
        let value: serde_json::Value = match serde_json::from_str(&pinned_workflow_ids) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let Some(items) = value.as_array() else {
            continue;
        };

        let filtered: Vec<serde_json::Value> = items
            .iter()
            .filter(|item| {
                item.as_str()
                    .map(|id| !removed_ids.contains(id))
                    .unwrap_or(true)
            })
            .cloned()
            .collect();

        if filtered.len() == items.len() {
            continue;
        }

        sqlx::query("UPDATE canvas_states SET pinned_workflow_ids = ? WHERE game_id = ?")
            .bind(serde_json::to_string(&filtered)?)
            .bind(&game_id)
            .execute(pool)
            .await?;
        updated_count += 1;
    }

    Ok(updated_count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn memory_pool() -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect in-memory sqlite")
    }

    #[tokio::test]
    async fn removes_deprecated_bundled_workflows_and_local_references() {
        let pool = memory_pool().await;
        run_migrations(&pool, None).await.expect("migrate");

        sqlx::query(
            "INSERT INTO workflows (id, label, engine, output_mode, meta, template, bundled)
             VALUES (?, 'Deprecated', 'openrouter', 'single_image', ?, '{}', 0)",
        )
        .bind("openrouter-preset-studio")
        .bind(r#"{"workflow_id":"openrouter-preset-studio","engine":"openrouter"}"#)
        .execute(&pool)
        .await
        .expect("insert deprecated workflow");
        sqlx::query(
            "INSERT INTO workflows (id, label, engine, output_mode, meta, template, bundled)
             VALUES (?, 'Custom', 'openrouter', 'single_image', ?, '{}', 0)",
        )
        .bind("openrouter-gemini-image")
        .bind(r#"{"engine":"openrouter","note":"user-created replacement"}"#)
        .execute(&pool)
        .await
        .expect("insert custom same-id workflow");
        sqlx::query(
            "INSERT INTO user_pinned_workflows (user_id, workflow_id)
             VALUES ('local-user', 'openrouter-preset-studio')",
        )
        .execute(&pool)
        .await
        .expect("insert pinned workflow");
        sqlx::query(
            "INSERT INTO workflow_sidebar_order (user_id, workflow_id, sort_order)
             VALUES ('local-user', 'openrouter-preset-studio', 1)",
        )
        .execute(&pool)
        .await
        .expect("insert sidebar order");
        sqlx::query(
            "INSERT INTO workflow_sidebar_order (user_id, workflow_id, sort_order)
             VALUES ('local-user', 'replicate-qwen3-tts', 2)",
        )
        .execute(&pool)
        .await
        .expect("insert dangling sidebar order");
        sqlx::query(
            "INSERT INTO canvas_states (
                game_id, nodes, chat_messages, chat_workflow_id, next_z_index, pinned_workflow_ids
             )
             VALUES (
                'default', '[]', '[]', 'openrouter-preset-studio', 1,
                '[\"openrouter-preset-studio\",\"openrouter-gemini-image\",\"replicate-qwen3-tts\",\"custom-workflow\"]'
             )",
        )
        .execute(&pool)
        .await
        .expect("insert canvas state");

        let removed = cleanup_deprecated_bundled_workflows(&pool)
            .await
            .expect("cleanup deprecated workflows");

        assert_eq!(removed, 1);
        let deprecated_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM workflows WHERE id = ? AND meta LIKE ?")
                .bind("openrouter-preset-studio")
                .bind("%\"workflow_id\":\"openrouter-preset-studio\"%")
                .fetch_one(&pool)
                .await
                .expect("count deprecated workflow");
        assert_eq!(deprecated_count, 0);
        let custom_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workflows WHERE id = ?")
            .bind("openrouter-gemini-image")
            .fetch_one(&pool)
            .await
            .expect("count custom workflow");
        assert_eq!(custom_count, 1);
        let pinned_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM user_pinned_workflows WHERE workflow_id = ?")
                .bind("openrouter-preset-studio")
                .fetch_one(&pool)
                .await
                .expect("count pinned workflow");
        assert_eq!(pinned_count, 0);
        let order_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM workflow_sidebar_order
                 WHERE workflow_id IN ('openrouter-preset-studio', 'replicate-qwen3-tts')",
        )
        .fetch_one(&pool)
        .await
        .expect("count sidebar workflow");
        assert_eq!(order_count, 0);
        let canvas: (Option<String>, String) =
            sqlx::query_as("SELECT chat_workflow_id, pinned_workflow_ids FROM canvas_states")
                .fetch_one(&pool)
                .await
                .expect("fetch canvas state");
        assert_eq!(canvas.0, None);
        assert_eq!(canvas.1, r#"["openrouter-gemini-image","custom-workflow"]"#);
    }
}
