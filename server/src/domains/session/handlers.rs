use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use rand::Rng;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::calendar;
use crate::domains::chat;
use crate::domains::oracle;
use crate::domains::session::member_projection;
use crate::domains::session::projection;
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub name: Option<String>,
    pub play_mode: Option<String>,
}

pub async fn create_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateSessionRequest>,
) -> Result<Json<Value>, AppError> {
    let name = req.name.as_deref().unwrap_or("Untitled Campaign");
    let play_mode = req.play_mode.as_deref().unwrap_or("gm");
    if !matches!(play_mode, "gm" | "gm_less") {
        return Err(AppError::BadRequest("invalid play mode".to_string()));
    }
    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::create(
            &mut tx,
            Uuid::new_v4(),
            auth.user_id,
            name,
            play_mode,
            &metadata,
        )
        .await
    })?;
    Ok(Json(row))
}

pub async fn update_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<Json<Value>, AppError> {
    // sessions_update RLS: owner only.
    if !authz::is_session_gm(state.pool(), auth.user_id, id).await? {
        return Err(AppError::Forbidden);
    }
    if let Some(play_mode) = patch.get("play_mode").and_then(|v| v.as_str()) {
        if !matches!(play_mode, "gm" | "gm_less") {
            return Err(AppError::BadRequest("invalid play mode".to_string()));
        }
    }
    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::update(&mut tx, id, &patch, &metadata).await
    })?;
    row.map(Json).ok_or(AppError::NotFound)
}

pub async fn delete_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        projection::delete(&mut tx, id, &metadata).await
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
    // torch RPCs are session-member scoped (owner or member).
    if !authz::is_session_member(state.pool(), auth.user_id, id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        match req.action.as_str() {
            "start" => projection::torch_start(&mut tx, id, &metadata).await?,
            "pause" => projection::torch_pause(&mut tx, id, &metadata).await?,
            "reset" => projection::torch_reset(&mut tx, id, &metadata).await?,
            other => {
                return Err(AppError::BadRequest(format!(
                    "unknown torch action: {other}"
                )))
            }
        }
        Ok(())
    })?;
    Ok(StatusCode::NO_CONTENT)
}

// --- session_members -------------------------------------------------------

/// Join a session by id (replaces the `join_session` RPC). Any authenticated user
/// may add *themselves* (RLS insert check is user_id = auth.uid(), enforced by
/// using auth.user_id). Returns the session row for the client to apply.
pub async fn join_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let metadata = auth.metadata();
    let session = retry_tx!(state.pool(), |tx| {
        let session: Option<Value> =
            sqlx::query_scalar("select to_jsonb(s) from sessions s where id = $1")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?;
        let session = session.ok_or(AppError::NotFound)?;
        member_projection::join(&mut tx, id, auth.user_id, &metadata).await?;
        Ok(session)
    })?;
    Ok(Json(session))
}

/// removes the caller's own membership (user_id = auth.user_id), so there's no
/// ownership check - a member can only remove themselves. the campaign is left
/// intact, owners delete via `delete_session` instead.
pub async fn leave_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        member_projection::leave(&mut tx, id, auth.user_id, &metadata).await
    })?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct SetActiveRequest {
    pub session_id: Uuid,
    pub active_character_id: Option<Uuid>,
}

/// Set the caller's active character for a session (replaces the session_members
/// upsert). The member only ever writes their own row, so user_id = auth.user_id.
pub async fn set_active_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<SetActiveRequest>,
) -> Result<StatusCode, AppError> {
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        member_projection::set_active(
            &mut tx,
            req.session_id,
            auth.user_id,
            req.active_character_id,
            &metadata,
        )
        .await
    })?;
    Ok(StatusCode::NO_CONTENT)
}

// --- overland travel -------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct TravelRequest {
    pub op: String,
    pub terrain: Option<String>,
    pub patch: Option<Value>,
}

