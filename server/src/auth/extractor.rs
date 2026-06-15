use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::jwt;
use crate::error::AppError;
use crate::state::AppState;

/// Max stored length of the client-supplied `X-Intent` value (it lands in the
/// durable event log, so cap it defensively).
const INTENT_MAX_LEN: usize = 64;

pub struct AuthUser {
    pub user_id: Uuid,
    /// Semantic frontend action (`X-Intent` header), e.g. `paint_terrain` vs
    /// `reveal_hex` — the highest-signal field for forensic debugging. None when
    /// the caller didn't supply it (older clients / non-instrumented calls).
    pub intent: Option<String>,
}

impl AuthUser {
    /// The base event-metadata envelope: `user_id` plus `intent` when present.
    pub fn metadata(&self) -> Value {
        let mut m = serde_json::Map::new();
        m.insert("user_id".into(), json!(self.user_id));
        if let Some(intent) = &self.intent {
            m.insert("intent".into(), json!(intent));
        }
        Value::Object(m)
    }

    /// `metadata()` merged with extra fields (e.g. server-resolved display_name).
    pub fn metadata_with(&self, extra: Value) -> Value {
        let mut base = self.metadata();
        if let (Value::Object(b), Value::Object(e)) = (&mut base, extra) {
            for (k, v) in e {
                b.insert(k, v);
            }
        }
        base
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized)?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or(AppError::Unauthorized)?;

        let claims = jwt::verify(token, state.jwks()).map_err(|e| {
            tracing::warn!("jwt verification failed: {e}");
            AppError::Unauthorized
        })?;

        let intent = parts
            .headers
            .get("x-intent")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.chars().take(INTENT_MAX_LEN).collect());

        Ok(AuthUser {
            user_id: claims.sub,
            intent,
        })
    }
}
