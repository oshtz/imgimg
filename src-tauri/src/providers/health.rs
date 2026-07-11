//! Provider health checking with TTL cache.

use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;
use sqlx::SqlitePool;
use tokio::sync::Mutex;

use crate::config::AppConfig;
use crate::providers::comfy_pool::ComfyPool;
use crate::providers::fal_proxy::FalProxy;
use crate::providers::kie_proxy::KieProxy;
use crate::providers::openrouter_proxy::OpenRouterProxy;
use crate::providers::replicate_proxy::ReplicateProxy;
use crate::services::storage::LocalStorage;

const CACHE_TTL_MS: u64 = 10_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub comfyui: ComfyStatus,
    pub openrouter: SimpleStatus,
    pub replicate: SimpleStatus,
    pub fal: SimpleStatus,
    pub kie: SimpleStatus,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComfyStatus {
    pub available: bool,
    pub healthy_count: usize,
    pub total_count: usize,
    pub instances: Vec<crate::providers::comfy_pool::InstanceHealth>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleStatus {
    pub available: bool,
    pub has_api_key: bool,
    pub state: &'static str,
}

fn connection_state(has_api_key: bool, available: bool) -> &'static str {
    if !has_api_key {
        "unconfigured"
    } else if available {
        "verified"
    } else {
        "configured_unverified"
    }
}

pub struct ProviderHealthService {
    cache: Arc<Mutex<Option<(ProviderStatus, Instant)>>>,
}

impl ProviderHealthService {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn get_status(
        &self,
        comfy_pool: &ComfyPool,
        http_client: &reqwest::Client,
        config: &AppConfig,
        storage: &Arc<LocalStorage>,
        db: &SqlitePool,
    ) -> ProviderStatus {
        // Check cache
        {
            let cache = self.cache.lock().await;
            if let Some((ref status, ref when)) = *cache {
                if when.elapsed().as_millis() < CACHE_TTL_MS as u128 {
                    return status.clone();
                }
            }
        }

        let status = self
            .refresh(comfy_pool, http_client, config, storage, db)
            .await;

        // Update cache
        {
            let mut cache = self.cache.lock().await;
            *cache = Some((status.clone(), Instant::now()));
        }

        status
    }

    pub async fn refresh(
        &self,
        comfy_pool: &ComfyPool,
        http_client: &reqwest::Client,
        config: &AppConfig,
        storage: &Arc<LocalStorage>,
        db: &SqlitePool,
    ) -> ProviderStatus {
        // Check all providers in parallel
        let comfy_future = comfy_pool.check_health(Some(5000));

        let openrouter = OpenRouterProxy::new(
            http_client.clone(),
            config.clone(),
            storage.clone(),
            db.clone(),
        );
        let replicate = ReplicateProxy::new(
            http_client.clone(),
            config.clone(),
            storage.clone(),
            db.clone(),
        );
        let fal = FalProxy::new(
            http_client.clone(),
            config.clone(),
            storage.clone(),
            db.clone(),
        );
        let kie = KieProxy::new(
            http_client.clone(),
            config.clone(),
            storage.clone(),
            db.clone(),
        );

        let (comfy_health, or_ok, rep_ok, fal_ok, kie_ok) = tokio::join!(
            comfy_future,
            openrouter.check_health(),
            replicate.check_health(),
            fal.check_health(),
            kie.check_health(),
        );

        let healthy_count = comfy_health.iter().filter(|h| h.healthy).count();
        let total_count = comfy_health.len();

        let or_has_key = openrouter.get_api_key().await.is_ok();
        let rep_has_key = replicate.get_api_token().await.is_ok();
        let fal_has_key = fal.get_api_key().await.is_ok();
        let kie_has_key = kie.get_api_key().await.is_ok();

        ProviderStatus {
            comfyui: ComfyStatus {
                available: healthy_count > 0,
                healthy_count,
                total_count,
                instances: comfy_health,
            },
            openrouter: SimpleStatus {
                available: or_ok,
                has_api_key: or_has_key,
                state: connection_state(or_has_key, or_ok),
            },
            replicate: SimpleStatus {
                available: rep_ok,
                has_api_key: rep_has_key,
                state: connection_state(rep_has_key, rep_ok),
            },
            fal: SimpleStatus {
                available: fal_ok,
                has_api_key: fal_has_key,
                state: connection_state(fal_has_key, fal_ok),
            },
            kie: SimpleStatus {
                available: kie_ok,
                has_api_key: kie_has_key,
                state: connection_state(kie_has_key, kie_ok),
            },
            timestamp: crate::utils::time::now_iso(),
        }
    }
}

impl Default for ProviderHealthService {
    fn default() -> Self {
        Self::new()
    }
}
