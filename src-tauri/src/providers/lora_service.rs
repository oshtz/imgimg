//! LoRA model discovery from ComfyUI.

use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;
use tokio::sync::Mutex;

use crate::error::AppResult;
use crate::providers::comfy_pool::ComfyPool;

const CACHE_TTL_MS: u64 = 30_000;
const FAILURE_CACHE_TTL_MS: u64 = 5_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    pub id: String,
    pub name: String,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_image_url: Option<String>,
}

pub struct LoraService {
    cache: Arc<Mutex<Option<(Vec<String>, Instant, bool)>>>,
}

impl LoraService {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(Mutex::new(None)),
        }
    }

    /// List available LoRA filenames from ComfyUI.
    pub async fn list_available(&self, pool: &ComfyPool) -> AppResult<Vec<String>> {
        // Check cache
        {
            let cache = self.cache.lock().await;
            if let Some((ref loras, ref when, was_success)) = *cache {
                let ttl = if was_success {
                    CACHE_TTL_MS
                } else {
                    FAILURE_CACHE_TTL_MS
                };
                if when.elapsed().as_millis() < ttl as u128 {
                    return Ok(loras.clone());
                }
            }
        }

        let result = pool.get_primary_proxy().list_loras().await;

        let (loras, success) = match result {
            Ok(l) => (l, true),
            Err(e) => {
                log::warn!("Failed to list LoRAs: {e}");
                (vec![], false)
            }
        };

        // Update cache
        {
            let mut cache = self.cache.lock().await;
            *cache = Some((loras.clone(), Instant::now(), success));
        }

        Ok(loras)
    }

    /// Convert LoRA filenames to Model structs with optional settings.
    pub fn as_models(
        lora_names: &[String],
        enabled: Option<&[String]>,
        display_names: Option<&std::collections::HashMap<String, String>>,
        preview_urls: Option<&std::collections::HashMap<String, String>>,
    ) -> Vec<Model> {
        let filtered = if let Some(enabled_list) = enabled {
            lora_names
                .iter()
                .filter(|name| enabled_list.iter().any(|e| e == *name))
                .cloned()
                .collect::<Vec<_>>()
        } else {
            lora_names.to_vec()
        };

        filtered
            .iter()
            .map(|name| {
                let display_name = display_names
                    .and_then(|dn| dn.get(name))
                    .cloned()
                    .unwrap_or_else(|| {
                        // Strip extension for display name
                        name.rsplit_once('.')
                            .map(|(n, _)| n.to_string())
                            .unwrap_or_else(|| name.clone())
                    });

                let preview_url = preview_urls.and_then(|pu| pu.get(name)).cloned();

                Model {
                    id: name.clone(),
                    name: display_name,
                    tags: vec!["lora".to_string()],
                    preview_image_url: preview_url,
                }
            })
            .collect()
    }
}

impl Default for LoraService {
    fn default() -> Self {
        Self::new()
    }
}
