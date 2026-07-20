use std::collections::HashSet;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Utc};
use rand::Rng;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};
use ttrpg_dice_engine::{LiveRng, RngSource};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::oracle::{projection, roll};
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

const MAX_NAME_LEN: usize = 120;
const MAX_DESC_LEN: usize = 500;
const MAX_RESULT_LEN: usize = 500;
const MAX_NOTES_LEN: usize = 1000;
const MAX_QUESTION_LEN: usize = 500;
const MAX_TAG_LEN: usize = 60;
// deep enough for encounter -> monster -> reaction -> distance -> morale with
// room to spare, small enough that a write-time a->b->a cycle can't spin
const MAX_CHAIN_DEPTH: usize = 8;

#[derive(Debug, Deserialize)]
pub struct SessionQuery {
    pub session_id: Uuid,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct OracleTableRow {
    pub id: Uuid,
    pub created_by: Uuid,
    pub name: String,
    pub description: String,
    pub mode: String,
    pub tag: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct OracleTableRowRow {
    pub id: Uuid,
    pub table_id: Uuid,
    pub weight: i32,
    pub range_min: Option<i32>,
    pub range_max: Option<i32>,
    pub result: String,
    pub notes: String,
    pub position: i32,
    pub subtable_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SessionTableLink {
    pub id: Uuid,
    pub session_id: Uuid,
    pub table_id: Uuid,
    pub added_by: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct OracleRollRow {
    pub id: Uuid,
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub kind: String,
    pub question: Option<String>,
    pub table_id: Option<Uuid>,
    pub table_name: Option<String>,
    pub result: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTableRequest {
    // tables are user-owned; passing a session also adds the new table to it
    pub session_id: Option<Uuid>,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_table_mode")]
    pub mode: String,
    pub tag: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTableRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub mode: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRowRequest {
    #[serde(default = "default_weight")]
    pub weight: i32,
    pub range_min: Option<i32>,
    pub range_max: Option<i32>,
    pub result: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub position: i32,
    pub subtable_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRowRequest {
    pub weight: Option<i32>,
    pub range_min: Option<i32>,
    pub range_max: Option<i32>,
    pub result: Option<String>,
    pub notes: Option<String>,
    pub position: Option<i32>,
    // absent = leave alone, null = clear the chain, value = set it
    #[serde(default, deserialize_with = "double_option")]
    pub subtable_id: Option<Option<Uuid>>,
}

fn double_option<'de, D>(de: D) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: Deserializer<'de>,
{
    Deserialize::deserialize(de).map(Some)
}

#[derive(Debug, Deserialize)]
pub struct AttachTableRequest {
    pub session_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct RollOracleRequest {
    pub session_id: Uuid,
    pub kind: String,
    pub question: Option<String>,
    pub odds: Option<String>,
    pub table_id: Option<Uuid>,
}

#[derive(Debug, sqlx::FromRow)]
struct TableScope {
    created_by: Uuid,
    name: String,
    mode: String,
}

fn default_table_mode() -> String {
    "weighted".to_string()
}

fn default_weight() -> i32 {
    1
}

pub async fn list_tables(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<OracleTableRow>>, AppError> {
    let rows = sqlx::query_as(
        r#"
        select id, created_by, name, description, mode, tag, created_at, updated_at
        from oracle_tables
        where created_by = $1
        order by updated_at desc, created_at desc
        "#,
    )
    .bind(auth.user_id)
    .fetch_all(state.pool())
    .await?;

    Ok(Json(rows))
}

pub async fn list_rolls(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<SessionQuery>,
) -> Result<Json<Vec<OracleRollRow>>, AppError> {
    require_member(&state, auth.user_id, query.session_id).await?;
    let rows = sqlx::query_as(
        r#"
        select id, session_id, user_id, display_name, kind, question, table_id, table_name, result, created_at
        from oracle_rolls
        where session_id = $1
        order by created_at desc
        limit 80
        "#,
    )
    .bind(query.session_id)
    .fetch_all(state.pool())
    .await?;

    Ok(Json(rows))
}

pub async fn create_table(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateTableRequest>,
) -> Result<Json<OracleTableRow>, AppError> {
    if let Some(session_id) = req.session_id {
        require_member(&state, auth.user_id, session_id).await?;
    }
    let name = clean_text(&req.name, "table name", 1, MAX_NAME_LEN)?;
    let description = clean_text(&req.description, "description", 0, MAX_DESC_LEN)?;
    validate_mode(&req.mode)?;
    let tag = clean_tag(req.tag.as_deref())?;

    let event = NewEvent {
        aggregate_type: "oracle_table",
        aggregate_id: Uuid::new_v4(),
        session_id: None,
        event_type: "oracle_table.created",
        payload: json!({ "name": name, "description": description, "mode": req.mode, "tag": tag }),
        metadata: auth.metadata(),
    };
    let attach_event = req.session_id.map(|session_id| NewEvent {
        aggregate_type: "session_oracle_table",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(session_id),
        event_type: "session_oracle_table.created",
        payload: json!({ "table_id": event.aggregate_id }),
        metadata: auth.metadata(),
    });

    let row = retry_tx!(state.pool(), |tx| {
        let row = projection::append_table_created(&mut tx, &event).await?;
        if let Some(attach) = &attach_event {
            projection::append_table_attached(&mut tx, attach).await?;
        }
        Ok(row)
    })?;

    Ok(Json(row))
}

pub async fn attach_table(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<AttachTableRequest>,
) -> Result<Json<SessionTableLink>, AppError> {
    let scope = table_scope(&state, id).await?.ok_or(AppError::NotFound)?;
    require_owner(&scope, auth.user_id)?;
    require_member(&state, auth.user_id, req.session_id).await?;

    // adding a table twice is a no-op, not an error
    if let Some(existing) = attachment(&state, req.session_id, id).await? {
        return Ok(Json(existing));
    }

    let event = NewEvent {
        aggregate_type: "session_oracle_table",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(req.session_id),
        event_type: "session_oracle_table.created",
        payload: json!({ "table_id": id }),
        metadata: auth.metadata(),
    };

    let link = retry_tx!(state.pool(), |tx| {
        projection::append_table_attached(&mut tx, &event).await
    })?;

    Ok(Json(link))
}

/// any session member can take a table off the session board; the table
/// itself stays in its owner's library
pub async fn detach_table(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<SessionQuery>,
) -> Result<StatusCode, AppError> {
    require_member(&state, auth.user_id, query.session_id).await?;
    let link = attachment(&state, query.session_id, id)
        .await?
        .ok_or(AppError::NotFound)?;

    let event = NewEvent {
        aggregate_type: "session_oracle_table",
        aggregate_id: link.id,
        session_id: Some(query.session_id),
        event_type: "session_oracle_table.deleted",
        payload: json!({}),
        metadata: auth.metadata(),
    };

    retry_tx!(state.pool(), |tx| {
        projection::append_table_detached(&mut tx, &event).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_table(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateTableRequest>,
) -> Result<Json<OracleTableRow>, AppError> {
    let scope = table_scope(&state, id).await?.ok_or(AppError::NotFound)?;
    require_owner(&scope, auth.user_id)?;

    let mut payload = serde_json::Map::new();
    if let Some(name) = req.name {
        payload.insert(
            "name".to_string(),
            json!(clean_text(&name, "table name", 1, MAX_NAME_LEN)?),
        );
    }
    if let Some(description) = req.description {
        payload.insert(
            "description".to_string(),
            json!(clean_text(&description, "description", 0, MAX_DESC_LEN)?),
        );
    }
    if let Some(mode) = req.mode {
        validate_mode(&mode)?;
        payload.insert("mode".to_string(), json!(mode));
    }
    if let Some(tag) = req.tag {
        payload.insert("tag".to_string(), json!(clean_tag(Some(&tag))?));
    }
    if payload.is_empty() {
        return Err(AppError::BadRequest("empty table update".to_string()));
    }

    let event = NewEvent {
        aggregate_type: "oracle_table",
        aggregate_id: id,
        session_id: None,
        event_type: "oracle_table.updated",
        payload: Value::Object(payload),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_table_updated(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn delete_table(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let scope = table_scope(&state, id).await?.ok_or(AppError::NotFound)?;
    require_owner(&scope, auth.user_id)?;

    // explicit detach events per session first: the fk cascade would remove
    // the links silently, and the realtime bus routes by session, so without
    // these the sessions using the table would never hear it went away
    let links: Vec<(Uuid, Uuid)> =
        sqlx::query_as("select id, session_id from session_oracle_tables where table_id = $1")
            .bind(id)
            .fetch_all(state.pool())
            .await?;
    let detach_events: Vec<NewEvent> = links
        .into_iter()
        .map(|(link_id, session_id)| NewEvent {
            aggregate_type: "session_oracle_table",
            aggregate_id: link_id,
            session_id: Some(session_id),
            event_type: "session_oracle_table.deleted",
            payload: json!({}),
            metadata: auth.metadata(),
        })
        .collect();

    let event = NewEvent {
        aggregate_type: "oracle_table",
        aggregate_id: id,
        session_id: None,
        event_type: "oracle_table.deleted",
        payload: json!({}),
        metadata: auth.metadata(),
    };

    retry_tx!(state.pool(), |tx| {
        for detach in &detach_events {
            projection::append_table_detached(&mut tx, detach).await?;
        }
        projection::append_table_deleted(&mut tx, &event).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_row(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(table_id): Path<Uuid>,
    Json(req): Json<CreateRowRequest>,
) -> Result<Json<OracleTableRowRow>, AppError> {
    let scope = table_scope(&state, table_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_owner(&scope, auth.user_id)?;
    validate_row_shape(req.weight, req.range_min, req.range_max)?;
    let result = clean_text(&req.result, "result", 1, MAX_RESULT_LEN)?;
    let notes = clean_text(&req.notes, "notes", 0, MAX_NOTES_LEN)?;
    if let Some(subtable_id) = req.subtable_id {
        validate_subtable(&state, scope.created_by, table_id, subtable_id).await?;
    }

    let event = NewEvent {
        aggregate_type: "oracle_table_row",
        aggregate_id: Uuid::new_v4(),
        session_id: None,
        event_type: "oracle_table_row.created",
        payload: json!({
            "table_id": table_id,
            "weight": req.weight,
            "range_min": req.range_min,
            "range_max": req.range_max,
            "result": result,
            "notes": notes,
            "position": req.position,
            "subtable_id": req.subtable_id,
        }),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_row_created(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn update_row(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateRowRequest>,
) -> Result<Json<OracleTableRowRow>, AppError> {
    let (owner_id, current) = row_scope(&state, id).await?.ok_or(AppError::NotFound)?;
    if owner_id != auth.user_id {
        return Err(AppError::Forbidden);
    }

    let weight = req.weight.unwrap_or(current.weight);
    let range_min = req.range_min.or(current.range_min);
    let range_max = req.range_max.or(current.range_max);
    validate_row_shape(weight, range_min, range_max)?;

    let mut payload = serde_json::Map::new();
    if let Some(weight) = req.weight {
        payload.insert("weight".to_string(), json!(weight));
    }
    if req.range_min.is_some() {
        payload.insert("range_min".to_string(), json!(req.range_min));
    }
    if req.range_max.is_some() {
        payload.insert("range_max".to_string(), json!(req.range_max));
    }
    if let Some(result) = req.result {
        payload.insert(
            "result".to_string(),
            json!(clean_text(&result, "result", 1, MAX_RESULT_LEN)?),
        );
    }
    if let Some(notes) = req.notes {
        payload.insert(
            "notes".to_string(),
            json!(clean_text(&notes, "notes", 0, MAX_NOTES_LEN)?),
        );
    }
    if let Some(position) = req.position {
        payload.insert("position".to_string(), json!(position));
    }
    if let Some(subtable_id) = req.subtable_id {
        if let Some(subtable_id) = subtable_id {
            validate_subtable(&state, owner_id, current.table_id, subtable_id).await?;
        }
        payload.insert("subtable_id".to_string(), json!(subtable_id));
    }
    if payload.is_empty() {
        return Err(AppError::BadRequest("empty row update".to_string()));
    }
    // the realtime listener fans row events out to the table's sessions and
    // needs the table id; the update projection ignores unknown keys
    payload.insert("table_id".to_string(), json!(current.table_id));

    let event = NewEvent {
        aggregate_type: "oracle_table_row",
        aggregate_id: id,
        session_id: None,
        event_type: "oracle_table_row.updated",
        payload: Value::Object(payload),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_row_updated(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn delete_row(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let (owner_id, current) = row_scope(&state, id).await?.ok_or(AppError::NotFound)?;
    if owner_id != auth.user_id {
        return Err(AppError::Forbidden);
    }

    let event = NewEvent {
        aggregate_type: "oracle_table_row",
        aggregate_id: id,
        session_id: None,
        event_type: "oracle_table_row.deleted",
        // the row is gone by dispatch time, so the fan-out lookup needs the
        // table id in the event itself
        payload: json!({ "table_id": current.table_id }),
        metadata: auth.metadata(),
    };

    retry_tx!(state.pool(), |tx| {
        projection::append_row_deleted(&mut tx, &event).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn roll_oracle(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<RollOracleRequest>,
) -> Result<Json<OracleRollRow>, AppError> {
    require_member(&state, auth.user_id, req.session_id).await?;
    let question = match req.question {
        Some(q) => Some(clean_text(&q, "question", 0, MAX_QUESTION_LEN)?).filter(|q| !q.is_empty()),
        None => None,
    };
    let display_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;

    let (table_id, table_name, result) = match req.kind.as_str() {
        "yes_no" => {
            let odds = req.odds.unwrap_or_else(|| "even".to_string());
            (None, None, yes_no_result(&odds)?)
        }
        "event_prompt" => (None, None, event_prompt_result(&state, req.session_id).await?),
        "table" => {
            let table_id = req
                .table_id
                .ok_or_else(|| AppError::BadRequest("table_id is required".to_string()))?;
            let scope = table_scope(&state, table_id)
                .await?
                .ok_or(AppError::NotFound)?;
            // your own tables roll anywhere; other people's only where the
            // owner has added them to the session
            if scope.created_by != auth.user_id
                && attachment(&state, req.session_id, table_id).await?.is_none()
            {
                return Err(AppError::Forbidden);
            }
            let result = table_result(&state, table_id, &scope).await?;
            (Some(table_id), Some(scope.name), result)
        }
        _ => return Err(AppError::BadRequest("invalid oracle roll kind".to_string())),
    };

    let event = NewEvent {
        aggregate_type: "oracle_roll",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(req.session_id),
        event_type: "oracle.rolled",
        payload: json!({
            "kind": req.kind,
            "question": question,
            "table_id": table_id,
            "table_name": table_name,
            "result": result,
        }),
        metadata: auth.metadata_with(json!({ "display_name": display_name })),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_roll(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

async fn require_member(state: &AppState, user_id: Uuid, session_id: Uuid) -> Result<(), AppError> {
    if authz::is_session_member(state.pool(), user_id, session_id).await? {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

fn require_owner(scope: &TableScope, user_id: Uuid) -> Result<(), AppError> {
    if scope.created_by == user_id {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

async fn table_scope(state: &AppState, table_id: Uuid) -> Result<Option<TableScope>, AppError> {
    sqlx::query_as("select created_by, name, mode from oracle_tables where id = $1")
        .bind(table_id)
        .fetch_optional(state.pool())
        .await
        .map_err(Into::into)
}

async fn attachment(
    state: &AppState,
    session_id: Uuid,
    table_id: Uuid,
) -> Result<Option<SessionTableLink>, AppError> {
    sqlx::query_as(
        "select id, session_id, table_id, added_by, created_at from session_oracle_tables where session_id = $1 and table_id = $2",
    )
    .bind(session_id)
    .bind(table_id)
    .fetch_optional(state.pool())
    .await
    .map_err(Into::into)
}

async fn row_scope(
    state: &AppState,
    row_id: Uuid,
) -> Result<Option<(Uuid, OracleTableRowRow)>, AppError> {
    let row: Option<(Uuid, Uuid, Uuid, i32, Option<i32>, Option<i32>, String, String, i32, Option<Uuid>, DateTime<Utc>, DateTime<Utc>)> = sqlx::query_as(
        r#"
        select ot.created_by, r.id, r.table_id, r.weight, r.range_min, r.range_max, r.result, r.notes, r.position, r.subtable_id, r.created_at, r.updated_at
        from oracle_table_rows r
        join oracle_tables ot on ot.id = r.table_id
        where r.id = $1
        "#,
    )
    .bind(row_id)
    .fetch_optional(state.pool())
    .await?;

    Ok(row.map(
        |(
            owner_id,
            id,
            table_id,
            weight,
            range_min,
            range_max,
            result,
            notes,
            position,
            subtable_id,
            created_at,
            updated_at,
        )| {
            (
                owner_id,
                OracleTableRowRow {
                    id,
                    table_id,
                    weight,
                    range_min,
                    range_max,
                    result,
                    notes,
                    position,
                    subtable_id,
                    created_at,
                    updated_at,
                },
            )
        },
    ))
}

fn clean_text(value: &str, field: &str, min: usize, max: usize) -> Result<String, AppError> {
    let trimmed = value.trim().to_string();
    let len = trimmed.chars().count();
    if len < min {
        return Err(AppError::BadRequest(format!("{field} cannot be empty")));
    }
    if len > max {
        return Err(AppError::BadRequest(format!(
            "{field} cannot exceed {max} characters"
        )));
    }
    Ok(trimmed)
}

fn clean_tag(value: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(value) = value else { return Ok(None) };
    let trimmed = value.trim().to_lowercase();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.chars().count() > MAX_TAG_LEN {
        return Err(AppError::BadRequest(format!(
            "tag cannot exceed {MAX_TAG_LEN} characters"
        )));
    }
    Ok(Some(trimmed))
}

fn validate_mode(mode: &str) -> Result<(), AppError> {
    if matches!(mode, "weighted" | "range") {
        Ok(())
    } else {
        Err(AppError::BadRequest("invalid table mode".to_string()))
    }
}

fn validate_row_shape(
    weight: i32,
    range_min: Option<i32>,
    range_max: Option<i32>,
) -> Result<(), AppError> {
    if weight <= 0 {
        return Err(AppError::BadRequest(
            "row weight must be greater than zero".to_string(),
        ));
    }
    match (range_min, range_max) {
        (Some(min), Some(max)) if min <= max => Ok(()),
        (Some(_), Some(_)) => Err(AppError::BadRequest(
            "range_min must be less than or equal to range_max".to_string(),
        )),
        (None, None) => Ok(()),
        _ => Err(AppError::BadRequest(
            "range rows need both range_min and range_max".to_string(),
        )),
    }
}

fn yes_no_threshold(odds: &str) -> Result<i32, AppError> {
    match odds {
        "impossible" => Ok(5),
        "unlikely" => Ok(25),
        "even" | "fifty_fifty" => Ok(50),
        "likely" => Ok(75),
        "almost_certain" => Ok(95),
        _ => Err(AppError::BadRequest("invalid odds".to_string())),
    }
}

fn yes_no_result(odds: &str) -> Result<Value, AppError> {
    let threshold = yes_no_threshold(odds)?;
    let roll = rand::thread_rng().gen_range(1..=100);
    Ok(yes_no_result_for_roll(odds, threshold, roll))
}

fn yes_no_result_for_roll(odds: &str, threshold: i32, roll: i32) -> Value {
    let yes = roll <= threshold;
    let label = if yes && roll <= 5 {
        "Yes, and..."
    } else if yes && roll > (threshold - 10).max(0) {
        "Yes, but..."
    } else if yes {
        "Yes"
    } else if !yes && roll >= 96 {
        "No, and..."
    } else if !yes && roll <= (threshold + 10).min(100) {
        "No, but..."
    } else {
        "No"
    };

    let twist = if roll == 1 || roll == 100 || roll % 11 == 0 {
        Some(random_twist())
    } else {
        None
    };

    json!({
        "label": label,
        "roll": roll,
        "odds": odds,
        "threshold": threshold,
        "twist": twist,
    })
}

const PROMPT_SLOTS: &[(&str, &[&str])] = &[
    ("action", &["Reveal", "Threaten", "Divide", "Delay", "Escalate", "Transform", "Bargain", "Pursue", "Conceal", "Return"]),
    ("theme", &["Debt", "Hunger", "Memory", "Oath", "Ruin", "Shelter", "Pride", "Mercy", "Power", "Loss"]),
    ("subject", &["a rival", "an ally", "the environment", "a hidden faction", "a resource", "a relic", "a rumor", "the weather", "a monster", "a settlement"]),
    ("location", &["nearby", "behind the party", "at a threshold", "underground", "across water", "in plain sight", "in a safe place", "on the road", "inside a ruin", "at camp"]),
    ("complication", &["time runs short", "someone wants payment", "evidence is misleading", "help has a cost", "noise draws attention", "the route changes", "trust is tested", "supplies are strained", "a promise resurfaces", "the danger is closer than expected"]),
];

/// each slot checks for a session table tagged prompt.<slot> and rolls it,
/// falling back to the built-in list when there's no table or the table
/// can't produce a row. slots resolve independently, so a game can override
/// just one column. chained subtables are not walked here - a prompt cell
/// is one line, not a result tree.
async fn event_prompt_result(state: &AppState, session_id: Uuid) -> Result<Value, AppError> {
    let mut prompt = serde_json::Map::new();
    for (slot, builtin) in PROMPT_SLOTS {
        let tag = format!("prompt.{slot}");
        let custom = match tagged_session_table(state, session_id, &tag).await? {
            Some(table) => roll_single_table(state, table.id, &table.name, &table.mode)
                .await?
                .and_then(|step| step.get("result").and_then(Value::as_str).map(String::from)),
            None => None,
        };
        let text = custom.unwrap_or_else(|| pick(builtin).to_string());
        prompt.insert((*slot).to_string(), json!(text));
    }
    Ok(Value::Object(prompt))
}

#[derive(Debug, sqlx::FromRow)]
struct TaggedTable {
    id: Uuid,
    name: String,
    mode: String,
}

/// the active table for a tag: most recently edited among the tables added
/// to this session, matching what the panel help promises
async fn tagged_session_table(
    state: &AppState,
    session_id: Uuid,
    tag: &str,
) -> Result<Option<TaggedTable>, AppError> {
    sqlx::query_as(
        r#"
        select ot.id, ot.name, ot.mode
        from oracle_tables ot
        join session_oracle_tables sot on sot.table_id = ot.id
        where sot.session_id = $1 and ot.tag = $2
        order by ot.updated_at desc, ot.created_at desc
        limit 1
        "#,
    )
    .bind(session_id)
    .bind(tag)
    .fetch_optional(state.pool())
    .await
    .map_err(Into::into)
}

fn random_twist() -> &'static str {
    pick(&[
        "A new threat enters the scene.",
        "The answer is true, but for the wrong reason.",
        "An old choice creates a new cost.",
        "Someone nearby notices the party.",
        "A useful resource is damaged, lost, or consumed.",
        "The situation shifts before anyone can act.",
    ])
}

fn pick(options: &'static [&'static str]) -> &'static str {
    let idx = rand::thread_rng().gen_range(0..options.len());
    options[idx]
}

async fn validate_subtable(
    state: &AppState,
    owner_id: Uuid,
    table_id: Uuid,
    subtable_id: Uuid,
) -> Result<(), AppError> {
    if subtable_id == table_id {
        return Err(AppError::BadRequest(
            "a row cannot chain to its own table".to_string(),
        ));
    }
    let scope = table_scope(state, subtable_id)
        .await?
        .ok_or_else(|| AppError::BadRequest("chained table does not exist".to_string()))?;
    if scope.created_by != owner_id {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

/// rolls one table and walks any subtable references. every step lands in
/// `chain`; the head step's fields stay at the top level so old history
/// entries and readers keep working. cycles and over-deep chains stop the
/// walk and flag `chain_truncated` instead of erroring - the rolls up to
/// that point are still real.
async fn table_result(
    state: &AppState,
    table_id: Uuid,
    scope: &TableScope,
) -> Result<Value, AppError> {
    let mut steps: Vec<Value> = Vec::new();
    let mut visited: HashSet<Uuid> = HashSet::new();
    let mut truncated = false;
    let mut current = Some((table_id, scope.name.clone(), scope.mode.clone()));

    while let Some((tid, tname, tmode)) = current.take() {
        visited.insert(tid);
        let step = match roll_single_table(state, tid, &tname, &tmode).await? {
            Some(step) => step,
            None => {
                // degenerate table (empty, range gap, zero weight): fatal for
                // the head roll, a dead end mid-chain
                if steps.is_empty() {
                    return Err(AppError::BadRequest(
                        "could not choose a table row".to_string(),
                    ));
                }
                truncated = true;
                break;
            }
        };

        let subtable_id = step
            .get("subtable_id")
            .and_then(Value::as_str)
            .and_then(|s| Uuid::parse_str(s).ok());
        steps.push(step);

        if let Some(sub) = subtable_id {
            if steps.len() >= MAX_CHAIN_DEPTH || visited.contains(&sub) {
                truncated = true;
            } else if let Some(sub_scope) = table_scope(state, sub).await? {
                if sub_scope.created_by == scope.created_by {
                    current = Some((sub, sub_scope.name, sub_scope.mode));
                }
            }
        }
    }

    let mut payload = steps[0].clone();
    let obj = payload.as_object_mut().expect("step is an object");
    obj.remove("subtable_id");
    if steps.len() > 1 {
        obj.insert("chain".to_string(), json!(steps));
    }
    if truncated {
        obj.insert("chain_truncated".to_string(), json!(true));
    }
    Ok(payload)
}

/// one table, one row: returns the step payload or None when the table can't
/// produce a row (empty / range gap / no positive weight)
async fn roll_single_table(
    state: &AppState,
    table_id: Uuid,
    table_name: &str,
    table_mode: &str,
) -> Result<Option<Value>, AppError> {
    let rows: Vec<OracleTableRowRow> = sqlx::query_as(
        r#"
        select id, table_id, weight, range_min, range_max, result, notes, position, subtable_id, created_at, updated_at
        from oracle_table_rows
        where table_id = $1
        order by position asc, created_at asc
        "#,
    )
    .bind(table_id)
    .fetch_all(state.pool())
    .await?;

    if rows.is_empty() {
        return Ok(None);
    }

    let roll_rows: Vec<roll::RollRow> = rows
        .iter()
        .map(|row| roll::RollRow {
            weight: row.weight,
            range_min: row.range_min,
            range_max: row.range_max,
        })
        .collect();

    let (mut step, index) = match roll::resolve(table_mode, &roll_rows) {
        roll::TableRoll::Range { roll, index } => (
            json!({
                "table_mode": "range",
                "roll": roll,
            }),
            index,
        ),
        roll::TableRoll::Weighted { total_weight, index } => (
            json!({
                "table_mode": "weighted",
                "total_weight": total_weight,
            }),
            index,
        ),
        roll::TableRoll::RangeGap { .. } | roll::TableRoll::NoPositiveWeight => return Ok(None),
    };

    let row = &rows[index];
    let mut rng = LiveRng::new();
    let (text, dice) = resolve_dice_text(&row.result, &mut rng);
    let obj = step.as_object_mut().expect("step is an object");
    obj.insert("table_id".to_string(), json!(table_id));
    obj.insert("table_name".to_string(), json!(table_name));
    obj.insert("row_id".to_string(), json!(row.id));
    obj.insert("result".to_string(), json!(text));
    obj.insert("notes".to_string(), json!(row.notes));
    obj.insert("subtable_id".to_string(), json!(row.subtable_id));
    if !dice.is_empty() {
        obj.insert("dice".to_string(), json!(dice));
    }
    Ok(Some(step))
}

/// replaces {expr} spans in a result cell with rolled totals ("{2d6} goblins"
/// -> "7 goblins"). anything the dice engine can't parse is left verbatim, so
/// braces in prose are harmless. returns the resolved text plus one
/// {expr, total} record per rolled span.
fn resolve_dice_text(text: &str, rng: &mut dyn RngSource) -> (String, Vec<Value>) {
    let mut out = String::new();
    let mut dice = Vec::new();
    let mut rest = text;

    while let Some(start) = rest.find('{') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        let Some(end) = after.find('}') else {
            out.push_str(&rest[start..]);
            rest = "";
            break;
        };
        let expr = after[..end].trim();
        match ttrpg_dice_engine::roll(expr, rng) {
            Ok(rolled) => {
                out.push_str(&rolled.total.to_string());
                dice.push(json!({ "expr": expr, "total": rolled.total }));
            }
            Err(_) => out.push_str(&rest[start..start + end + 2]),
        }
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    (out, dice)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn yes_no_result_maps_edges() {
        assert_eq!(
            yes_no_result_for_roll("even", 50, 1)["label"],
            "Yes, and..."
        );
        assert_eq!(
            yes_no_result_for_roll("even", 50, 45)["label"],
            "Yes, but..."
        );
        assert_eq!(
            yes_no_result_for_roll("even", 50, 51)["label"],
            "No, but..."
        );
        assert_eq!(
            yes_no_result_for_roll("even", 50, 100)["label"],
            "No, and..."
        );
    }

    #[test]
    fn odds_thresholds_are_stable() {
        assert_eq!(yes_no_threshold("impossible").unwrap(), 5);
        assert_eq!(yes_no_threshold("unlikely").unwrap(), 25);
        assert_eq!(yes_no_threshold("even").unwrap(), 50);
        assert_eq!(yes_no_threshold("likely").unwrap(), 75);
        assert_eq!(yes_no_threshold("almost_certain").unwrap(), 95);
        assert!(yes_no_threshold("certain").is_err());
    }

    #[test]
    fn dice_expressions_resolve_inline() {
        let mut rng = ttrpg_dice_engine::SeededRng::new(7);
        let (text, dice) = resolve_dice_text("{2d6} goblins with {1d4} wolves", &mut rng);

        assert_eq!(dice.len(), 2);
        assert_eq!(dice[0]["expr"], "2d6");
        let goblins = dice[0]["total"].as_i64().unwrap();
        let wolves = dice[1]["total"].as_i64().unwrap();
        assert!((2..=12).contains(&goblins));
        assert!((1..=4).contains(&wolves));
        assert_eq!(text, format!("{goblins} goblins with {wolves} wolves"));
    }

    #[test]
    fn unparseable_braces_are_left_verbatim() {
        let mut rng = ttrpg_dice_engine::SeededRng::new(7);
        let (text, dice) = resolve_dice_text("a {mysterious} figure with {2d6} coins", &mut rng);

        assert!(text.starts_with("a {mysterious} figure with "));
        assert_eq!(dice.len(), 1);
        assert_eq!(dice[0]["expr"], "2d6");
    }

    #[test]
    fn unclosed_brace_passes_through() {
        let mut rng = ttrpg_dice_engine::SeededRng::new(7);
        let (text, dice) = resolve_dice_text("brace at the end {2d6", &mut rng);

        assert_eq!(text, "brace at the end {2d6");
        assert!(dice.is_empty());
    }
}
