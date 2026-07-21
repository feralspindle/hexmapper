//! External import endpoints: a local tool (rules assistant, book extractor)
//! pushes json bundles into a solo session using a per-session import key.
//! Key management runs under normal browser auth; the /import/* endpoints run
//! under `ImportAuth`, which resolves the key to its session and creator, so
//! bundles never carry a session_id. Oracle tables land in the key creator's
//! personal library; everything else lands in the session.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::import_key::{display_prefix, hash_key, mint_key};
use crate::auth::{AuthUser, ImportAuth};
use crate::authz;
use crate::domains::character;
use crate::domains::compendium;
use crate::domains::oracle::packs::{check_len, import_bundle, ImportTable, MAX_NAME_LEN};
use crate::domains::statblock;
use crate::error::AppError;
use crate::retry_tx;
use crate::state::AppState;

const MAX_KEY_NAME_LEN: usize = 80;
const MAX_STAT_BLOCKS: usize = 500;
const MAX_CHARACTERS: usize = 50;
const MAX_COMPENDIUM_ENTRIES: usize = 2000;

// ---- key management (browser auth, session owner only) ----------------------

#[derive(Debug, Deserialize)]
pub struct SessionQuery {
    pub session_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct CreateKeyRequest {
    pub session_id: Uuid,
    pub name: String,
}

/// Mints a key and returns the raw secret exactly once; only the sha-256 is
/// stored. Owner-only, and only for gm_less sessions - imports are a solo
/// feature.
pub async fn create_import_key(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateKeyRequest>,
) -> Result<Json<Value>, AppError> {
    let play_mode: Option<String> =
        sqlx::query_scalar("select play_mode from sessions where id = $1 and owner_id = $2")
            .bind(req.session_id)
            .bind(auth.user_id)
            .fetch_optional(state.pool())
            .await?;
    let play_mode = play_mode.ok_or(AppError::Forbidden)?;
    if play_mode != "gm_less" {
        return Err(AppError::BadRequest(
            "import keys only work on solo/co-op sessions".into(),
        ));
    }
    let name = req.name.trim();
    if name.is_empty() || name.chars().count() > MAX_KEY_NAME_LEN {
        return Err(AppError::BadRequest(format!(
            "name must be 1-{MAX_KEY_NAME_LEN} characters"
        )));
    }

    let key = mint_key();
    let mut row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into import_keys (session_id, created_by, name, key_hash, key_prefix)
            values ($1, $2, $3, $4, $5)
            returning *
        )
        select to_jsonb(ins) - 'key_hash' from ins
        "#,
    )
    .bind(req.session_id)
    .bind(auth.user_id)
    .bind(name)
    .bind(hash_key(&key))
    .bind(display_prefix(&key))
    .fetch_one(state.pool())
    .await?;

    if let Some(obj) = row.as_object_mut() {
        obj.insert("key".into(), json!(key));
    }
    Ok(Json(row))
}

pub async fn list_import_keys(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<SessionQuery>,
) -> Result<Json<Vec<Value>>, AppError> {
    require_owner(&state, auth.user_id, query.session_id).await?;
    let rows: Vec<Value> = sqlx::query_scalar(
        r#"
        select to_jsonb(k) - 'key_hash' from import_keys k
        where session_id = $1
        order by created_at asc
        "#,
    )
    .bind(query.session_id)
    .fetch_all(state.pool())
    .await?;
    Ok(Json(rows))
}

