use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::dungeon::{corridor_projection, fog_projection, projection, room_projection, token_projection};
use crate::error::AppError;
use crate::retry_tx;
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
    let row = retry_tx!(state.pool(), |tx| {
        projection::create(&mut tx, Uuid::new_v4(), req.session_id, req.hex_id, name, &metadata).await
    })?;
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
    retry_tx!(state.pool(), |tx| {
        projection::update(&mut tx, id, &patch, &metadata).await
    })?;
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
    retry_tx!(state.pool(), |tx| {
        match req.action.as_str() {
            "start" => projection::torch_start(&mut tx, id, &metadata).await?,
            "pause" => projection::torch_pause(&mut tx, id, &metadata).await?,
            "reset" => projection::torch_reset(&mut tx, id, &metadata).await?,
            other => return Err(AppError::BadRequest(format!("unknown torch action: {other}"))),
        }
        Ok(())
    })?;
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

async fn member_for_row(state: &AppState, user_id: Uuid, table: authz::SessionTable, id: Uuid) -> Result<Uuid, AppError> {
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
    // reject_overlapping makes the insert canonical for generated rooms (#55):
    // an advisory lock on the dungeon serializes concurrent generators, and a
    // collision returns 409 so the losing client replans against fresh state.
    // hand-drawn rooms never set the flag - freehand overlap stays legal.
    let guarded = body
        .get("reject_overlapping")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let row = retry_tx!(state.pool(), |tx| {
        if guarded {
            sqlx::query("select pg_advisory_xact_lock(hashtextextended('dungeon_gen:' || $1, 0))")
                .bind(dungeon_id.to_string())
                .execute(&mut *tx)
                .await?;
            let colliding: Option<i32> = sqlx::query_scalar(
                r#"
                select 1 from dungeon_rooms
                where dungeon_id = $1
                  and shape = 'rect'
                  and origin_x < round(($2->>'origin_x')::numeric)::int + round(($2->>'width')::numeric)::int
                  and origin_x + width > round(($2->>'origin_x')::numeric)::int
                  and origin_y < round(($2->>'origin_y')::numeric)::int + round(($2->>'height')::numeric)::int
                  and origin_y + height > round(($2->>'origin_y')::numeric)::int
                limit 1
                "#,
            )
            .bind(dungeon_id)
            .bind(&body)
            .fetch_optional(&mut *tx)
            .await?;
            if colliding.is_some() {
                return Err(AppError::Conflict);
            }
        }
        room_projection::create(&mut tx, dungeon_id, session_id, &body, &metadata).await
    })?;
    Ok(Json(row))
}

pub async fn update_room(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<StatusCode, AppError> {
    member_for_row(&state, auth.user_id, authz::SessionTable::DungeonRooms, id).await?;
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        room_projection::update(&mut tx, id, &patch, &metadata).await
    })?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_room(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    member_for_row(&state, auth.user_id, authz::SessionTable::DungeonRooms, id).await?;
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        room_projection::delete(&mut tx, id, &metadata).await
    })?;
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
    let row = retry_tx!(state.pool(), |tx| {
        corridor_projection::create(&mut tx, dungeon_id, session_id, &body, &metadata).await
    })?;
    Ok(Json(row))
}

pub async fn update_corridor(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<StatusCode, AppError> {
    member_for_row(&state, auth.user_id, authz::SessionTable::DungeonCorridors, id).await?;
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        corridor_projection::update(&mut tx, id, &patch, &metadata).await
    })?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_corridor(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    member_for_row(&state, auth.user_id, authz::SessionTable::DungeonCorridors, id).await?;
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        corridor_projection::delete(&mut tx, id, &metadata).await
    })?;
    Ok(StatusCode::NO_CONTENT)
}

// --- tokens ------------------------------------------------------------------

fn body_cell(body: &Value, key: &str) -> Result<f64, AppError> {
    body.get(key)
        .and_then(Value::as_f64)
        .ok_or_else(|| AppError::BadRequest(format!("{key} required")))
}

