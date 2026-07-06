use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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

#[derive(Debug, Deserialize)]
pub struct SessionQuery {
    pub session_id: Uuid,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct OracleTableRow {
    pub id: Uuid,
    pub session_id: Uuid,
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
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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
    pub session_id: Uuid,
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
}

#[derive(Debug, Deserialize)]
pub struct UpdateRowRequest {
    pub weight: Option<i32>,
    pub range_min: Option<i32>,
    pub range_max: Option<i32>,
    pub result: Option<String>,
    pub notes: Option<String>,
    pub position: Option<i32>,
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
    session_id: Uuid,
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
    Query(query): Query<SessionQuery>,
) -> Result<Json<Vec<OracleTableRow>>, AppError> {
    require_member(&state, auth.user_id, query.session_id).await?;
    let rows = sqlx::query_as(
        r#"
        select id, session_id, created_by, name, description, mode, tag, created_at, updated_at
        from oracle_tables
        where session_id = $1
        order by updated_at desc, created_at desc
        "#,
    )
    .bind(query.session_id)
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
    require_member(&state, auth.user_id, req.session_id).await?;
    let name = clean_text(&req.name, "table name", 1, MAX_NAME_LEN)?;
    let description = clean_text(&req.description, "description", 0, MAX_DESC_LEN)?;
    validate_mode(&req.mode)?;
    let tag = clean_tag(req.tag.as_deref())?;

    let event = NewEvent {
        aggregate_type: "oracle_table",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(req.session_id),
        event_type: "oracle_table.created",
        payload: json!({ "name": name, "description": description, "mode": req.mode, "tag": tag }),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_table_created(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn update_table(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateTableRequest>,
) -> Result<Json<OracleTableRow>, AppError> {
    let scope = table_scope(&state, id).await?.ok_or(AppError::NotFound)?;
    require_member(&state, auth.user_id, scope.session_id).await?;

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
        session_id: Some(scope.session_id),
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
    require_member(&state, auth.user_id, scope.session_id).await?;

    let event = NewEvent {
        aggregate_type: "oracle_table",
        aggregate_id: id,
        session_id: Some(scope.session_id),
        event_type: "oracle_table.deleted",
        payload: json!({}),
        metadata: auth.metadata(),
    };

    retry_tx!(state.pool(), |tx| {
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
    require_member(&state, auth.user_id, scope.session_id).await?;
    validate_row_shape(req.weight, req.range_min, req.range_max)?;
    let result = clean_text(&req.result, "result", 1, MAX_RESULT_LEN)?;
    let notes = clean_text(&req.notes, "notes", 0, MAX_NOTES_LEN)?;

    let event = NewEvent {
        aggregate_type: "oracle_table_row",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(scope.session_id),
        event_type: "oracle_table_row.created",
        payload: json!({
            "table_id": table_id,
            "weight": req.weight,
            "range_min": req.range_min,
            "range_max": req.range_max,
            "result": result,
            "notes": notes,
            "position": req.position,
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
    let (session_id, current) = row_scope(&state, id).await?.ok_or(AppError::NotFound)?;
    require_member(&state, auth.user_id, session_id).await?;

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
    if payload.is_empty() {
        return Err(AppError::BadRequest("empty row update".to_string()));
    }

    let event = NewEvent {
        aggregate_type: "oracle_table_row",
        aggregate_id: id,
        session_id: Some(session_id),
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
    let (session_id, _) = row_scope(&state, id).await?.ok_or(AppError::NotFound)?;
    require_member(&state, auth.user_id, session_id).await?;

    let event = NewEvent {
        aggregate_type: "oracle_table_row",
        aggregate_id: id,
        session_id: Some(session_id),
        event_type: "oracle_table_row.deleted",
        payload: json!({}),
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
        "event_prompt" => (None, None, event_prompt_result()),
        "table" => {
            let table_id = req
                .table_id
                .ok_or_else(|| AppError::BadRequest("table_id is required".to_string()))?;
            let scope = table_scope(&state, table_id)
                .await?
                .ok_or(AppError::NotFound)?;
            if scope.session_id != req.session_id {
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

async fn table_scope(state: &AppState, table_id: Uuid) -> Result<Option<TableScope>, AppError> {
    sqlx::query_as("select session_id, name, mode from oracle_tables where id = $1")
        .bind(table_id)
        .fetch_optional(state.pool())
        .await
        .map_err(Into::into)
}

async fn row_scope(
    state: &AppState,
    row_id: Uuid,
) -> Result<Option<(Uuid, OracleTableRowRow)>, AppError> {
    let row: Option<(Uuid, Uuid, Uuid, i32, Option<i32>, Option<i32>, String, String, i32, DateTime<Utc>, DateTime<Utc>)> = sqlx::query_as(
        r#"
        select ot.session_id, r.id, r.table_id, r.weight, r.range_min, r.range_max, r.result, r.notes, r.position, r.created_at, r.updated_at
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
            session_id,
            id,
            table_id,
            weight,
            range_min,
            range_max,
            result,
            notes,
            position,
            created_at,
            updated_at,
        )| {
            (
                session_id,
                OracleTableRowRow {
                    id,
                    table_id,
                    weight,
                    range_min,
                    range_max,
                    result,
                    notes,
                    position,
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

fn event_prompt_result() -> Value {
    json!({
        "action": pick(&["Reveal", "Threaten", "Divide", "Delay", "Escalate", "Transform", "Bargain", "Pursue", "Conceal", "Return"]),
        "theme": pick(&["Debt", "Hunger", "Memory", "Oath", "Ruin", "Shelter", "Pride", "Mercy", "Power", "Loss"]),
        "subject": pick(&["a rival", "an ally", "the environment", "a hidden faction", "a resource", "a relic", "a rumor", "the weather", "a monster", "a settlement"]),
        "location": pick(&["nearby", "behind the party", "at a threshold", "underground", "across water", "in plain sight", "in a safe place", "on the road", "inside a ruin", "at camp"]),
        "complication": pick(&["time runs short", "someone wants payment", "evidence is misleading", "help has a cost", "noise draws attention", "the route changes", "trust is tested", "supplies are strained", "a promise resurfaces", "the danger is closer than expected"]),
    })
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

async fn table_result(
    state: &AppState,
    table_id: Uuid,
    scope: &TableScope,
) -> Result<Value, AppError> {
    let rows: Vec<OracleTableRowRow> = sqlx::query_as(
        r#"
        select id, table_id, weight, range_min, range_max, result, notes, position, created_at, updated_at
        from oracle_table_rows
        where table_id = $1
        order by position asc, created_at asc
        "#,
    )
    .bind(table_id)
    .fetch_all(state.pool())
    .await?;

    if rows.is_empty() {
        return Err(AppError::BadRequest("table has no rows".to_string()));
    }

    let roll_rows: Vec<roll::RollRow> = rows
        .iter()
        .map(|row| roll::RollRow {
            weight: row.weight,
            range_min: row.range_min,
            range_max: row.range_max,
        })
        .collect();

    match roll::resolve(&scope.mode, &roll_rows) {
        roll::TableRoll::Range { roll, index } => {
            let row = &rows[index];
            return Ok(json!({
                "table_mode": "range",
                "roll": roll,
                "row_id": row.id,
                "result": row.result,
                "notes": row.notes,
            }));
        }
        roll::TableRoll::RangeGap { .. } => {
            return Err(AppError::BadRequest(
                "range table has a gap for the rolled value".to_string(),
            ));
        }
        roll::TableRoll::Weighted { total_weight, index } => {
            let row = &rows[index];
            return Ok(json!({
                "table_mode": "weighted",
                "total_weight": total_weight,
                "row_id": row.id,
                "result": row.result,
                "notes": row.notes,
            }));
        }
        roll::TableRoll::NoPositiveWeight => {}
    }

    Err(AppError::BadRequest(
        "could not choose a table row".to_string(),
    ))
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
}
