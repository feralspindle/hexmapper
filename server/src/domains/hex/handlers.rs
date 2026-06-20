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

fn uuid_body_field(body: &Value, field: &str) -> Result<Uuid, AppError> {
    body.get(field)
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::BadRequest(format!("{field} required")))
}

async fn ensure_map_in_session(
    state: &AppState,
    map_id: Uuid,
    session_id: Uuid,
) -> Result<(), AppError> {
    let map_session_id = authz::row_session_id(state.pool(), authz::SessionTable::Maps, map_id)
        .await?
        .ok_or(AppError::NotFound)?;

    if map_session_id != session_id {
        return Err(AppError::Forbidden);
    }

    Ok(())
}

/// Body carries the cell fields, including `session_id`, `map_id`, `q`, `r`.
pub async fn upsert_hex(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let session_id = uuid_body_field(&body, "session_id")?;
    let map_id = uuid_body_field(&body, "map_id")?;

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
    ensure_map_in_session(&state, map_id, session_id).await?;

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
    ensure_map_in_session(&state, req.map_id, req.session_id).await?;
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
    ensure_map_in_session(&state, req.map_id, req.session_id).await?;
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
    ensure_map_in_session(&state, req.map_id, req.session_id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    projection::clear_all(&mut tx, req.map_id, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
