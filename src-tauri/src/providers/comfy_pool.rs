//! ComfyUI connection pool with round-robin/least-busy strategy.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::config::AppConfig;
use crate::error::{AppError, AppResult};
use crate::providers::comfy_proxy::ComfyProxy;
use crate::services::event_hub::EventHub;
use crate::services::storage::LocalStorage;

#[derive(Debug, Clone, PartialEq)]
pub enum PoolStrategy {
    RoundRobin,
    LeastBusy,
}

impl PoolStrategy {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "round_robin" | "roundrobin" => Self::RoundRobin,
            _ => Self::LeastBusy,
        }
    }
}

pub struct ComfyPool {
    proxies: Vec<ComfyProxy>,
    loads: Arc<Mutex<Vec<usize>>>,
    strategy: PoolStrategy,
    round_robin_index: AtomicUsize,
    primary_index: usize,
}

/// Guard that decrements load on drop.
pub struct AcquiredProxy<'a> {
    pub proxy: &'a ComfyProxy,
    pub index: usize,
    loads: Arc<Mutex<Vec<usize>>>,
    released: bool,
}

impl<'a> AcquiredProxy<'a> {
    pub async fn release(&mut self) {
        if !self.released {
            self.released = true;
            let mut loads = self.loads.lock().await;
            if self.index < loads.len() {
                loads[self.index] = loads[self.index].saturating_sub(1);
            }
        }
    }
}

impl<'a> Drop for AcquiredProxy<'a> {
    fn drop(&mut self) {
        if !self.released {
            self.released = true;
            let loads = self.loads.clone();
            let index = self.index;
            tokio::spawn(async move {
                let mut loads = loads.lock().await;
                if index < loads.len() {
                    loads[index] = loads[index].saturating_sub(1);
                }
            });
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceHealth {
    pub index: usize,
    /// Serialized as "url" to match frontend ComfyInstanceStatus type.
    #[serde(rename = "url")]
    pub base_url: String,
    pub healthy: bool,
}

impl ComfyPool {
    pub fn new(
        config: &AppConfig,
        http_client: reqwest::Client,
        storage: Arc<LocalStorage>,
        event_hub: EventHub,
    ) -> Self {
        let urls = config.effective_comfy_urls();
        let strategy = PoolStrategy::from_str(&config.comfy_pool_strategy);
        let primary_index = config.comfy_primary_index.min(urls.len().saturating_sub(1));

        let proxies: Vec<ComfyProxy> = urls
            .iter()
            .map(|url| {
                let mut proxy = ComfyProxy::new(
                    url.clone(),
                    http_client.clone(),
                    storage.clone(),
                    config.clone(),
                );
                proxy.set_event_hub(event_hub.clone());
                proxy
            })
            .collect();

        let loads = Arc::new(Mutex::new(vec![0usize; proxies.len()]));

        Self {
            proxies,
            loads,
            strategy,
            round_robin_index: AtomicUsize::new(0),
            primary_index,
        }
    }

    pub fn size(&self) -> usize {
        self.proxies.len()
    }

    pub async fn get_loads(&self) -> Vec<usize> {
        self.loads.lock().await.clone()
    }

    pub async fn acquire(&self) -> AppResult<AcquiredProxy<'_>> {
        if self.proxies.is_empty() {
            return Err(AppError::Config("No ComfyUI instances configured".into()));
        }
        let index = self.select_index().await;
        self.acquire_at(index).await
    }

    pub async fn acquire_specific(&self, index: usize) -> AppResult<AcquiredProxy<'_>> {
        if index >= self.proxies.len() {
            return Err(AppError::BadRequest(format!(
                "ComfyUI instance index {index} out of range (pool size: {})",
                self.proxies.len()
            )));
        }
        self.acquire_at(index).await
    }

    pub async fn acquire_from_indices(&self, indices: &[usize]) -> AppResult<AcquiredProxy<'_>> {
        if indices.is_empty() {
            return self.acquire().await;
        }
        let index = self.select_index_from(indices).await;
        self.acquire_at(index).await
    }

    pub fn get_primary_proxy(&self) -> &ComfyProxy {
        &self.proxies[self.primary_index]
    }

    pub async fn check_health(&self, timeout_ms: Option<u64>) -> Vec<InstanceHealth> {
        let timeout = timeout_ms.unwrap_or(5000);
        let futures: Vec<_> = self
            .proxies
            .iter()
            .enumerate()
            .map(|(i, proxy)| async move {
                let healthy = proxy.is_healthy(timeout).await;
                InstanceHealth {
                    index: i,
                    base_url: proxy.base_url().to_string(),
                    healthy,
                }
            })
            .collect();

        futures::future::join_all(futures).await
    }

    pub async fn get_healthy_indices(&self, timeout_ms: Option<u64>) -> Vec<usize> {
        self.check_health(timeout_ms)
            .await
            .into_iter()
            .filter(|h| h.healthy)
            .map(|h| h.index)
            .collect()
    }

    // ── Internal ──

    async fn acquire_at(&self, index: usize) -> AppResult<AcquiredProxy<'_>> {
        {
            let mut loads = self.loads.lock().await;
            loads[index] += 1;
        }
        Ok(AcquiredProxy {
            proxy: &self.proxies[index],
            index,
            loads: self.loads.clone(),
            released: false,
        })
    }

    async fn select_index(&self) -> usize {
        let indices: Vec<usize> = (0..self.proxies.len()).collect();
        self.select_index_from(&indices).await
    }

    async fn select_index_from(&self, indices: &[usize]) -> usize {
        match self.strategy {
            PoolStrategy::RoundRobin => {
                let prev = self.round_robin_index.fetch_add(1, Ordering::Relaxed);
                indices[prev % indices.len()]
            }
            PoolStrategy::LeastBusy => {
                let loads = self.loads.lock().await;
                let mut min_load = usize::MAX;
                let mut min_index = indices[0];
                for &idx in indices {
                    let load = loads.get(idx).copied().unwrap_or(usize::MAX);
                    if load < min_load {
                        min_load = load;
                        min_index = idx;
                    }
                }
                min_index
            }
        }
    }
}
