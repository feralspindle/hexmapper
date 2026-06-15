use axum::extract::State;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::calendar::projection;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub session_id: Uuid,
    pub settings: Value,
}

pub async fn update_settings(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<UpdateSettingsRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = projection::update_settings(&mut tx, req.session_id, &req.settings, &metadata).await?;
    tx.commit().await?;

    Ok(Json(row))
}

#[derive(Debug, Deserialize)]
pub struct UpsertDayRequest {
    pub session_id: Uuid,
    pub year: i32,
    pub month: i32,
    pub day: i32,
    pub patch: Value,
}

pub async fn upsert_day(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<UpsertDayRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = projection::upsert_day(
        &mut tx,
        req.session_id,
        req.year,
        req.month,
        req.day,
        &req.patch,
        &metadata,
    )
    .await?;
    tx.commit().await?;

    Ok(Json(row))
}
