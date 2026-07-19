use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::statblock::projection;
use crate::error::AppError;
use crate::retry_tx;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct SessionQuery {
    pub session_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct CreateStatBlockRequest {
    pub session_id: Uuid,
    pub kind: String,
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDataRequest {
    pub data: Value,
}

pub async fn list_stat_blocks(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<SessionQuery>,
) -> Result<Json<Vec<Value>>, AppError> {
    require_member(&state, auth.user_id, query.session_id).await?;
    let rows: Vec<Value> = sqlx::query_scalar(
        "select to_jsonb(s) from stat_blocks s where session_id = $1 order by created_at asc",
    )
    .bind(query.session_id)
    .fetch_all(state.pool())
    .await?;

    Ok(Json(rows))
}

pub async fn create_stat_block(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateStatBlockRequest>,
) -> Result<Json<Value>, AppError> {
    require_member(&state, auth.user_id, req.session_id).await?;
    if !matches!(req.kind.as_str(), "npc" | "monster") {
        return Err(AppError::BadRequest("invalid stat block kind".to_string()));
    }
    if !req.data.is_object() {
        return Err(AppError::BadRequest("data must be an object".to_string()));
    }

    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::create(
            &mut tx,
            Uuid::new_v4(),
            req.session_id,
            auth.user_id,
            &req.kind,
            &req.data,
            &metadata,
        )
        .await
    })?;

    Ok(Json(row))
}

// Member-wide writes on purpose: unlike player sheets (#187), the npc/monster
// cast is shared session furniture, and in co-op anyone at the table tracks
// monster hp.
pub async fn update_stat_block_data(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateDataRequest>,
) -> Result<Json<Value>, AppError> {
    let session_id = stat_block_session(&state, id).await?.ok_or(AppError::NotFound)?;
    require_member(&state, auth.user_id, session_id).await?;
    if !req.data.is_object() {
        return Err(AppError::BadRequest("data must be an object".to_string()));
    }

    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::update_data(&mut tx, id, &req.data, &metadata).await
    })?;

    Ok(Json(row))
}

pub async fn delete_stat_block(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let session_id = stat_block_session(&state, id).await?.ok_or(AppError::NotFound)?;
    require_member(&state, auth.user_id, session_id).await?;

    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        projection::delete(&mut tx, id, &metadata).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

async fn stat_block_session(state: &AppState, id: Uuid) -> Result<Option<Uuid>, AppError> {
    sqlx::query_scalar("select session_id from stat_blocks where id = $1")
        .bind(id)
        .fetch_optional(state.pool())
        .await
        .map_err(Into::into)
}

async fn require_member(state: &AppState, user_id: Uuid, session_id: Uuid) -> Result<(), AppError> {
    if authz::is_session_member(state.pool(), user_id, session_id).await? {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}
