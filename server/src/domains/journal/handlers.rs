//! session journal (#56). prose entries and pinned rolls in one chronological
//! stream. anyone in the session writes; edits and deletes are author-or-gm,
//! same policy the notebook notes use.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::journal::projection;
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

const MAX_BODY_LEN: usize = 8000;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct JournalEntryRow {
    pub id: Uuid,
    pub session_id: Uuid,
    pub author_user_id: Uuid,
    pub author_name: String,
    pub kind: String,
    pub body: String,
    pub pin: Option<Value>,
    pub game_date: Option<Value>,
    pub character_id: Option<Uuid>,
    pub character_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SessionQuery {
    pub session_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct CreateEntryRequest {
    pub session_id: Uuid,
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(default)]
    pub body: String,
    pub pin: Option<Value>,
    pub game_date: Option<Value>,
    pub character_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEntryRequest {
    pub body: String,
    // absent = keep the current attribution, null = narration, uuid = that
    // character (name re-snapshotted at edit time, same as create)
    #[serde(default, deserialize_with = "field_present")]
    pub character_id: Option<Option<Uuid>>,
}

fn field_present<'de, D>(deserializer: D) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<Uuid>::deserialize(deserializer).map(Some)
}

fn default_kind() -> String {
    "prose".to_string()
}

pub async fn list_entries(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<SessionQuery>,
) -> Result<Json<Vec<JournalEntryRow>>, AppError> {
    require_member(&state, auth.user_id, query.session_id).await?;
    let rows = sqlx::query_as(
        r#"
        select id, session_id, author_user_id, author_name, kind, body, pin, game_date, character_id, character_name, created_at, updated_at
        from journal_entries
        where session_id = $1
        order by created_at asc
        limit 500
        "#,
    )
    .bind(query.session_id)
    .fetch_all(state.pool())
    .await?;

    Ok(Json(rows))
}

pub async fn create_entry(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateEntryRequest>,
) -> Result<Json<JournalEntryRow>, AppError> {
    require_member(&state, auth.user_id, req.session_id).await?;
    let body = req.body.trim();
    match req.kind.as_str() {
        "prose" => {
            if body.is_empty() {
                return Err(AppError::BadRequest("entry is empty".to_string()));
            }
        }
        "pin" => {
            if req.pin.as_ref().and_then(Value::as_object).is_none() {
                return Err(AppError::BadRequest("pin payload is required".to_string()));
            }
        }
        // a marker splitting the stream into pages; carries no content
        "page_break" => {}
        _ => return Err(AppError::BadRequest("invalid entry kind".to_string())),
    }
    if body.chars().count() > MAX_BODY_LEN {
        return Err(AppError::BadRequest(format!(
            "entry cannot exceed {MAX_BODY_LEN} characters"
        )));
    }
    let display_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;
    let character_name = match req.character_id {
        Some(character_id) => Some(speaker_name(&state, character_id, req.session_id).await?),
        None => None,
    };

    let event = NewEvent {
        aggregate_type: "journal_entry",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(req.session_id),
        event_type: "journal_entry.created",
        payload: json!({
            "kind": req.kind,
            "body": body,
            "pin": req.pin,
            "game_date": req.game_date,
            "author_name": display_name,
            "character_id": req.character_id,
            "character_name": character_name,
        }),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_created(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn update_entry(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateEntryRequest>,
) -> Result<Json<JournalEntryRow>, AppError> {
    let (author, session_id, kind) = entry_scope(&state, id).await?.ok_or(AppError::NotFound)?;
    require_author_or_gm(&state, auth.user_id, author, session_id).await?;
    let body = req.body.trim();
    // a page break's body is its title, and clearing the title is fine
    if (body.is_empty() && kind != "page_break") || body.chars().count() > MAX_BODY_LEN {
        return Err(AppError::BadRequest(format!(
            "entry must be 1-{MAX_BODY_LEN} characters"
        )));
    }
    if req.character_id.is_some() && kind != "prose" {
        return Err(AppError::BadRequest(
            "only prose entries can be attributed".to_string(),
        ));
    }

    let mut payload = json!({ "body": body });
    if let Some(speaker) = req.character_id {
        let character_name = match speaker {
            Some(character_id) => json!(speaker_name(&state, character_id, session_id).await?),
            None => Value::Null,
        };
        payload["character_id"] = json!(speaker);
        payload["character_name"] = character_name;
    }

    let event = NewEvent {
        aggregate_type: "journal_entry",
        aggregate_id: id,
        session_id: Some(session_id),
        event_type: "journal_entry.updated",
        payload,
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_updated(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn delete_entry(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let (author, session_id, _) = entry_scope(&state, id).await?.ok_or(AppError::NotFound)?;
    require_author_or_gm(&state, auth.user_id, author, session_id).await?;

    let event = NewEvent {
        aggregate_type: "journal_entry",
        aggregate_id: id,
        session_id: Some(session_id),
        event_type: "journal_entry.deleted",
        payload: json!({}),
        metadata: auth.metadata(),
    };

    retry_tx!(state.pool(), |tx| {
        projection::append_deleted(&mut tx, &event).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// speaker snapshot for an entry attached to a character: the character must
/// live in the entry's session, and the name is captured at write time, same
/// as author_name
async fn speaker_name(
    state: &AppState,
    character_id: Uuid,
    session_id: Uuid,
) -> Result<String, AppError> {
    let row: Option<(Uuid, Option<String>)> =
        sqlx::query_as("select session_id, data->>'name' from characters where id = $1")
            .bind(character_id)
            .fetch_optional(state.pool())
            .await?;
    let (character_session, name) =
        row.ok_or_else(|| AppError::BadRequest("character does not exist".to_string()))?;
    if character_session != session_id {
        return Err(AppError::BadRequest(
            "character is not in this session".to_string(),
        ));
    }
    Ok(name
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Unnamed".to_string()))
}

async fn entry_scope(state: &AppState, id: Uuid) -> Result<Option<(Uuid, Uuid, String)>, AppError> {
    sqlx::query_as("select author_user_id, session_id, kind from journal_entries where id = $1")
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

async fn require_author_or_gm(
    state: &AppState,
    user_id: Uuid,
    author: Uuid,
    session_id: Uuid,
) -> Result<(), AppError> {
    if user_id == author || authz::is_session_gm(state.pool(), user_id, session_id).await? {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}
