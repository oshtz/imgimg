use serde::Serialize;
use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::{Mutex, Notify};

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

/// FIFO queue with bounded concurrency for GPU-bound engines (ComfyUI).
pub struct FifoQueue {
    inner: Arc<Mutex<FifoQueueInner>>,
    event_hub: EventHub,
    notify: Arc<Notify>,
}

struct FifoQueueInner {
    pending: VecDeque<QueueJob>,
    running: Vec<String>,
    concurrency: usize,
}

impl FifoQueue {
    pub fn new(concurrency: usize, event_hub: EventHub) -> Self {
        let inner = Arc::new(Mutex::new(FifoQueueInner {
            pending: VecDeque::new(),
            running: Vec::new(),
            concurrency: concurrency.max(1),
        }));
        let notify = Arc::new(Notify::new());

        Self {
            inner,
            event_hub,
            notify,
        }
    }

    /// Must be called from within a Tokio runtime context.
    pub fn start(&self) {
        self.spawn_pump();
    }

    pub async fn enqueue<F>(&self, job_id: String, run: F)
    where
        F: Future<Output = Result<(), String>> + Send + 'static,
    {
        let mut inner = self.inner.lock().await;
        inner.pending.push_back(QueueJob {
            job_id: job_id.clone(),
            run: Box::pin(run),
        });

        let position = inner.pending.len();
        drop(inner);

        self.event_hub.emit_queue_event(&QueueEvent {
            job_id,
            state: "queued".into(),
            position: Some(position),
            error: None,
        });

        self.notify.notify_one();
    }

    pub async fn cancel(&self, job_id: &str) -> bool {
        let mut inner = self.inner.lock().await;
        if inner.running.contains(&job_id.to_string()) {
            return false;
        }
        let len_before = inner.pending.len();
        inner.pending.retain(|j| j.job_id != job_id);
        let removed = inner.pending.len() < len_before;
        if removed {
            drop(inner);
            self.event_hub.emit_queue_event(&QueueEvent {
                job_id: job_id.into(),
                state: "failed".into(),
                position: None,
                error: Some("Canceled".into()),
            });
        }
        removed
    }

    fn spawn_pump(&self) {
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
                        let job = state.pending.pop_front().unwrap();
                        state.running.push(job.job_id.clone());
                        job
                    };

                    let job_id = job.job_id.clone();
                    let inner_clone = inner.clone();
                    let event_hub_clone = event_hub.clone();
                    let notify_clone = notify.clone();

                    event_hub.emit_queue_event(&QueueEvent {
                        job_id: job_id.clone(),
                        state: "running".into(),
                        position: Some(0),
                        error: None,
                    });

                    tokio::spawn(async move {
                        let result = job.run.await;

                        let event = match result {
                            Ok(()) => QueueEvent {
                                job_id: job_id.clone(),
                                state: "succeeded".into(),
                                position: None,
                                error: None,
                            },
                            Err(msg) => QueueEvent {
                                job_id: job_id.clone(),
                                state: "failed".into(),
                                position: None,
                                error: Some(msg),
                            },
                        };

                        event_hub_clone.emit_queue_event(&event);

                        {
                            let mut state = inner_clone.lock().await;
                            state.running.retain(|id| id != &job_id);
                        }

                        notify_clone.notify_one();
                    });
                }
            }
        });
    }
}

/// Concurrent queue for fire-and-forget engines (Replicate, OpenRouter).
/// Runs jobs immediately without waiting.
pub struct ConcurrentQueue {
    event_hub: EventHub,
}

impl ConcurrentQueue {
    pub fn new(event_hub: EventHub) -> Self {
        Self { event_hub }
    }

    pub fn enqueue<F>(&self, job_id: String, run: F)
    where
        F: Future<Output = Result<(), String>> + Send + 'static,
    {
        let event_hub = self.event_hub.clone();

        event_hub.emit_queue_event(&QueueEvent {
            job_id: job_id.clone(),
            state: "running".into(),
            position: Some(0),
            error: None,
        });

        tokio::spawn(async move {
            let result = run.await;
            let event = match result {
                Ok(()) => QueueEvent {
                    job_id,
                    state: "succeeded".into(),
                    position: None,
                    error: None,
                },
                Err(msg) => QueueEvent {
                    job_id,
                    state: "failed".into(),
                    position: None,
                    error: Some(msg),
                },
            };
            event_hub.emit_queue_event(&event);
        });
    }
}