/// overland travel procedure (#51). a move burns 1/rate of a travel day for
/// the destination terrain; crossing a day boundary advances the party
/// calendar, rolls the weather table onto the new day, and announces it.
/// entering difficult terrain rolls a d6 navigation check - lost on a 1.
/// everything lands in chat so the whole table sees the same trip.
pub async fn travel(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<TravelRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();

    match req.op.as_str() {
        "config" => {
            let patch = req
                .patch
                .as_ref()
                .and_then(Value::as_object)
                .ok_or_else(|| AppError::BadRequest("patch is required".to_string()))?
                .clone();
            let row = retry_tx!(state.pool(), |tx| {
                let mut travel = projection::travel_state_for_update(&mut tx, id)
                    .await?
                    .ok_or(AppError::NotFound)?;
                let obj = travel.as_object_mut().expect("travel state is an object");
                for (key, value) in &patch {
                    match key.as_str() {
                        "enabled" if value.is_boolean() => {
                            obj.insert(key.clone(), value.clone());
                        }
                        "rates" if value.is_object() => {
                            let ok = value.as_object().unwrap().values().all(|v| {
                                v.as_f64().map(|n| (0.25..=12.0).contains(&n)).unwrap_or(false)
                            });
                            if !ok {
                                return Err(AppError::BadRequest(
                                    "rates must be 0.25-12 hexes per day".to_string(),
                                ));
                            }
                            obj.insert(key.clone(), value.clone());
                        }
                        "difficult" if value.is_array() => {
                            obj.insert(key.clone(), value.clone());
                        }
                        _ => {
                            return Err(AppError::BadRequest(format!(
                                "unknown travel config key: {key}"
                            )))
                        }
                    }
                }
                projection::set_travel_state(&mut tx, id, &travel, &metadata).await
            })?;
            let row = row.ok_or(AppError::NotFound)?;
            Ok(Json(json!({
                "travel_state": row.get("travel_state").cloned().unwrap_or(Value::Null),
            })))
        }
        "move" => {
            let terrain = req
                .terrain
                .as_deref()
                .unwrap_or("plains")
                .to_string();
            // navigation die pre-rolled so a tx retry can't reroll it
            let nav_die: i64 = rand::thread_rng().gen_range(1..=6);

            let result = retry_tx!(state.pool(), |tx| {
                let mut travel = projection::travel_state_for_update(&mut tx, id)
                    .await?
                    .ok_or(AppError::NotFound)?;
                if travel.get("enabled").and_then(Value::as_bool) != Some(true) {
                    return Ok(json!({ "travel_state": travel, "moved": false }));
                }

                let rate = travel
                    .get("rates")
                    .and_then(|r| r.get(&terrain))
                    .and_then(Value::as_f64)
                    .unwrap_or(2.0)
                    .clamp(0.25, 12.0);
                let mut fraction =
                    travel.get("fraction").and_then(Value::as_f64).unwrap_or(0.0) + 1.0 / rate;

                let lost = travel
                    .get("difficult")
                    .and_then(Value::as_array)
                    .map(|list| list.iter().any(|t| t.as_str() == Some(terrain.as_str())))
                    .unwrap_or(false)
                    && nav_die == 1;
                if lost {
                    let event = NewEvent {
                        aggregate_type: "chat_message",
                        aggregate_id: Uuid::new_v4(),
                        session_id: Some(id),
                        event_type: "chat_message.sent",
                        payload: json!({
                            "body": format!("the party loses its way in the {terrain} - regain the trail before pressing on"),
                        }),
                        metadata: metadata.clone(),
                    };
                    chat::projection::append_and_project(&mut tx, &event).await?;
                }

                let mut days_advanced = 0i64;
                let mut weather: Value = Value::Null;
                while fraction >= 1.0 {
                    fraction -= 1.0;
                    days_advanced += 1;
                    weather = advance_calendar_day(&mut tx, id, &metadata).await?;
                }

                let obj = travel.as_object_mut().expect("travel state is an object");
                obj.insert("fraction".to_string(), json!((fraction * 100.0).round() / 100.0));
                let row = projection::set_travel_state(&mut tx, id, &travel, &metadata)
                    .await?
                    .ok_or(AppError::NotFound)?;

                Ok(json!({
                    "travel_state": row.get("travel_state").cloned().unwrap_or(Value::Null),
                    "moved": true,
                    "lost": lost,
                    "nav_die": if lost { json!(nav_die) } else { Value::Null },
                    "days_advanced": days_advanced,
                    "weather": weather,
                }))
            })?;
            Ok(Json(result))
        }
        other => Err(AppError::BadRequest(format!("unknown travel op: {other}"))),
    }
}

