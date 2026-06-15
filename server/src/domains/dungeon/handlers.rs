use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::dungeon::{corridor_projection, fog_projection, projection, room_projection};
use crate::error::AppError;
use crate::state::AppState;

fn body_uuid(body: &Value, key: &str) -> Result<Uuid, AppError> {
    body.get(key)
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::BadRequest(format!("{key} required")))
}

// --- dungeon ---------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CreateDungeonRequest {
    pub session_id: Uuid,
    pub hex_id: Uuid,
    pub name: Option<String>,
}

pub async fn create_dungeon(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateDungeonRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    let name = req.name.as_deref().unwrap_or("Unnamed Dungeon");
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = projection::create(&mut tx, Uuid::new_v4(), req.session_id, req.hex_id, name, &metadata).await?;
    tx.commit().await?;
    Ok(Json(row))
}

pub async fn update_dungeon(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::dungeon_session_id(state.pool(), id).await?.ok_or(AppError::NotFound)?;
    if !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    projection::update(&mut tx, id, &patch, &metadata).await?;
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
    // The old torch RPCs were SECURITY DEFINER (any member could run them).
    let session_id = authz::dungeon_session_id(state.pool(), id).await?.ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
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

// --- rooms / corridors -----------------------------------------------------

// Rooms/corridors are collaborative: any session member can write them (mirrors
// the live dungeon_rooms_member_write / dungeon_corridors_member_write RLS). Fog
// stays GM-only (gm_for_dungeon below).
async fn member_for_dungeon(state: &AppState, user_id: Uuid, dungeon_id: Uuid) -> Result<Uuid, AppError> {
    let session_id = authz::dungeon_session_id(state.pool(), dungeon_id).await?.ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    Ok(session_id)
}

async fn member_for_row(state: &AppState, user_id: Uuid, table: &str, id: Uuid) -> Result<Uuid, AppError> {
    let session_id = authz::row_session_id(state.pool(), table, id).await?.ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    Ok(session_id)
}

// Fog reveal/hide is GM-only (the fog brush is GM-gated in the UI).
async fn gm_for_dungeon(state: &AppState, user_id: Uuid, dungeon_id: Uuid) -> Result<Uuid, AppError> {
    let session_id = authz::dungeon_session_id(state.pool(), dungeon_id).await?.ok_or(AppError::NotFound)?;
    if !authz::is_session_gm(state.pool(), user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    Ok(session_id)
}

pub async fn create_room(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let dungeon_id = body_uuid(&body, "dungeon_id")?;
    let session_id = member_for_dungeon(&state, auth.user_id, dungeon_id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = room_projection::create(&mut tx, dungeon_id, session_id, &body, &metadata).await?;
    tx.commit().await?;
    Ok(Json(row))
}

pub async fn update_room(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<StatusCode, AppError> {
    member_for_row(&state, auth.user_id, "dungeon_rooms", id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    room_projection::update(&mut tx, id, &patch, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_room(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    member_for_row(&state, auth.user_id, "dungeon_rooms", id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    room_projection::delete(&mut tx, id, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_corridor(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let dungeon_id = body_uuid(&body, "dungeon_id")?;
    let session_id = member_for_dungeon(&state, auth.user_id, dungeon_id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = corridor_projection::create(&mut tx, dungeon_id, session_id, &body, &metadata).await?;
    tx.commit().await?;
    Ok(Json(row))
}

pub async fn update_corridor(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<StatusCode, AppError> {
    member_for_row(&state, auth.user_id, "dungeon_corridors", id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    corridor_projection::update(&mut tx, id, &patch, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_corridor(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    member_for_row(&state, auth.user_id, "dungeon_corridors", id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    corridor_projection::delete(&mut tx, id, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

// --- fog -------------------------------------------------------------------

pub async fn fog_reveal(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<StatusCode, AppError> {
    let dungeon_id = body_uuid(&body, "dungeon_id")?;
    let session_id = gm_for_dungeon(&state, auth.user_id, dungeon_id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    fog_projection::reveal_one(&mut tx, session_id, &body, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn fog_hide(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<StatusCode, AppError> {
    let dungeon_id = body_uuid(&body, "dungeon_id")?;
    let session_id = gm_for_dungeon(&state, auth.user_id, dungeon_id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    fog_projection::hide_one(&mut tx, session_id, &body, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn fog_reveal_bulk(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<StatusCode, AppError> {
    let dungeon_id = body_uuid(&body, "dungeon_id")?;
    let session_id = gm_for_dungeon(&state, auth.user_id, dungeon_id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    fog_projection::reveal_bulk(&mut tx, session_id, &body, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn fog_hide_bulk(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<StatusCode, AppError> {
    let dungeon_id = body_uuid(&body, "dungeon_id")?;
    let session_id = gm_for_dungeon(&state, auth.user_id, dungeon_id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    fog_projection::hide_bulk(&mut tx, session_id, &body, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn fog_clear(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<StatusCode, AppError> {
    let dungeon_id = body_uuid(&body, "dungeon_id")?;
    let session_id = gm_for_dungeon(&state, auth.user_id, dungeon_id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    fog_projection::clear_all(&mut tx, dungeon_id, session_id, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
