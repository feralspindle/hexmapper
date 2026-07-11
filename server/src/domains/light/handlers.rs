//! synced light source timers (#45). server holds the authoritative anchor
//! (elapsed_ms + started_at while running), clients interpolate locally, so
//! every tab shows the same clock without the server ticking anything.
//! rounds-mode sources ignore the wall clock and tick down via /tick when the
//! crawling round tracker advances.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::chat;
use crate::domains::light::projection;
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

const MAX_NAME_LEN: usize = 80;
// same ceiling the session torch uses, per source
const MAX_DURATION_MS: i64 = 12 * 3600 * 1000;
const MAX_DURATION_ROUNDS: i32 = 1000;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct LightSourceRow {
    pub id: Uuid,
    pub session_id: Uuid,
    pub created_by: Uuid,
    pub name: String,
    pub kind: String,
    pub mode: String,
    pub duration_ms: i64,
    pub elapsed_ms: i64,
    pub running: bool,
    pub started_at: Option<DateTime<Utc>>,
    pub duration_rounds: i32,
    pub rounds_elapsed: i32,
    pub expired: bool,
    pub attached_character_id: Option<Uuid>,
    pub attached_q: Option<i32>,
    pub attached_r: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SessionQuery {
    pub session_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct CreateLightRequest {
    pub session_id: Uuid,
    pub name: String,
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    pub duration_ms: Option<i64>,
    pub duration_rounds: Option<i32>,
    pub attached_character_id: Option<Uuid>,
    pub attached_q: Option<i32>,
    pub attached_r: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ControlRequest {
    pub action: String,
}

#[derive(Debug, Deserialize)]
pub struct TickRequest {
    #[serde(default = "default_tick")]
    pub rounds: i32,
}

fn default_kind() -> String {
    "torch".to_string()
}

fn default_mode() -> String {
    "real_time".to_string()
}

fn default_tick() -> i32 {
    1
}

pub async fn list_lights(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<SessionQuery>,
) -> Result<Json<Vec<LightSourceRow>>, AppError> {
    require_member(&state, auth.user_id, query.session_id).await?;
    let rows = sqlx::query_as(
        r#"
        select id, session_id, created_by, name, kind, mode, duration_ms, elapsed_ms, running, started_at, duration_rounds, rounds_elapsed, expired, attached_character_id, attached_q, attached_r, created_at, updated_at
        from light_sources
        where session_id = $1
        order by created_at asc
        "#,
    )
    .bind(query.session_id)
    .fetch_all(state.pool())
    .await?;

    Ok(Json(rows))
}

pub async fn create_light(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateLightRequest>,
) -> Result<Json<LightSourceRow>, AppError> {
    require_member(&state, auth.user_id, req.session_id).await?;
    let name = req.name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME_LEN {
        return Err(AppError::BadRequest(format!(
            "name must be 1-{MAX_NAME_LEN} characters"
        )));
    }
    if !matches!(req.kind.as_str(), "torch" | "lantern" | "light_spell" | "custom") {
        return Err(AppError::BadRequest("invalid light kind".to_string()));
    }
    if !matches!(req.mode.as_str(), "real_time" | "rounds") {
        return Err(AppError::BadRequest("invalid light mode".to_string()));
    }
    let duration_ms = req.duration_ms.unwrap_or(3_600_000);
    let duration_rounds = req.duration_rounds.unwrap_or(10);
    if !(1..=MAX_DURATION_MS).contains(&duration_ms)
        || !(1..=MAX_DURATION_ROUNDS).contains(&duration_rounds)
    {
        return Err(AppError::BadRequest("invalid light duration".to_string()));
    }

    let event = NewEvent {
        aggregate_type: "light_source",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(req.session_id),
        event_type: "light_source.created",
        payload: json!({
            "name": name,
            "kind": req.kind,
            "mode": req.mode,
            "duration_ms": duration_ms,
            "duration_rounds": duration_rounds,
            "attached_character_id": req.attached_character_id,
            "attached_q": req.attached_q,
            "attached_r": req.attached_r,
        }),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_created(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

/// start / pause / reset with the session-torch algebra: pause folds the live
/// span into elapsed_ms, start re-anchors started_at, reset zeroes everything
/// including rounds and the expired flag.
pub async fn control_light(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<ControlRequest>,
) -> Result<Json<LightSourceRow>, AppError> {
    let session_id = light_session(&state, id).await?.ok_or(AppError::NotFound)?;
    require_member(&state, auth.user_id, session_id).await?;
    if !matches!(req.action.as_str(), "start" | "pause" | "reset") {
        return Err(AppError::BadRequest("unknown light action".to_string()));
    }
    let metadata = auth.metadata();

    let row = retry_tx!(state.pool(), |tx| {
        let current = projection::fetch(&mut tx, id).await?.ok_or(AppError::NotFound)?;
        let now = Utc::now();
        let payload = match req.action.as_str() {
            "start" => json!({ "running": true, "started_at": now }),
            "pause" => {
                let live = live_elapsed(&current, now);
                json!({ "running": false, "elapsed_ms": live, "started_at": null })
            }
            _ => json!({
                "running": false,
                "elapsed_ms": 0,
                "started_at": null,
                "rounds_elapsed": 0,
                "expired": false,
            }),
        };
        let event = NewEvent {
            aggregate_type: "light_source",
            aggregate_id: id,
            session_id: Some(session_id),
            event_type: "light_source.updated",
            payload,
            metadata: metadata.clone(),
        };
        projection::append_updated(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

/// rounds-mode decrement, called by the round tracker (or the -1 button).
/// expiry inside the same tx when the source runs dry.
pub async fn tick_light(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<TickRequest>,
) -> Result<Json<LightSourceRow>, AppError> {
    let session_id = light_session(&state, id).await?.ok_or(AppError::NotFound)?;
    require_member(&state, auth.user_id, session_id).await?;
    if !(1..=100).contains(&req.rounds) {
        return Err(AppError::BadRequest("tick must be 1-100 rounds".to_string()));
    }
    let metadata = auth.metadata();

    let row = retry_tx!(state.pool(), |tx| {
        let current = projection::fetch(&mut tx, id).await?.ok_or(AppError::NotFound)?;
        if current.mode != "rounds" {
            return Err(AppError::BadRequest(
                "only rounds-mode lights tick".to_string(),
            ));
        }
        if current.expired {
            return Ok(current);
        }
        let rounds = (current.rounds_elapsed + req.rounds).min(current.duration_rounds);
        let expired = rounds >= current.duration_rounds;
        let event = NewEvent {
            aggregate_type: "light_source",
            aggregate_id: id,
            session_id: Some(session_id),
            event_type: "light_source.updated",
            payload: json!({ "rounds_elapsed": rounds, "expired": expired, "running": !expired && current.running }),
            metadata: metadata.clone(),
        };
        let row = projection::append_updated(&mut tx, &event).await?;
        if expired {
            announce_expiry(&mut tx, session_id, &row, &metadata).await?;
        }
        Ok(row)
    })?;

    Ok(Json(row))
}

/// a client that watches a real-time source hit zero reports it here. the
/// server re-derives expiry from its own anchors before believing it, and the
/// expired flag makes the announcement fire exactly once no matter how many
/// tabs report.
pub async fn expire_light(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<LightSourceRow>, AppError> {
    let session_id = light_session(&state, id).await?.ok_or(AppError::NotFound)?;
    require_member(&state, auth.user_id, session_id).await?;
    let metadata = auth.metadata();

    let row = retry_tx!(state.pool(), |tx| {
        let current = projection::fetch(&mut tx, id).await?.ok_or(AppError::NotFound)?;
        if current.expired {
            return Ok(current);
        }
        let now = Utc::now();
        let actually_expired = match current.mode.as_str() {
            "real_time" => live_elapsed(&current, now) >= current.duration_ms,
            _ => current.rounds_elapsed >= current.duration_rounds,
        };
        if !actually_expired {
            return Err(AppError::BadRequest(
                "light source has time left".to_string(),
            ));
        }
        let event = NewEvent {
            aggregate_type: "light_source",
            aggregate_id: id,
            session_id: Some(session_id),
            event_type: "light_source.updated",
            payload: json!({ "expired": true, "running": false, "elapsed_ms": current.duration_ms, "started_at": null }),
            metadata: metadata.clone(),
        };
        let row = projection::append_updated(&mut tx, &event).await?;
        announce_expiry(&mut tx, session_id, &row, &metadata).await?;
        Ok(row)
    })?;

    Ok(Json(row))
}

pub async fn delete_light(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let session_id = light_session(&state, id).await?.ok_or(AppError::NotFound)?;
    require_member(&state, auth.user_id, session_id).await?;

    let event = NewEvent {
        aggregate_type: "light_source",
        aggregate_id: id,
        session_id: Some(session_id),
        event_type: "light_source.deleted",
        payload: json!({}),
        metadata: auth.metadata(),
    };

    retry_tx!(state.pool(), |tx| {
        projection::append_deleted(&mut tx, &event).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// elapsed including the live span while running, clamped to the duration
fn live_elapsed(row: &LightSourceRow, now: DateTime<Utc>) -> i64 {
    let mut elapsed = row.elapsed_ms;
    if row.running {
        if let Some(started) = row.started_at {
            elapsed += (now - started).num_milliseconds().max(0);
        }
    }
    elapsed.min(row.duration_ms)
}

async fn announce_expiry(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    session_id: Uuid,
    row: &LightSourceRow,
    metadata: &serde_json::Value,
) -> Result<(), AppError> {
    let noun = match row.kind.as_str() {
        "lantern" => "lantern".to_string(),
        "light_spell" => "light spell".to_string(),
        "torch" => "torch".to_string(),
        _ => row.name.to_lowercase(),
    };
    let body = format!("{noun} \"{}\" gutters out", row.name);
    let event = NewEvent {
        aggregate_type: "chat_message",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(session_id),
        event_type: "chat_message.sent",
        payload: json!({ "body": body }),
        metadata: metadata.clone(),
    };
    chat::projection::append_and_project(tx, &event).await?;
    Ok(())
}

async fn light_session(state: &AppState, id: Uuid) -> Result<Option<Uuid>, AppError> {
    sqlx::query_scalar("select session_id from light_sources where id = $1")
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

#[cfg(test)]
mod tests {
    use super::*;

    fn row(mode: &str, running: bool, elapsed: i64, started_secs_ago: i64) -> LightSourceRow {
        LightSourceRow {
            id: Uuid::new_v4(),
            session_id: Uuid::new_v4(),
            created_by: Uuid::new_v4(),
            name: "Torch".into(),
            kind: "torch".into(),
            mode: mode.into(),
            duration_ms: 3_600_000,
            elapsed_ms: elapsed,
            running,
            started_at: running.then(|| Utc::now() - chrono::Duration::seconds(started_secs_ago)),
            duration_rounds: 10,
            rounds_elapsed: 0,
            expired: false,
            attached_character_id: None,
            attached_q: None,
            attached_r: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn live_elapsed_folds_the_running_span() {
        let r = row("real_time", true, 60_000, 30);
        let elapsed = live_elapsed(&r, Utc::now());
        assert!((89_000..=91_000).contains(&elapsed), "got {elapsed}");
    }

    #[test]
    fn live_elapsed_clamps_to_duration() {
        let r = row("real_time", true, 3_599_000, 7200);
        assert_eq!(live_elapsed(&r, Utc::now()), 3_600_000);
    }

    #[test]
    fn paused_source_does_not_accumulate() {
        let r = row("real_time", false, 120_000, 0);
        assert_eq!(live_elapsed(&r, Utc::now()), 120_000);
    }
}