/// one in-game day passes on the road: bump the party calendar (month/year
/// wrap from the configured month lengths), roll the session table tagged
/// `weather` onto the fresh day, and tell the table. no calendar configured ->
/// the day still passes, silently.
async fn advance_calendar_day(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    session_id: Uuid,
    metadata: &Value,
) -> Result<Value, AppError> {
    let settings: Option<Value> = sqlx::query_scalar(
        "select to_jsonb(s) from party_calendar_settings s where session_id = $1 for update",
    )
    .bind(session_id)
    .fetch_optional(&mut **tx)
    .await?;
    let Some(mut settings) = settings else {
        return Ok(Value::Null);
    };

    let months = settings
        .get("days_per_month")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let month_count = months.len().max(1) as i64;
    let mut year = settings.get("current_year").and_then(Value::as_i64).unwrap_or(1);
    let mut month = settings.get("current_month").and_then(Value::as_i64).unwrap_or(1);
    let mut day = settings.get("current_day").and_then(Value::as_i64).unwrap_or(1) + 1;
    let days_in_month = months
        .get((month - 1).max(0) as usize)
        .and_then(Value::as_i64)
        .unwrap_or(30);
    if day > days_in_month {
        day = 1;
        month += 1;
        if month > month_count {
            month = 1;
            year += 1;
        }
    }

    let obj = settings.as_object_mut().expect("settings row is an object");
    obj.insert("current_year".to_string(), json!(year));
    obj.insert("current_month".to_string(), json!(month));
    obj.insert("current_day".to_string(), json!(day));
    obj.remove("id");
    obj.remove("created_at");
    obj.remove("updated_at");
    calendar::projection::update_settings(&mut *tx, session_id, &settings, metadata).await?;

    // weather for the new day from the tagged table, if the session has one
    let weather = roll_tagged(&mut *tx, session_id, "weather").await?;
    if let Some(text) = weather.as_str() {
        calendar::projection::upsert_day(
            &mut *tx,
            session_id,
            year as i32,
            month as i32,
            day as i32,
            &json!({ "weather": text }),
            metadata,
        )
        .await?;
        let event = NewEvent {
            aggregate_type: "chat_message",
            aggregate_id: Uuid::new_v4(),
            session_id: Some(session_id),
            event_type: "chat_message.sent",
            payload: json!({ "body": format!("day {year}-{month}-{day} on the road: {text}") }),
            metadata: metadata.clone(),
        };
        chat::projection::append_and_project(&mut *tx, &event).await?;
    }

    Ok(json!({ "year": year, "month": month, "day": day, "weather": weather }))
}

/// rolls the most recent session table with the given tag, returning the row
/// text or null when no table exists
async fn roll_tagged(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    session_id: Uuid,
    tag: &str,
) -> Result<Value, AppError> {
    let table: Option<(Uuid, String)> = sqlx::query_as(
        "select id, mode from oracle_tables where session_id = $1 and tag = $2 order by updated_at desc limit 1",
    )
    .bind(session_id)
    .bind(tag)
    .fetch_optional(&mut **tx)
    .await?;
    let Some((table_id, mode)) = table else {
        return Ok(Value::Null);
    };

    let rows: Vec<(i32, Option<i32>, Option<i32>, String)> = sqlx::query_as(
        "select weight, range_min, range_max, result from oracle_table_rows where table_id = $1 order by position asc, created_at asc",
    )
    .bind(table_id)
    .fetch_all(&mut **tx)
    .await?;

    let roll_rows: Vec<oracle::roll::RollRow> = rows
        .iter()
        .map(|(weight, range_min, range_max, _)| oracle::roll::RollRow {
            weight: *weight,
            range_min: *range_min,
            range_max: *range_max,
        })
        .collect();

    match oracle::roll::resolve(&mode, &roll_rows) {
        oracle::roll::TableRoll::Range { index, .. }
        | oracle::roll::TableRoll::Weighted { index, .. } => Ok(json!(rows[index].3)),
        _ => Ok(Value::Null),
    }
}
