use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use crate::config::AppConfig;
use crate::error::{AppError, AppResult};
use crate::providers::comfy_pool::ComfyPool;
use crate::services::event_hub::EventHub;
use crate::services::queue::{ConcurrentQueue, FifoQueue};
use crate::services::storage::LocalStorage;

/// Shared application state accessible from all Tauri commands.
pub struct AppState {
    pub db: SqlitePool,
    pub config: AppConfig,
    pub data_dir: PathBuf,
    pub storage_dir: PathBuf,
    pub http_client: reqwest::Client,
    pub event_hub: EventHub,
    pub comfy_queue: Arc<FifoQueue>,
    pub concurrent_queue: Arc<ConcurrentQueue>,
    pub storage: Arc<LocalStorage>,
    pub comfy_pool: Arc<ComfyPool>,
    pub canvas_chat_cancellations: Arc<tokio::sync::Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl AppState {
    pub fn new(
        db: SqlitePool,
        config: AppConfig,
        data_dir: PathBuf,
        storage_dir: PathBuf,
        event_hub: EventHub,
    ) -> AppResult<Self> {
        let http_client = reqwest::Client::builder()
            .user_agent("imgimg/0.1.0")
            .build()
            .map_err(|e| AppError::Internal(format!("failed to create HTTP client: {e}")))?;

        let concurrency = config.effective_comfy_urls().len().max(1);
        let comfy_queue = Arc::new(FifoQueue::new(concurrency, event_hub.clone()));
        let concurrent_queue = Arc::new(ConcurrentQueue::new(event_hub.clone()));
        let storage = Arc::new(LocalStorage::new(storage_dir.clone()));
        let comfy_pool = Arc::new(ComfyPool::new(
            &config,
            http_client.clone(),
            storage.clone(),
            event_hub.clone(),
        ));

        Ok(Self {
            db,
            config,
            data_dir,
            storage_dir,
            http_client,
            event_hub,
            comfy_queue,
            concurrent_queue,
            storage,
            comfy_pool,
            canvas_chat_cancellations: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        })
    }
}
