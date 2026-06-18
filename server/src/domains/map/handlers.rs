use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::map::projection;
use crate::error::AppError;
use crate::state::AppState;

/// Body is the full set of map fields to set; must include `session_id`.
pub async fn create_map(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let session_id = body
        .get("session_id")
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::BadRequest("session_id required".to_string()))?;

    if !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = projection::create(&mut tx, Uuid::new_v4(), session_id, &body, &metadata).await?;
    tx.commit().await?;

    Ok(Json(row))
}

pub async fn update_map(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::row_session_id(state.pool(), authz::SessionTable::Maps, id).await?.ok_or(AppError::NotFound)?;
    if !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    projection::update(&mut tx, id, &patch, &metadata).await?;
    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_map(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::row_session_id(state.pool(), authz::SessionTable::Maps, id).await?.ok_or(AppError::NotFound)?;
    if !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    projection::delete(&mut tx, id, &metadata).await?;
    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}
