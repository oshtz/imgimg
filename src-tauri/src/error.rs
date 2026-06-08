use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Provider error: {0}")]
    ProviderError(String),
}

// Tauri commands need serde::Serialize on errors
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        struct ErrorPayload {
            error: String,
            kind: &'static str,
        }

        let kind = match self {
            AppError::Database(_) => "database",
            AppError::Io(_) => "io",
            AppError::Json(_) => "json",
            AppError::Http(_) => "http",
            AppError::NotFound(_) => "not_found",
            AppError::BadRequest(_) => "bad_request",
            AppError::Internal(_) => "internal",
            AppError::Config(_) => "config",
            AppError::Timeout(_) => "timeout",
            AppError::ProviderError(_) => "provider_error",
        };

        ErrorPayload {
            error: self.to_string(),
            kind,
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
