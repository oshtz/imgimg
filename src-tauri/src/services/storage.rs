use std::path::{Path, PathBuf};

use sqlx::SqlitePool;

use crate::db::models::Asset;
use crate::error::{AppError, AppResult};
use crate::utils::ids::new_id;
use crate::utils::time::now_iso;

/// Local filesystem storage service.
/// Stores assets under `<storage_dir>/<generation_id>_<filename>` (flat layout).
/// URLs use the `asset://` protocol for Tauri's asset serving.
pub struct LocalStorage {
    base_dir: PathBuf,
}

impl LocalStorage {
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    pub async fn ensure_ready(&self) -> AppResult<()> {
        tokio::fs::create_dir_all(&self.base_dir).await?;
        Ok(())
    }

    /// Write binary data as an asset file.
    pub async fn write_binary_asset(
        &self,
        generation_id: &str,
        asset_type: &str,
        item_index: Option<i64>,
        filename: &str,
        bytes: &[u8],
    ) -> AppResult<Asset> {
        let key = self.build_key(generation_id, filename);
        let file_path = self.resolve_path(&key)?;

        if let Some(parent) = file_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&file_path, bytes).await?;

        Ok(self.build_asset(generation_id, asset_type, item_index, &key))
    }

    /// Write a file by copying from a source path.
    pub async fn write_file_asset(
        &self,
        generation_id: &str,
        asset_type: &str,
        item_index: Option<i64>,
        filename: &str,
        source_path: &Path,
    ) -> AppResult<Asset> {
        let key = self.build_key(generation_id, filename);
        let file_path = self.resolve_path(&key)?;

        if let Some(parent) = file_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::copy(source_path, &file_path).await?;

        Ok(self.build_asset(generation_id, asset_type, item_index, &key))
    }

    /// Save raw bytes to storage, returning the storage URL.
    pub async fn save_buffer(
        &self,
        generation_id: &str,
        filename: &str,
        buffer: &[u8],
    ) -> AppResult<String> {
        let key = self.build_key(generation_id, filename);
        let file_path = self.resolve_path(&key)?;

        if let Some(parent) = file_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&file_path, buffer).await?;

        Ok(self.key_to_url(&key))
    }

    /// Delete all assets for a generation.
    pub async fn delete_generation_assets(&self, generation_id: &str) -> AppResult<()> {
        let prefix = format!("{}_", generation_id);
        let mut entries = tokio::fs::read_dir(&self.base_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with(&prefix) {
                    let _ = tokio::fs::remove_file(entry.path()).await;
                }
            }
        }
        Ok(())
    }

    /// Read a file from storage by its URL.
    pub async fn get_buffer(&self, url: &str) -> AppResult<Vec<u8>> {
        let key = self
            .url_to_key(url)
            .ok_or_else(|| AppError::NotFound("Not a storage URL".into()))?;
        let file_path = self.resolve_path(&key)?;
        let bytes = tokio::fs::read(&file_path).await?;
        Ok(bytes)
    }

    /// Resolve a storage URL to a local file path.
    pub fn resolve_url_to_path(&self, url: &str) -> Option<PathBuf> {
        let key = self.url_to_key(url)?;
        self.resolve_path(&key).ok()
    }

    /// Check if a URL points to our local storage.
    pub fn is_storage_url(&self, url: &str) -> bool {
        self.url_to_key(url).is_some()
    }

    // ── Internal ──

    fn build_key(&self, generation_id: &str, filename: &str) -> String {
        format!("{}_{}", generation_id, filename)
    }

    fn resolve_path(&self, key: &str) -> AppResult<PathBuf> {
        let resolved = self.base_dir.join(key);
        // Path traversal check
        let base = self.base_dir.canonicalize().unwrap_or_else(|_| self.base_dir.clone());
        // For new files that don't exist yet, check the parent
        let check_path = if resolved.exists() {
            resolved.canonicalize().unwrap_or_else(|_| resolved.clone())
        } else {
            resolved.clone()
        };
        if !check_path.starts_with(&base) && !resolved.starts_with(&self.base_dir) {
            return Err(AppError::BadRequest(
                "Storage path resolves outside base dir".into(),
            ));
        }
        Ok(resolved)
    }

    fn key_to_url(&self, key: &str) -> String {
        // Use a relative path that the frontend can convert with convertFileSrc()
        // or serve via Tauri's asset protocol
        format!("/storage/{}", key)
    }

    fn url_to_key(&self, url: &str) -> Option<String> {
        let prefix = "/storage/";
        if url.starts_with(prefix) {
            Some(url[prefix.len()..].to_string())
        } else {
            None
        }
    }

    fn build_asset(
        &self,
        generation_id: &str,
        asset_type: &str,
        item_index: Option<i64>,
        key: &str,
    ) -> Asset {
        Asset {
            id: new_id("asset"),
            generation_id: generation_id.to_string(),
            asset_type: asset_type.to_string(),
            url: self.key_to_url(key),
            item_index,
            created_at: now_iso(),
            is_active: true,
            prompt: None,
        }
    }
}

