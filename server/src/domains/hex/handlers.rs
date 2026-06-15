use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::hex::projection;
use crate::error::AppError;
use crate::state::AppState;

/// Body carries the cell fields, including `session_id`, `map_id`, `q`, `r`.
pub async fn upsert_hex(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let session_id = body
        .get("session_id")
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::BadRequest("session_id required".to_string()))?;

    // Members can paint terrain/markers; only the GM may change a hex's visibility.
    let changes_visibility = body.get("revealed").is_some();
    let authorized = if changes_visibility {
        authz::is_session_gm(state.pool(), auth.user_id, session_id).await?
    } else {
        authz::is_session_member(state.pool(), auth.user_id, session_id).await?
    };
    if !authorized {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = projection::upsert(&mut tx, session_id, &body, &metadata).await?;
    tx.commit().await?;

    Ok(Json(row))
}

#[derive(Debug, Deserialize)]
pub struct DeleteHexRequest {
    pub session_id: Uuid,
    pub map_id: Uuid,
    pub q: i32,
    pub r: i32,
}

pub async fn delete_hex(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<DeleteHexRequest>,
) -> Result<StatusCode, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    projection::delete_one(&mut tx, req.map_id, req.q, req.r, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct BulkRevealRequest {
    pub session_id: Uuid,
    pub map_id: Uuid,
    pub revealed: bool,
}

pub async fn bulk_reveal(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<BulkRevealRequest>,
) -> Result<StatusCode, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    projection::set_revealed(&mut tx, req.map_id, req.revealed, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct ClearHexRequest {
    pub session_id: Uuid,
    pub map_id: Uuid,
}

pub async fn clear_hex(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<ClearHexRequest>,
) -> Result<StatusCode, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    projection::clear_all(&mut tx, req.map_id, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
