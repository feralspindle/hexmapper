use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::photo::projection;
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreatePhotoRequest {
    pub session_id: Uuid,
    pub name: String,
    pub storage_path: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PhotoRow {
    pub id: Uuid,
    pub session_id: String,
    pub user_id: Option<Uuid>,
    pub name: String,
    pub storage_path: String,
    pub created_at: Option<DateTime<Utc>>,
}

pub async fn create_photo(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreatePhotoRequest>,
) -> Result<Json<PhotoRow>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    let row_id = Uuid::new_v4();

    let event = NewEvent {
        aggregate_type: "reference_photo",
        aggregate_id: row_id,
        session_id: Some(req.session_id),
        event_type: "reference_photo.created",
        payload: json!({
            "name": req.name,
            "storage_path": req.storage_path,
        }),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_and_project_photo(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn delete_photo(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(photo_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let photo: Option<(Option<Uuid>, String)> = sqlx::query_as(
        "select user_id, session_id from reference_photos where id = $1",
    )
    .bind(photo_id)
    .fetch_optional(state.pool())
    .await?;

    let Some((owner_id, session_id_text)) = photo else {
        return Err(AppError::NotFound);
    };

    let session_id = Uuid::parse_str(&session_id_text)
        .map_err(|_| AppError::BadRequest("invalid session id on photo".to_string()))?;

    let is_owner = owner_id == Some(auth.user_id);
    if !is_owner && !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let event = NewEvent {
        aggregate_type: "reference_photo",
        aggregate_id: photo_id,
        session_id: Some(session_id),
        event_type: "reference_photo.deleted",
        payload: json!({}),
        metadata: auth.metadata(),
    };

    retry_tx!(state.pool(), |tx| {
        projection::append_and_unproject_photo(&mut tx, &event).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct BroadcastPhotoRequest {
    pub session_id: Uuid,
    pub photo_id: Uuid,
    pub photo_url: String,
    pub photo_name: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct BroadcastRow {
    pub id: Uuid,
    pub session_id: String,
    pub user_id: Option<Uuid>,
    pub photo_id: Option<Uuid>,
    pub photo_url: String,
    pub photo_name: String,
    pub created_at: Option<DateTime<Utc>>,
}

pub async fn broadcast_photo(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<BroadcastPhotoRequest>,
) -> Result<Json<BroadcastRow>, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    let row_id = Uuid::new_v4();

    let event = NewEvent {
        aggregate_type: "photo_broadcast",
        aggregate_id: row_id,
        session_id: Some(req.session_id),
        event_type: "photo_broadcast.sent",
        payload: json!({
            "photo_id": req.photo_id,
            "photo_url": req.photo_url,
            "photo_name": req.photo_name,
        }),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_and_project_broadcast(&mut tx, &event).await
    })?;

    Ok(Json(row))
}