/// Migrate storage from subdirectory layout (`<gen_id>/<file>`) to flat layout
/// (`<gen_id>_<file>`). Moves files and updates asset URLs in the database.
/// Safe to call multiple times — skips if no subdirectories remain.
pub async fn migrate_to_flat_storage(pool: &SqlitePool, storage_dir: &Path) -> AppResult<()> {
    let mut entries = tokio::fs::read_dir(storage_dir).await?;
    let mut migrated_count: u32 = 0;

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = match entry.file_name().to_str() {
            Some(n) => n.to_string(),
            None => continue,
        };

        if !storage_subdir_has_generation(pool, &dir_name).await? {
            continue;
        }

        // Iterate files inside the generation subdirectory
        let mut sub_entries = tokio::fs::read_dir(&path).await?;
        while let Some(sub_entry) = sub_entries.next_entry().await? {
            let sub_path = sub_entry.path();
            if !sub_path.is_file() {
                continue;
            }
            let file_name = match sub_entry.file_name().to_str() {
                Some(n) => n.to_string(),
                None => continue,
            };

            let new_name = format!("{}_{}", dir_name, file_name);
            let new_path = storage_dir.join(&new_name);
            tokio::fs::rename(&sub_path, &new_path).await?;
        }

        // Update asset URLs in the database: /storage/<gen_id>/X -> /storage/<gen_id>_X
        let old_prefix = format!("/storage/{}/", dir_name);
        let new_prefix = format!("/storage/{}_", dir_name);
        sqlx::query(
            "UPDATE assets SET url = REPLACE(url, ?1, ?2) WHERE url LIKE ?3",
        )
        .bind(&old_prefix)
        .bind(&new_prefix)
        .bind(format!("{}%", old_prefix))
        .execute(pool)
        .await?;

        // Remove the now-empty subdirectory
        let _ = tokio::fs::remove_dir(&path).await;
        migrated_count += 1;
    }

    if migrated_count > 0 {
        log::info!(
            "Migrated {} generation directories to flat storage layout",
            migrated_count
        );
    }

    // Fix any remaining old-format URLs where the subdirectory was already removed
    // but the database still has `/storage/gen_xxx/filename` instead of `/storage/gen_xxx_filename`.
    // Pattern: URLs matching /storage/%/% (two path segments after /storage/).
    let result = sqlx::query(
        "UPDATE assets SET url = '/storage/' || SUBSTR(url, LENGTH('/storage/') + 1, INSTR(SUBSTR(url, LENGTH('/storage/') + 1), '/') - 1) || '_' || SUBSTR(url, LENGTH('/storage/') + 1 + INSTR(SUBSTR(url, LENGTH('/storage/') + 1), '/')) WHERE url LIKE '/storage/%/%'",
    )
    .execute(pool)
    .await?;

    if result.rows_affected() > 0 {
        log::info!(
            "Fixed {} asset URLs from subdirectory format to flat format",
            result.rows_affected()
        );
    }

    // Fix old-format URLs embedded in canvas_states JSON columns.
    // These contain URLs like `/storage/gen_xxx/filename` that need to become `/storage/gen_xxx_filename`.
    fix_canvas_state_urls(pool).await?;

    Ok(())
}

async fn storage_subdir_has_generation(pool: &SqlitePool, dir_name: &str) -> AppResult<bool> {
    let exists: i64 = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM generations WHERE id = ?)")
        .bind(dir_name)
        .fetch_one(pool)
        .await?;
    Ok(exists != 0)
}

/// Rewrite old-format `/storage/<id>/<file>` URLs to `/storage/<id>_<file>` in canvas_states JSON.
async fn fix_canvas_state_urls(pool: &SqlitePool) -> AppResult<()> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT game_id, nodes FROM canvas_states WHERE nodes LIKE '%/storage/%/%'",
    )
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(());
    }

    let re = regex::Regex::new(r#"/storage/(gen_[a-f0-9\-]+)/([^"]+)"#)
        .expect("valid regex");

    let mut fixed_count = 0u32;
    for (game_id, nodes_json) in &rows {
        let fixed = re.replace_all(nodes_json, "/storage/${1}_${2}").to_string();
        if &fixed != nodes_json {
            sqlx::query("UPDATE canvas_states SET nodes = ?1 WHERE game_id = ?2")
                .bind(&fixed)
                .bind(game_id)
                .execute(pool)
                .await?;
            fixed_count += 1;
        }
    }

    if fixed_count > 0 {
        log::info!(
            "Fixed URLs in {} canvas states from subdirectory to flat format",
            fixed_count
        );
    }

    Ok(())
}
