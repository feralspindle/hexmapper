use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use rand::Rng;
use serde_json::json;

use crate::auth::AuthUser;
use crate::authz;
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
    if let Some(every) = patch.get("crawl_check_every") {
        let every = every.as_i64().unwrap_or(-1);
        if !(0..=100).contains(&every) {
            return Err(AppError::BadRequest(
                "crawl_check_every must be 0-100 (0 = off)".to_string(),
            ));
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

// --- crawling rounds -------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CrawlRequest {
    pub action: String,
}

/// shared crawling-round counter (#46). advance bumps the round, burns one
/// round off every rounds-mode light in the session, and every
/// crawl_check_every rounds rolls the encounter die (d6, encounter on a 1).
/// a hit rolls the session table tagged `crawl.encounter` when one exists and
/// posts the result to chat either way. any member can advance - that's the
/// point of a shared clock.
pub async fn crawl_round(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<CrawlRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();

    match req.action.as_str() {
        "reset" => {
            let row = retry_tx!(state.pool(), |tx| {
                projection::crawl_reset(&mut tx, id, &metadata).await
            })?;
            let row = row.ok_or(AppError::NotFound)?;
            Ok(Json(json!({ "session": row, "encounter": null })))
        }
        "advance" => {
            // the die roll lives outside the tx so a serialization retry
            // doesn't reroll it
            let die: i64 = rand::thread_rng().gen_range(1..=6);
            let result = retry_tx!(state.pool(), |tx| {
                let row = projection::crawl_advance(&mut tx, id, &metadata)
                    .await?
                    .ok_or(AppError::NotFound)?;

                // burn one round off every live rounds-mode light, recording a
                // light_source.updated event per light (set_revealed pattern)
                let newly_dead: Vec<(String,)> = sqlx::query_as(
                    r#"
                    with up as (
                        update light_sources set
                            rounds_elapsed = least(rounds_elapsed + 1, duration_rounds),
                            expired = (rounds_elapsed + 1) >= duration_rounds,
                            running = case when (rounds_elapsed + 1) >= duration_rounds then false else running end,
                            updated_at = now()
                        where session_id = $1 and mode = 'rounds' and expired = false
                        returning *
                    ),
                    evt as (
                        insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
                        select 'light_source', u.id, u.session_id,
                            coalesce((select max(sequence) from events e where e.aggregate_type = 'light_source' and e.aggregate_id = u.id), 0) + 1,
                            'light_source.updated', to_jsonb(u), $2
                        from up u
                    )
                    select name from up where expired
                    "#,
                )
                .bind(id)
                .bind(&metadata)
                .fetch_all(&mut *tx)
                .await?;

                for (name,) in &newly_dead {
                    let event = NewEvent {
                        aggregate_type: "chat_message",
                        aggregate_id: Uuid::new_v4(),
                        session_id: Some(id),
                        event_type: "chat_message.sent",
                        payload: json!({ "body": format!("\"{name}\" gutters out") }),
                        metadata: metadata.clone(),
                    };
                    chat::projection::append_and_project(&mut tx, &event).await?;
                }

                let round = row.get("crawl_round").and_then(Value::as_i64).unwrap_or(0);
                let every = row
                    .get("crawl_check_every")
                    .and_then(Value::as_i64)
                    .unwrap_or(0);

                let mut encounter: Value = Value::Null;
                if every > 0 && round % every == 0 {
                    if die == 1 {
                        encounter = crawl_encounter(&mut tx, id, &metadata).await?;
                        let text = encounter
                            .get("result")
                            .and_then(Value::as_str)
                            .unwrap_or("something finds you");
                        let event = NewEvent {
                            aggregate_type: "chat_message",
                            aggregate_id: Uuid::new_v4(),
                            session_id: Some(id),
                            event_type: "chat_message.sent",
                            payload: json!({
                                "body": format!("round {round}: encounter! {text}"),
                            }),
                            metadata: metadata.clone(),
                        };
                        chat::projection::append_and_project(&mut tx, &event).await?;
                    }
                    if encounter.is_null() {
                        encounter = json!({ "checked": true, "die": die, "hit": false });
                    } else if let Some(obj) = encounter.as_object_mut() {
                        obj.insert("checked".to_string(), json!(true));
                        obj.insert("die".to_string(), json!(die));
                        obj.insert("hit".to_string(), json!(true));
                    }
                }

                Ok(json!({ "session": row, "encounter": encounter }))
            })?;
            Ok(Json(result))
        }
        other => Err(AppError::BadRequest(format!(
            "unknown crawl action: {other}"
        ))),
    }
}

/// rolls the most recently updated session table tagged `crawl.encounter` and
/// records it in the oracle roll history. no tagged table -> a bare marker
/// object so the chat line still lands.
async fn crawl_encounter(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    session_id: Uuid,
    metadata: &Value,
) -> Result<Value, AppError> {
    let table: Option<(Uuid, String, String)> = sqlx::query_as(
        r#"
        select id, name, mode from oracle_tables
        where session_id = $1 and tag = 'crawl.encounter'
        order by updated_at desc
        limit 1
        "#,
    )
    .bind(session_id)
    .fetch_optional(&mut **tx)
    .await?;

    let Some((table_id, table_name, table_mode)) = table else {
        return Ok(json!({ "result": "no crawl.encounter table - roll your own" }));
    };

    let rows: Vec<(Uuid, i32, Option<i32>, Option<i32>, String, String)> = sqlx::query_as(
        r#"
        select id, weight, range_min, range_max, result, notes
        from oracle_table_rows
        where table_id = $1
        order by position asc, created_at asc
        "#,
    )
    .bind(table_id)
    .fetch_all(&mut **tx)
    .await?;

    let roll_rows: Vec<oracle::roll::RollRow> = rows
        .iter()
        .map(|(_, weight, range_min, range_max, _, _)| oracle::roll::RollRow {
            weight: *weight,
            range_min: *range_min,
            range_max: *range_max,
        })
        .collect();

    let picked = match oracle::roll::resolve(&table_mode, &roll_rows) {
        oracle::roll::TableRoll::Range { index, .. }
        | oracle::roll::TableRoll::Weighted { index, .. } => Some(index),
        _ => None,
    };
    let Some(index) = picked else {
        return Ok(json!({ "result": "encounter table is empty or degenerate" }));
    };
    let (row_id, _, _, _, result, notes) = &rows[index];

    let payload = json!({
        "table_mode": table_mode,
        "row_id": row_id,
        "result": result,
        "notes": notes,
    });
    let event = NewEvent {
        aggregate_type: "oracle_roll",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(session_id),
        event_type: "oracle.rolled",
        payload: json!({
            "kind": "table",
            "question": "crawling round encounter check",
            "table_id": table_id,
            "table_name": table_name,
            "result": payload,
        }),
        metadata: metadata.clone(),
    };
    oracle::projection::append_roll(&mut *tx, &event).await?;

    Ok(json!({ "result": result, "notes": notes, "table_name": table_name }))
}
