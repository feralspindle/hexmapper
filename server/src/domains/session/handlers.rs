use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::session::member_projection;
use crate::domains::session::projection;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub name: Option<String>,
}

pub async fn create_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateSessionRequest>,
) -> Result<Json<Value>, AppError> {
    let name = req.name.as_deref().unwrap_or("Untitled Campaign");
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = projection::create(&mut tx, Uuid::new_v4(), auth.user_id, name, &metadata).await?;
    tx.commit().await?;
    Ok(Json(row))
}

pub async fn update_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<Json<Value>, AppError> {
    // sessions_update RLS: owner only.
    if !authz::is_session_gm(state.pool(), auth.user_id, id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = projection::update(&mut tx, id, &patch, &metadata).await?;
    tx.commit().await?;
    row.map(Json).ok_or(AppError::NotFound)
}

pub async fn delete_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    projection::delete(&mut tx, id, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct TorchRequest {
    pub action: String,
}

pub async fn torch(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<TorchRequest>,
) -> Result<StatusCode, AppError> {
    // torch RPCs are session-member scoped (owner or member).
    if !authz::is_session_member(state.pool(), auth.user_id, id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    match req.action.as_str() {
        "start" => projection::torch_start(&mut tx, id, &metadata).await?,
        "pause" => projection::torch_pause(&mut tx, id, &metadata).await?,
        "reset" => projection::torch_reset(&mut tx, id, &metadata).await?,
        other => return Err(AppError::BadRequest(format!("unknown torch action: {other}"))),
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

// --- session_members -------------------------------------------------------

/// Join a session by id (replaces the `join_session` RPC). Any authenticated user
/// may add *themselves* (RLS insert check is user_id = auth.uid(), enforced by
/// using auth.user_id). Returns the session row for the client to apply.
pub async fn join_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let mut tx = state.pool().begin().await?;
    let session: Option<Value> = sqlx::query_scalar("select to_jsonb(s) from sessions s where id = $1")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
    let session = session.ok_or(AppError::NotFound)?;
    let metadata = auth.metadata();
    member_projection::join(&mut tx, id, auth.user_id, &metadata).await?;
    tx.commit().await?;
    Ok(Json(session))
}

#[derive(Debug, Deserialize)]
pub struct SetActiveRequest {
    pub session_id: Uuid,
    pub active_character_id: Option<Uuid>,
}

/// Set the caller's active character for a session (replaces the session_members
/// upsert). The member only ever writes their own row, so user_id = auth.user_id.
pub async fn set_active_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<SetActiveRequest>,
) -> Result<StatusCode, AppError> {
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    member_projection::set_active(&mut tx, req.session_id, auth.user_id, req.active_character_id, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