pub async fn delete_import_key(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let session_id: Option<Uuid> =
        sqlx::query_scalar("select session_id from import_keys where id = $1")
            .bind(id)
            .fetch_optional(state.pool())
            .await?;
    let session_id = session_id.ok_or(AppError::NotFound)?;
    require_owner(&state, auth.user_id, session_id).await?;

    sqlx::query("delete from import_keys where id = $1")
        .bind(id)
        .execute(state.pool())
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ---- imports (import-key auth) ----------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ImportTablesRequest {
    #[serde(default)]
    pub replace: bool,
    pub tables: Vec<ImportTable>,
}

pub async fn import_oracle_tables(
    State(state): State<AppState>,
    auth: ImportAuth,
    Json(req): Json<ImportTablesRequest>,
) -> Result<Json<Value>, AppError> {
    let result = import_bundle(
        &state,
        auth.user_id,
        Some(auth.session_id),
        req.replace,
        req.tables,
        &auth.metadata(),
    )
    .await?;
    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
pub struct ImportStatBlocksRequest {
    pub stat_blocks: Vec<ImportStatBlock>,
}

#[derive(Debug, Deserialize)]
pub struct ImportStatBlock {
    #[serde(default = "default_stat_block_kind")]
    pub kind: String,
    pub data: Value,
}

fn default_stat_block_kind() -> String {
    "monster".to_string()
}

pub async fn import_stat_blocks(
    State(state): State<AppState>,
    auth: ImportAuth,
    Json(req): Json<ImportStatBlocksRequest>,
) -> Result<Json<Value>, AppError> {
    if req.stat_blocks.is_empty() || req.stat_blocks.len() > MAX_STAT_BLOCKS {
        return Err(AppError::BadRequest(format!(
            "bundle must contain 1-{MAX_STAT_BLOCKS} stat blocks"
        )));
    }
    for block in &req.stat_blocks {
        if !matches!(block.kind.as_str(), "npc" | "monster") {
            return Err(AppError::BadRequest("invalid stat block kind".into()));
        }
        if !block.data.is_object() {
            return Err(AppError::BadRequest("stat block data must be an object".into()));
        }
    }

    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        for block in &req.stat_blocks {
            statblock::projection::create(
                &mut tx,
                Uuid::new_v4(),
                auth.session_id,
                auth.user_id,
                &block.kind,
                &block.data,
                &metadata,
            )
            .await?;
        }
        Ok(())
    })?;

    Ok(Json(json!({ "imported": req.stat_blocks.len() })))
}

#[derive(Debug, Deserialize)]
pub struct ImportCharactersRequest {
    pub characters: Vec<ImportCharacter>,
}

#[derive(Debug, Deserialize)]
pub struct ImportCharacter {
    pub data: Value,
}

pub async fn import_characters(
    State(state): State<AppState>,
    auth: ImportAuth,
    Json(req): Json<ImportCharactersRequest>,
) -> Result<Json<Value>, AppError> {
    if req.characters.is_empty() || req.characters.len() > MAX_CHARACTERS {
        return Err(AppError::BadRequest(format!(
            "bundle must contain 1-{MAX_CHARACTERS} characters"
        )));
    }
    for character in &req.characters {
        if !character.data.is_object() {
            return Err(AppError::BadRequest("character data must be an object".into()));
        }
    }

    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        for character in &req.characters {
            character::projection::create(
                &mut tx,
                Uuid::new_v4(),
                Some(auth.session_id),
                auth.user_id,
                &character.data,
                &metadata,
            )
            .await?;
        }
        Ok(())
    })?;

    Ok(Json(json!({ "imported": req.characters.len() })))
}

#[derive(Debug, Deserialize)]
pub struct ImportCompendiumRequest {
    pub entries: Vec<ImportCompendiumEntry>,
}

#[derive(Debug, Deserialize)]
pub struct ImportCompendiumEntry {
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub data: Value,
}

pub async fn import_compendium(
    State(state): State<AppState>,
    auth: ImportAuth,
    Json(req): Json<ImportCompendiumRequest>,
) -> Result<Json<Value>, AppError> {
    if req.entries.is_empty() || req.entries.len() > MAX_COMPENDIUM_ENTRIES {
        return Err(AppError::BadRequest(format!(
            "bundle must contain 1-{MAX_COMPENDIUM_ENTRIES} entries"
        )));
    }
    for entry in &req.entries {
        if !matches!(entry.kind.as_str(), "gear" | "spell") {
            return Err(AppError::BadRequest("compendium kind must be gear or spell".into()));
        }
        check_len(entry.name.trim(), "entry name", 1, MAX_NAME_LEN)?;
        if !(entry.data.is_object() || entry.data.is_null()) {
            return Err(AppError::BadRequest("entry data must be an object".into()));
        }
    }

    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        for entry in &req.entries {
            let data = if entry.data.is_null() { json!({}) } else { entry.data.clone() };
            compendium::projection::upsert(
                &mut tx,
                auth.session_id,
                auth.user_id,
                &entry.kind,
                entry.name.trim(),
                &data,
                &metadata,
            )
            .await?;
        }
        Ok(())
    })?;

    Ok(Json(json!({ "imported": req.entries.len() })))
}

// ---- helpers ----------------------------------------------------------------

async fn require_owner(state: &AppState, user_id: Uuid, session_id: Uuid) -> Result<(), AppError> {
    if authz::is_session_gm(state.pool(), user_id, session_id).await? {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}
