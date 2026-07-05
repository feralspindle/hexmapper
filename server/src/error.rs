use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(thiserror::Error, Debug)]
#[allow(dead_code)]
pub enum AppError {
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("not found")]
    NotFound,
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("too many requests")]
    TooManyRequests,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("conflict, retries exhausted")]
    Conflict,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::Forbidden => (StatusCode::FORBIDDEN, self.to_string()),
            AppError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::TooManyRequests => (StatusCode::TOO_MANY_REQUESTS, self.to_string()),
            AppError::Conflict => (StatusCode::CONFLICT, self.to_string()),
            AppError::Database(e) => {
                tracing::error!("database error: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error".to_string())
            }
        };

        (status, Json(json!({ "message": message }))).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;

    async fn response_parts(err: AppError) -> (StatusCode, serde_json::Value) {
        let response = err.into_response();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }

    #[tokio::test]
    async fn variants_map_to_their_http_statuses() {
        let cases = [
            (AppError::Unauthorized, StatusCode::UNAUTHORIZED, "unauthorized"),
            (AppError::Forbidden, StatusCode::FORBIDDEN, "forbidden"),
            (AppError::NotFound, StatusCode::NOT_FOUND, "not found"),
            (AppError::TooManyRequests, StatusCode::TOO_MANY_REQUESTS, "too many requests"),
            (AppError::Conflict, StatusCode::CONFLICT, "conflict, retries exhausted"),
        ];
        for (err, expected_status, expected_message) in cases {
            let (status, body) = response_parts(err).await;
            assert_eq!(status, expected_status);
            assert_eq!(body["message"], expected_message);
        }
    }

    #[tokio::test]
    async fn bad_request_carries_the_caller_facing_reason() {
        let (status, body) = response_parts(AppError::BadRequest("q and r are required".into())).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["message"], "bad request: q and r are required");
    }

    #[tokio::test]
    async fn database_errors_never_leak_internals_to_the_client() {
        let (status, body) = response_parts(AppError::Database(sqlx::Error::RowNotFound)).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["message"], "internal error");
        assert!(!body.to_string().contains("RowNotFound"));
    }
}
