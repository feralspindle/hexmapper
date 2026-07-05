use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::notes::{dungeon_projection, projection};
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

const MAX_BODY_LEN: usize = 5000;

#[derive(Debug, Deserialize)]
pub struct CreateHexNoteRequest {
    pub hex_cell_id: Uuid,
    pub session_id: Uuid,
    pub body: String,
}

#[derive(Debug, Deserialize)]
pub struct EditNoteRequest {
    pub body: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct HexNoteRow {
    pub id: Uuid,
    pub hex_cell_id: Uuid,
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

fn validate_body(body: &str) -> Result<&str, AppError> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("note body cannot be empty".to_string()));
    }
    if trimmed.chars().count() > MAX_BODY_LEN {
        return Err(AppError::BadRequest(format!("note body cannot exceed {MAX_BODY_LEN} characters")));
    }
    Ok(trimmed)
}

pub async fn create_hex_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateHexNoteRequest>,
) -> Result<Json<HexNoteRow>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    let body = validate_body(&req.body)?;
    let display_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;

    let event = NewEvent {
        aggregate_type: "hex_note",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(req.session_id),
        event_type: "hex_note.created",
        payload: json!({ "hex_cell_id": req.hex_cell_id, "body": body }),
        metadata: auth.metadata_with(json!({ "display_name": display_name })),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_and_project(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn edit_hex_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(note_id): Path<Uuid>,
    Json(req): Json<EditNoteRequest>,
) -> Result<Json<HexNoteRow>, AppError> {
    let (owner_id, session_id, hex_cell_id) = authz::hex_note_owner_session(state.pool(), note_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if owner_id != auth.user_id && !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    let body = validate_body(&req.body)?;

    let event = NewEvent {
        aggregate_type: "hex_note",
        aggregate_id: note_id,
        session_id: Some(session_id),
        event_type: "hex_note.edited",
        payload: json!({ "hex_cell_id": hex_cell_id, "body": body }),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_and_edit(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn delete_hex_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(note_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let (owner_id, session_id, hex_cell_id) = authz::hex_note_owner_session(state.pool(), note_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if owner_id != auth.user_id && !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let event = NewEvent {
        aggregate_type: "hex_note",
        aggregate_id: note_id,
        session_id: Some(session_id),
        event_type: "hex_note.deleted",
        payload: json!({ "hex_cell_id": hex_cell_id }),
        metadata: auth.metadata(),
    };

    retry_tx!(state.pool(), |tx| {
        projection::append_and_unproject(&mut tx, &event).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct CreateDungeonNoteRequest {
    pub element_id: Uuid,
    pub element_type: String,
    pub session_id: Uuid,
    pub body: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DungeonElementNoteRow {
    pub id: Uuid,
    pub element_id: Uuid,
    pub element_type: String,
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn create_dungeon_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateDungeonNoteRequest>,
) -> Result<Json<DungeonElementNoteRow>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    let body = validate_body(&req.body)?;
    let display_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;

    let event = NewEvent {
        aggregate_type: "dungeon_element_note",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(req.session_id),
        event_type: "dungeon_element_note.created",
        payload: json!({ "element_id": req.element_id, "element_type": req.element_type, "body": body }),
        metadata: auth.metadata_with(json!({ "display_name": display_name })),
    };

    let row = retry_tx!(state.pool(), |tx| {
        dungeon_projection::append_and_project(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn edit_dungeon_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(note_id): Path<Uuid>,
    Json(req): Json<EditNoteRequest>,
) -> Result<Json<DungeonElementNoteRow>, AppError> {
    let (owner_id, session_id, element_id) = authz::dungeon_element_note_owner_session(state.pool(), note_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if owner_id != auth.user_id && !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    let body = validate_body(&req.body)?;

    let event = NewEvent {
        aggregate_type: "dungeon_element_note",
        aggregate_id: note_id,
        session_id: Some(session_id),
        event_type: "dungeon_element_note.edited",
        payload: json!({ "element_id": element_id, "body": body }),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        dungeon_projection::append_and_edit(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn delete_dungeon_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(note_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let (owner_id, session_id, element_id) = authz::dungeon_element_note_owner_session(state.pool(), note_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if owner_id != auth.user_id && !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let event = NewEvent {
        aggregate_type: "dungeon_element_note",
        aggregate_id: note_id,
        session_id: Some(session_id),
        event_type: "dungeon_element_note.deleted",
        payload: json!({ "element_id": element_id }),
        metadata: auth.metadata(),
    };

    retry_tx!(state.pool(), |tx| {
        dungeon_projection::append_and_unproject(&mut tx, &event).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}
