use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::notebook::{projection, session_note_projection};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateQuestRequest {
    pub session_id: Uuid,
    #[serde(default)]
    pub display_order: i32,
    pub source_client: Option<String>,
}

pub async fn create_quest(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateQuestRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    let added_by_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;
    let is_gm_added = authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await?;
    let metadata = auth.metadata();

    let mut tx = state.pool().begin().await?;
    let row = projection::create(
        &mut tx,
        Uuid::new_v4(),
        req.session_id,
        &added_by_name,
        is_gm_added,
        req.display_order,
        req.source_client.as_deref(),
        &metadata,
    )
    .await?;
    tx.commit().await?;

    Ok(Json(row))
}

pub async fn update_quest(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::row_session_id(state.pool(), "party_quests", id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    projection::update(&mut tx, id, &patch, &metadata).await?;
    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_quest(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::row_session_id(state.pool(), "party_quests", id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    projection::delete(&mut tx, id, &metadata).await?;
    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionNoteRequest {
    pub session_id: Uuid,
    pub source_client: Option<String>,
}

pub async fn create_session_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateSessionNoteRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    let author_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;
    let is_gm_author = authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await?;
    let metadata = auth.metadata();

    let mut tx = state.pool().begin().await?;
    let row = session_note_projection::create(
        &mut tx,
        Uuid::new_v4(),
        req.session_id,
        &author_name,
        &auth.user_id.to_string(),
        is_gm_author,
        req.source_client.as_deref(),
        &metadata,
    )
    .await?;
    tx.commit().await?;

    Ok(Json(row))
}

pub async fn update_session_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::row_session_id(state.pool(), "party_session_notes", id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    session_note_projection::update(&mut tx, id, &patch, &metadata).await?;
    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_session_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::row_session_id(state.pool(), "party_session_notes", id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    session_note_projection::delete(&mut tx, id, &metadata).await?;
    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}
