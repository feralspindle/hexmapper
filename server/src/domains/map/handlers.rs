use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::map::projection;
use crate::error::AppError;
use crate::retry_tx;
use crate::state::AppState;

fn optional_uuid(body: &Value, key: &str) -> Result<Option<Uuid>, AppError> {
    match body.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => v
            .as_str()
            .and_then(|s| Uuid::parse_str(s).ok())
            .map(Some)
            .ok_or_else(|| AppError::BadRequest(format!("{key} must be a uuid"))),
    }
}

// parent_map_id/parent_hex_id come from the body; the composite fks reject a
// parent from another session too, but check here so the caller gets a 403
// instead of a 500
async fn ensure_parents_in_session(state: &AppState, body: &Value, session_id: Uuid) -> Result<(), AppError> {
    if let Some(parent_map_id) = optional_uuid(body, "parent_map_id")? {
        let parent_session = authz::row_session_id(state.pool(), authz::SessionTable::Maps, parent_map_id).await?;
        if parent_session != Some(session_id) {
            return Err(AppError::Forbidden);
        }
    }
    if let Some(parent_hex_id) = optional_uuid(body, "parent_hex_id")? {
        let parent_session = authz::row_session_id(state.pool(), authz::SessionTable::HexCells, parent_hex_id).await?;
        if parent_session != Some(session_id) {
            return Err(AppError::Forbidden);
        }
    }
    Ok(())
}

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
    ensure_parents_in_session(&state, &body, session_id).await?;

    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::create(&mut tx, Uuid::new_v4(), session_id, &body, &metadata).await
    })?;

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
    ensure_parents_in_session(&state, &patch, session_id).await?;

    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        projection::update(&mut tx, id, &patch, &metadata).await
    })?;

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
    retry_tx!(state.pool(), |tx| {
        projection::delete(&mut tx, id, &metadata).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}
