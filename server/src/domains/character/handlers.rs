use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::character::projection;
use crate::error::AppError;
use crate::retry_tx;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateCharacterRequest {
    pub session_id: Option<Uuid>,
    pub data: Value,
}

pub async fn create_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateCharacterRequest>,
) -> Result<Json<Value>, AppError> {
    if let Some(session_id) = req.session_id {
        if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
            return Err(AppError::Forbidden);
        }
    }

    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::create(&mut tx, Uuid::new_v4(), req.session_id, auth.user_id, &req.data, &metadata).await
    })?;

    Ok(Json(row))
}

#[derive(Debug, Deserialize)]
pub struct UpdateDataRequest {
    pub data: Value,
}

pub async fn update_character_data(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateDataRequest>,
) -> Result<Json<Value>, AppError> {
    let (owner_id, session_id) = authz::character_owner_session(state.pool(), id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Owner or GM only. Member-wide access here would let any player replace
    // another player's entire sheet (#187); the one party operation members
    // legitimately trigger on other sheets (coin splits) goes through the
    // narrower adjust-currency endpoint below.
    let allowed = owner_id == auth.user_id
        || match session_id {
            Some(sid) => authz::is_session_gm(state.pool(), auth.user_id, sid).await?,
            None => false,
        };
    if !allowed {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::update_data(&mut tx, id, &req.data, &metadata).await
    })?;

    Ok(Json(row))
}

#[derive(Debug, Deserialize)]
pub struct AdjustCurrencyRequest {
    pub currency: String,
    pub delta: i64,
}

const MAX_CURRENCY_DELTA: i64 = 1_000_000;

/// Session members may adjust a single currency field on any party member's
/// character (loot splits). Unlike the full-blob PATCH this cannot touch hp,
/// gear, or anything else, and the delta is bounded.
pub async fn adjust_character_currency(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<AdjustCurrencyRequest>,
) -> Result<Json<Value>, AppError> {
    if !matches!(req.currency.as_str(), "gold" | "silver" | "copper") {
        return Err(AppError::BadRequest("unknown currency".into()));
    }
    if req.delta == 0 || req.delta.abs() > MAX_CURRENCY_DELTA {
        return Err(AppError::BadRequest("delta out of range".into()));
    }

    let (owner_id, session_id) = authz::character_owner_session(state.pool(), id)
        .await?
        .ok_or(AppError::NotFound)?;
    let allowed = owner_id == auth.user_id
        || match session_id {
            Some(sid) => authz::is_session_member(state.pool(), auth.user_id, sid).await?,
            None => false,
        };
    if !allowed {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::adjust_currency(&mut tx, id, &req.currency, req.delta, &metadata).await
    })?;

    Ok(Json(row))
}

pub async fn delete_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let (owner_id, _session_id) = authz::character_owner_session(state.pool(), id)
        .await?
        .ok_or(AppError::NotFound)?;
    if owner_id != auth.user_id {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        projection::delete(&mut tx, id, &metadata).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct ClearInitiativeRequest {
    pub session_id: Uuid,
}

pub async fn clear_initiative(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<ClearInitiativeRequest>,
) -> Result<StatusCode, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        projection::clear_initiative(&mut tx, req.session_id, &metadata).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct SheetLogRequest {
    pub session_id: Uuid,
    pub what: String,
}

pub async fn record_sheet_log(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<SheetLogRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    let display_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;
    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::append_sheet_log(
            &mut tx,
            Uuid::new_v4(),
            req.session_id,
            auth.user_id,
            &display_name,
            &req.what,
            &metadata,
        )
        .await
    })?;

    Ok(Json(row))
}