// Players can only put tokens on revealed ground. The GM sees through fog, so
// they can stage tokens anywhere; fog-less (collaborative) dungeons and
// reveal-all skip the check entirely.
async fn ensure_cell_placeable(
    state: &AppState,
    user_id: Uuid,
    session_id: Uuid,
    dungeon_id: Uuid,
    x: f64,
    y: f64,
) -> Result<(), AppError> {
    if authz::is_session_gm(state.pool(), user_id, session_id).await? {
        return Ok(());
    }
    let flags: Option<(bool, bool)> = sqlx::query_as(
        "select fog_mode, fog_reveal_all from dungeons where id = $1",
    )
    .bind(dungeon_id)
    .fetch_optional(state.pool())
    .await?;
    let (fog_mode, reveal_all) = flags.ok_or(AppError::NotFound)?;
    if !fog_mode || reveal_all {
        return Ok(());
    }
    let revealed: bool = sqlx::query_scalar(
        "select exists (select 1 from dungeon_fog_cells where dungeon_id = $1 and cell_x = $2 and cell_y = $3)",
    )
    .bind(dungeon_id)
    .bind(x.round() as i32)
    .bind(y.round() as i32)
    .fetch_one(state.pool())
    .await?;
    if !revealed {
        return Err(AppError::BadRequest("cell is hidden by fog".into()));
    }
    Ok(())
}

pub async fn create_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let dungeon_id = body_uuid(&body, "dungeon_id")?;
    let character_id = body_uuid(&body, "character_id")?;
    let session_id = member_for_dungeon(&state, auth.user_id, dungeon_id).await?;
    let (owner_id, character_session) = authz::character_owner_session(state.pool(), character_id)
        .await?
        .ok_or(AppError::NotFound)?;
    // the composite fk enforces this too, but reject cleanly instead of 500ing
    if character_session != Some(session_id) {
        return Err(AppError::Forbidden);
    }
    if owner_id != auth.user_id && !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    let x = body_cell(&body, "x")?;
    let y = body_cell(&body, "y")?;
    ensure_cell_placeable(&state, auth.user_id, session_id, dungeon_id, x, y).await?;
    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        token_projection::create(&mut tx, dungeon_id, session_id, &body, &metadata).await
    })?;
    Ok(Json(row))
}

pub async fn update_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<StatusCode, AppError> {
    let (owner_id, session_id, dungeon_id) = authz::dungeon_token_owner_session(state.pool(), id)
        .await?
        .ok_or(AppError::NotFound)?;
    if owner_id != auth.user_id && !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    if patch.get("x").is_some() || patch.get("y").is_some() {
        let x = body_cell(&patch, "x")?;
        let y = body_cell(&patch, "y")?;
        ensure_cell_placeable(&state, auth.user_id, session_id, dungeon_id, x, y).await?;
    }
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        token_projection::update(&mut tx, id, &patch, &metadata).await
    })?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let (owner_id, session_id, _) = authz::dungeon_token_owner_session(state.pool(), id)
        .await?
        .ok_or(AppError::NotFound)?;
    if owner_id != auth.user_id && !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        token_projection::delete(&mut tx, id, &metadata).await
    })?;
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
    retry_tx!(state.pool(), |tx| {
        fog_projection::reveal_one(&mut tx, session_id, &body, &metadata).await
    })?;
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
    retry_tx!(state.pool(), |tx| {
        fog_projection::hide_one(&mut tx, session_id, &body, &metadata).await
    })?;
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
    retry_tx!(state.pool(), |tx| {
        fog_projection::reveal_bulk(&mut tx, session_id, &body, &metadata).await
    })?;
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
    retry_tx!(state.pool(), |tx| {
        fog_projection::hide_bulk(&mut tx, session_id, &body, &metadata).await
    })?;
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
    retry_tx!(state.pool(), |tx| {
        fog_projection::clear_all(&mut tx, dungeon_id, session_id, &metadata).await
    })?;
    Ok(StatusCode::NO_CONTENT)
}
