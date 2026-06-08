use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Wraps Tauri's AppHandle to emit events to the frontend.
/// Replaces the SSE-based SseHub from the Express backend.
#[derive(Clone)]
pub struct EventHub {
    app_handle: AppHandle,
}

impl EventHub {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    /// Emit a generation event to the frontend.
    /// Frontend listens via `listen("generation-event", callback)`.
    pub fn emit_generation_event<T: Serialize + Clone>(&self, payload: &T) {
        if let Err(e) = self.app_handle.emit("generation-event", payload) {
            log::warn!("Failed to emit generation event: {}", e);
        }
    }

    /// Emit a queue event to the frontend.
    pub fn emit_queue_event<T: Serialize + Clone>(&self, payload: &T) {
        if let Err(e) = self.app_handle.emit("queue-event", payload) {
            log::warn!("Failed to emit queue event: {}", e);
        }
    }

    /// Emit a provider health event.
    pub fn emit_provider_health<T: Serialize + Clone>(&self, payload: &T) {
        if let Err(e) = self.app_handle.emit("provider-health", payload) {
            log::warn!("Failed to emit provider health event: {}", e);
        }
    }

    /// Emit any named event.
    pub fn emit<T: Serialize + Clone>(&self, event: &str, payload: &T) {
        if let Err(e) = self.app_handle.emit(event, payload) {
            log::warn!("Failed to emit event '{}': {}", event, e);
        }
    }
}
