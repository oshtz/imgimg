use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::{Mutex, Notify};
use tokio::task::AbortHandle;

use crate::services::event_hub::EventHub;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueEvent {
    pub job_id: String,
    pub state: String,
    pub position: Option<usize>,
    pub error: Option<String>,
}

type BoxFuture = Pin<Box<dyn Future<Output = Result<(), String>> + Send>>;

struct QueueJob {
    job_id: String,
    run: BoxFuture,
}

/// The single bounded executor for every generation operation.
pub struct GenerationQueue {
    inner: Arc<Mutex<QueueState>>,
    event_hub: EventHub,
    notify: Arc<Notify>,
}

struct QueueState {
    pending: VecDeque<QueueJob>,
    running: HashMap<String, AbortHandle>,
    concurrency: usize,
}

impl GenerationQueue {
    pub fn new(concurrency: usize, event_hub: EventHub) -> Self {
        Self {
            inner: Arc::new(Mutex::new(QueueState {
                pending: VecDeque::new(),
                running: HashMap::new(),
                concurrency: concurrency.max(1),
            })),
            event_hub,
            notify: Arc::new(Notify::new()),
        }
    }

    /// Must be called once from a Tokio runtime context.
    pub fn start(&self) {
        let inner = self.inner.clone();
        let event_hub = self.event_hub.clone();
        let notify = self.notify.clone();

        tokio::spawn(async move {
            loop {
                notify.notified().await;
                loop {
                    let job = {
                        let mut state = inner.lock().await;
                        if state.running.len() >= state.concurrency || state.pending.is_empty() {
                            break;
                        }
                        state
                            .pending
                            .pop_front()
                            .expect("pending queue was checked")
                    };

                    let job_id = job.job_id.clone();
                    let task = tokio::spawn(job.run);
                    let abort_handle = task.abort_handle();
                    inner
                        .lock()
                        .await
                        .running
                        .insert(job_id.clone(), abort_handle);

                    event_hub.emit_queue_event(&QueueEvent {
                        job_id: job_id.clone(),
                        state: "running".into(),
                        position: Some(0),
                        error: None,
                    });

                    let task_inner = inner.clone();
                    let task_hub = event_hub.clone();
                    let task_notify = notify.clone();
                    tokio::spawn(async move {
                        let event = match task.await {
                            Ok(Ok(())) => QueueEvent {
                                job_id: job_id.clone(),
                                state: "succeeded".into(),
                                position: None,
                                error: None,
                            },
                            Ok(Err(message)) => QueueEvent {
                                job_id: job_id.clone(),
                                state: "failed".into(),
                                position: None,
                                error: Some(message),
                            },
                            Err(error) if error.is_cancelled() => QueueEvent {
                                job_id: job_id.clone(),
                                state: "cancelled".into(),
                                position: None,
                                error: None,
                            },
                            Err(error) => QueueEvent {
                                job_id: job_id.clone(),
                                state: "failed".into(),
                                position: None,
                                error: Some(error.to_string()),
                            },
                        };
                        task_hub.emit_queue_event(&event);
                        task_inner.lock().await.running.remove(&job_id);
                        task_notify.notify_one();
                    });
                }
            }
        });
    }

    /// Enqueue work and return its one-based pending position.
    pub async fn enqueue<F>(&self, job_id: String, run: F) -> usize
    where
        F: Future<Output = Result<(), String>> + Send + 'static,
    {
        let mut state = self.inner.lock().await;
        state.pending.push_back(QueueJob {
            job_id: job_id.clone(),
            run: Box::pin(run),
        });
        let position = state.pending.len();
        drop(state);

        self.event_hub.emit_queue_event(&QueueEvent {
            job_id,
            state: "queued".into(),
            position: Some(position),
            error: None,
        });
        self.notify.notify_one();
        position
    }

    /// Cancel pending or running work. Dropping the provider future also cancels its HTTP request.
    pub async fn cancel(&self, job_id: &str) -> bool {
        let mut state = self.inner.lock().await;
        if let Some(handle) = state.running.get(job_id) {
            if handle.is_finished() {
                return false;
            }
            handle.abort();
            return true;
        }

        let before = state.pending.len();
        state.pending.retain(|job| job.job_id != job_id);
        let removed = state.pending.len() != before;
        drop(state);

        if removed {
            self.event_hub.emit_queue_event(&QueueEvent {
                job_id: job_id.into(),
                state: "cancelled".into(),
                position: None,
                error: None,
            });
        }
        removed
    }
}
