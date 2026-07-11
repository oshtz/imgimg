#![allow(clippy::too_many_arguments, clippy::type_complexity)]

pub mod commands;
pub mod config;
pub mod db;
pub mod error;
pub mod providers;
pub mod services;
pub mod state;
pub mod stores;
pub mod utils;

use sqlx::sqlite::SqlitePoolOptions;
use std::path::{Path, PathBuf};
use tauri::Manager;

use crate::config::{db_path, load_config, save_config, storage_dir};
use crate::db::migrations::run_migrations;
use crate::services::event_hub::EventHub;
use crate::services::storage::migrate_to_flat_storage;
use crate::state::AppState;
use crate::stores::{admin_settings, generation_store, workflow_store};

// Import all commands
use crate::commands::{
    admin::*, app_info::*, asset_types::*, canvas::*, compare::*, enhancer_presets::*, gallery::*,
    generations::*, health::*, models::*, presets::*, prompts::*, saved_prompts::*, storage::*,
    workflow_org::*, workflows::*, workspace_state::*,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Resolve data directory
            let data_dir = app_handle
                .path()
                .app_data_dir()
                .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
            std::fs::create_dir_all(&data_dir)?;

            // Load config
            let mut config = load_config(&data_dir)?;

            // Ensure storage directory exists
            let storage = storage_dir(&data_dir);
            std::fs::create_dir_all(&storage)?;

            // Initialize SQLite database
            let db_file = db_path(&data_dir);
            let db_url = format!("sqlite:{}?mode=rwc", db_file.display());

            let pool = tauri::async_runtime::block_on(async {
                let pool = SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect(&db_url)
                    .await?;

                // Always run migrations — they use CREATE TABLE IF NOT EXISTS
                // and also set PRAGMAs (WAL mode, foreign keys) that need to
                // be active for every connection.
                run_migrations(&pool, Some(&db_file)).await?;

                let interrupted = generation_store::reconcile_interrupted_jobs(&pool).await?;
                if interrupted > 0 {
                    log::warn!("Marked {interrupted} unfinished generation jobs as interrupted");
                }

                let config_changed =
                    admin_settings::migrate_legacy_secrets(&pool, &mut config).await?;
                if config_changed {
                    save_config(&data_dir, &config)?;
                }

                let project_root = std::env::current_dir().ok();

                // Migrate storage from subdirectory layout to flat layout
                if let Err(e) = migrate_to_flat_storage(&pool, &storage).await {
                    log::warn!("Flat storage migration failed (non-fatal): {e}");
                }

                // Sync workflow JSON files from disk into the database. Dev mode
                // prefers the live repo folder so stale copied target/debug
                // resources cannot re-seed removed bundled workflows.
                let project_wf_dir =
                    project_workflows_dir(project_root.as_deref(), &config.workflows_dir);
                let resource_wf_dir = app_handle
                    .path()
                    .resource_dir()
                    .ok()
                    .map(|d| d.join("workflows"))
                    .filter(|d| d.is_dir());
                let wf_dir = workflow_sync_dir(project_wf_dir, resource_wf_dir);
                if let Some(dir) = wf_dir {
                    log::info!("Syncing workflows from {}", dir.display());
                    if let Err(e) = workflow_store::sync_from_disk(&pool, &dir).await {
                        log::warn!("Workflow sync from disk failed (non-fatal): {e}");
                    }
                } else {
                    log::warn!("No workflow directory found; skipping disk sync");
                }

                Ok::<_, crate::error::AppError>(pool)
            })?;

            let event_hub = EventHub::new(app_handle.clone());
            let state = AppState::new(pool, config, data_dir, storage, event_hub)
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;

            // Start the queue pump in the async runtime
            let queue = state.generation_queue.clone();
            tauri::async_runtime::spawn(async move {
                queue.start();
            });

            app.manage(state);

            // Set window icon for taskbar on Windows
            if let Some(window) = app.get_webview_window("main") {
                match app_handle
                    .path()
                    .resolve("icons/icon.ico", tauri::path::BaseDirectory::Resource)
                    .ok()
                    .and_then(|p| tauri::image::Image::from_path(&p).ok())
                {
                    Some(icon) => {
                        if let Err(e) = window.set_icon(icon) {
                            log::warn!("Failed to set window icon: {e}");
                        }
                    }
                    None => log::warn!("Could not load app icon (non-fatal)"),
                }
            }

            log::info!("imgimg Tauri app initialized successfully");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Health
            health_check,
            get_provider_status,
            // Workflows
            list_workflows,
            get_workflow,
            get_workflow_template,
            upsert_workflow,
            delete_workflow,
            // Workflow organization
            get_pinned_workflows,
            pin_workflow,
            unpin_workflow,
            get_workflow_organization,
            reorder_workflow_items,
            create_workflow_folder,
            rename_workflow_folder,
            delete_workflow_folder,
            reorder_workflow_folders,
            // Generations
            create_generation,
            get_generation,
            list_generations,
            delete_generation,
            cancel_generation,
            retry_generation,
            get_asset_versions,
            set_active_asset_version,
            update_generation_status,
            regenerate_item,
            create_inpaint,
            export_generation_assets_zip,
            remove_background,
            // Gallery
            list_gallery,
            list_gallery_users,
            // Canvas
            list_canvases,
            create_canvas,
            rename_canvas,
            delete_canvas,
            get_canvas_state,
            save_canvas_state,
            canvas_chat,
            cancel_canvas_chat,
            list_chat_threads,
            get_chat_thread,
            save_chat_thread,
            delete_chat_thread,
            // Admin
            get_admin_settings,
            update_admin_settings,
            verify_provider_credential,
            get_feature_workflow_config,
            get_default_system_prompts,
            // Models / LoRA
            list_available_loras,
            get_lora_settings,
            update_lora_settings,
            search_provider_models,
            get_provider_model_detail,
            get_replicate_model_parameters,
            get_fal_model_parameters,
            // Presets
            get_presets,
            get_all_presets,
            set_presets,
            upsert_preset,
            delete_preset,
            // Asset types
            list_asset_types,
            get_asset_type,
            create_asset_type,
            update_asset_type,
            delete_asset_type,
            get_asset_type_count,
            // Enhancer presets
            list_enhancer_presets,
            get_enhancer_preset,
            upsert_enhancer_preset,
            delete_enhancer_preset,
            set_active_enhancer_preset,
            // Prompts
            enhance_prompt,
            explore_variants,
            // Saved Prompts
            list_saved_prompts,
            upsert_saved_prompt,
            delete_saved_prompt,
            // Storage
            get_storage_base_path,
            open_storage_folder,
            open_external_url,
            get_workspace_state,
            save_workspace_state,
            get_app_info,
            // Compare
            get_compare_models,
            get_compare_groups,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn project_workflows_dir(project_root: Option<&Path>, workflows_dir: &str) -> Option<PathBuf> {
    project_root.and_then(|root| {
        let configured = root.join(workflows_dir);
        if configured.is_dir() {
            Some(configured)
        } else {
            let fallback = root.join("workflows");
            fallback.is_dir().then_some(fallback)
        }
    })
}

fn workflow_sync_dir(
    project_wf_dir: Option<PathBuf>,
    resource_wf_dir: Option<PathBuf>,
) -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        project_wf_dir.or(resource_wf_dir)
    } else {
        resource_wf_dir.or(project_wf_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("imgimg_{name}_{unique}"))
    }

    #[test]
    fn project_workflows_dir_falls_back_to_repo_workflows() {
        let root = temp_dir("workflow_fallback");
        let workflows = root.join("workflows");
        std::fs::create_dir_all(&workflows).unwrap();

        let resolved = project_workflows_dir(Some(&root), "../missing").unwrap();

        assert_eq!(resolved, workflows);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn workflow_sync_dir_prefers_project_dir_in_debug_builds() {
        let project = PathBuf::from("project-workflows");
        let resource = PathBuf::from("resource-workflows");

        let resolved = workflow_sync_dir(Some(project.clone()), Some(resource.clone())).unwrap();

        if cfg!(debug_assertions) {
            assert_eq!(resolved, project);
        } else {
            assert_eq!(resolved, resource);
        }
    }
}
