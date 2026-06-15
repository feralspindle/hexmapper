use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::vault::{container_projection, item_projection, ledger_projection, loot_projection};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateContainerRequest {
    pub session_id: Uuid,
    pub name: String,
    #[serde(default)]
    pub gear_slots: i32,
    pub source_client: Option<String>,
}

pub async fn create_container(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateContainerRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = container_projection::create(
        &mut tx,
        Uuid::new_v4(),
        req.session_id,
        req.name.trim(),
        req.gear_slots,
        req.source_client.as_deref(),
        &metadata,
    )
    .await?;
    tx.commit().await?;

    Ok(Json(row))
}

pub async fn delete_container(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::row_session_id(state.pool(), "party_vault_containers", id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    container_projection::delete(&mut tx, id, &metadata).await?;
    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

// ---- loot ----------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CreateLootRequest {
    pub session_id: Uuid,
    pub name: String,
    #[serde(default = "one")]
    pub quantity: i32,
    #[serde(default)]
    pub notes: String,
    #[serde(default = "item_type_default")]
    pub loot_type: String,
    pub currency: Option<String>,
    pub source_client: Option<String>,
}

fn one() -> i32 { 1 }
fn item_type_default() -> String { "item".to_string() }

pub async fn create_loot(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateLootRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    let added_by_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = loot_projection::create(
        &mut tx, Uuid::new_v4(), req.session_id, req.name.trim(), req.quantity, &req.notes,
        &req.loot_type, req.currency.as_deref(), &added_by_name, req.source_client.as_deref(), &metadata,
    ).await?;
    tx.commit().await?;
    Ok(Json(row))
}

pub async fn delete_loot(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::row_session_id(state.pool(), "party_vault_loot", id).await?.ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    loot_projection::delete(&mut tx, id, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

// ---- items ---------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CreateItemRequest {
    pub session_id: Uuid,
    pub container_id: Option<Uuid>,
    pub name: String,
    #[serde(default = "one")]
    pub quantity: i32,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub slots: i32,
    #[serde(default = "sundry")]
    pub item_type: String,
    pub currency: Option<String>,
    pub source_client: Option<String>,
}

fn sundry() -> String { "sundry".to_string() }

pub async fn create_item(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateItemRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    let added_by_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = item_projection::create(
        &mut tx, Uuid::new_v4(), req.session_id, req.container_id, req.name.trim(), req.quantity, &req.notes,
        req.slots, &req.item_type, req.currency.as_deref(), &added_by_name, req.source_client.as_deref(), &metadata,
    ).await?;
    tx.commit().await?;
    Ok(Json(row))
}

pub async fn update_item(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::row_session_id(state.pool(), "party_vault_items", id).await?.ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    item_projection::update(&mut tx, id, &patch, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_item(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::row_session_id(state.pool(), "party_vault_items", id).await?.ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    item_projection::delete(&mut tx, id, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

// ---- bank ledger ---------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CreateLedgerRequest {
    pub session_id: Uuid,
    pub description: String,
    pub character_name: Option<String>,
    #[serde(default)]
    pub gold_change: i32,
    #[serde(default)]
    pub silver_change: i32,
    #[serde(default)]
    pub copper_change: i32,
}

pub async fn create_ledger_entry(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateLedgerRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    let display_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;
    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let row = ledger_projection::create(
        &mut tx, Uuid::new_v4(), req.session_id, &req.description, req.character_name.as_deref(),
        &display_name, req.gold_change, req.silver_change, req.copper_change, &metadata,
    ).await?;
    tx.commit().await?;
    Ok(Json(row))
}
