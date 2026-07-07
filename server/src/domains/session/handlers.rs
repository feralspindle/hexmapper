use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use rand::Rng;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

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

// --- initiative ------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct InitiativeRequest {
    pub op: String,
    pub name: Option<String>,
    pub kind: Option<String>,
    pub character_id: Option<Uuid>,
    pub entry_id: Option<Uuid>,
    pub initiative: Option<i32>,
    pub count: Option<i32>,
    pub rounds: Option<i32>,
}

const MAX_INITIATIVE_ENTRIES: usize = 60;

/// shared initiative tracker (#52). the whole order lives in one jsonb blob on
/// sessions ({entries, active_id, round}); every op reads it with a row lock,
/// mutates in rust, and writes back in the same tx, so two players adding
/// monsters at once can't clobber each other. member-gated - combat is shared.
pub async fn initiative(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<InitiativeRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, id).await? {
        return Err(AppError::Forbidden);
    }
    let metadata = auth.metadata();

    // d20s pre-rolled outside the tx so a serialization retry can't reroll
    let rolled: Vec<i32> = {
        let mut rng = rand::thread_rng();
        (0..req.count.unwrap_or(1).clamp(1, 20))
            .map(|_| rng.gen_range(1..=20))
            .collect()
    };

    let row = retry_tx!(state.pool(), |tx| {
        let current = projection::initiative_state_for_update(&mut tx, id)
            .await?
            .ok_or(AppError::NotFound)?;
        let (next, newly_dead) = apply_initiative_op(current, &req, &rolled)?;
        for name in &newly_dead {
            announce_death(&mut tx, id, name, &metadata).await?;
        }
        projection::set_initiative_state(&mut tx, id, &next, &metadata).await
    })?;

    let row = row.ok_or(AppError::NotFound)?;
    Ok(Json(row.get("initiative_state").cloned().unwrap_or(Value::Null)))
}

/// pure blob transition so the op logic is unit-testable without a db.
/// returns the next state plus the names of anyone whose death timer just
/// ran out, so the handler can announce them in the same tx.
fn apply_initiative_op(
    state: Value,
    req: &InitiativeRequest,
    rolled: &[i32],
) -> Result<(Value, Vec<String>), AppError> {
    let mut entries: Vec<Value> = state
        .get("entries")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut active_id = state.get("active_id").cloned().unwrap_or(Value::Null);
    let mut round = state.get("round").and_then(Value::as_i64).unwrap_or(1);
    let mut newly_dead: Vec<String> = Vec::new();

    match req.op.as_str() {
        "add" => {
            if entries.len() >= MAX_INITIATIVE_ENTRIES {
                return Err(AppError::BadRequest("initiative order is full".to_string()));
            }
            let name = clean_entry_name(req.name.as_deref())?;
            let kind = match req.kind.as_deref().unwrap_or("monster") {
                k @ ("pc" | "monster") => k,
                _ => return Err(AppError::BadRequest("invalid entry kind".to_string())),
            };
            entries.push(json!({
                "id": Uuid::new_v4(),
                "kind": kind,
                "name": name,
                "character_id": req.character_id,
                "initiative": req.initiative.unwrap_or(rolled[0]).clamp(-20, 50),
            }));
        }
        "add_group" => {
            let name = clean_entry_name(req.name.as_deref())?;
            let count = req.count.unwrap_or(1).clamp(1, 20) as usize;
            if entries.len() + count > MAX_INITIATIVE_ENTRIES {
                return Err(AppError::BadRequest("initiative order is full".to_string()));
            }
            for (i, roll) in rolled.iter().enumerate().take(count) {
                entries.push(json!({
                    "id": Uuid::new_v4(),
                    "kind": "monster",
                    "name": format!("{name} {}", i + 1),
                    "character_id": Value::Null,
                    "initiative": roll,
                }));
            }
        }
        "remove" => {
            let entry_id = req
                .entry_id
                .ok_or_else(|| AppError::BadRequest("entry_id is required".to_string()))?;
            let target = json!(entry_id);
            if active_id == target {
                active_id = Value::Null;
            }
            entries.retain(|e| e.get("id") != Some(&target));
        }
        "set" => {
            let entry_id = req
                .entry_id
                .ok_or_else(|| AppError::BadRequest("entry_id is required".to_string()))?;
            let initiative = req
                .initiative
                .ok_or_else(|| AppError::BadRequest("initiative is required".to_string()))?
                .clamp(-20, 50);
            let target = json!(entry_id);
            for entry in entries.iter_mut() {
                if entry.get("id") == Some(&target) {
                    entry["initiative"] = json!(initiative);
                }
            }
        }
        "advance" => {
            if entries.is_empty() {
                return Err(AppError::BadRequest("initiative order is empty".to_string()));
            }
            let order = sorted_ids(&entries);
            let next_idx = match order.iter().position(|eid| json!(eid) == active_id) {
                Some(idx) if idx + 1 < order.len() => idx + 1,
                Some(_) => {
                    round += 1;
                    // a new round: everyone who is down bleeds one round
                    newly_dead = tick_death_timers(&mut entries);
                    0
                }
                // nothing active yet: start of combat, top of the order
                None => 0,
            };
            active_id = json!(order[next_idx]);
        }
        "reset" => {
            round = 1;
            active_id = Value::Null;
        }
        "clear" => {
            entries.clear();
            round = 1;
            active_id = Value::Null;
        }
        "death_start" => {
            let entry_id = req
                .entry_id
                .ok_or_else(|| AppError::BadRequest("entry_id is required".to_string()))?;
            // shadowdark: d4 + con mod rounds, never less than 1. the client
            // rolls (it has the sheet) and sends the total
            let rounds = req
                .rounds
                .ok_or_else(|| AppError::BadRequest("rounds is required".to_string()))?
                .clamp(1, 20);
            let target = json!(entry_id);
            for entry in entries.iter_mut() {
                if entry.get("id") == Some(&target) {
                    entry["death"] = json!({ "total": rounds, "left": rounds, "dead": false });
                }
            }
        }
        "death_clear" => {
            let entry_id = req
                .entry_id
                .ok_or_else(|| AppError::BadRequest("entry_id is required".to_string()))?;
            let target = json!(entry_id);
            for entry in entries.iter_mut() {
                if entry.get("id") == Some(&target) {
                    if let Some(obj) = entry.as_object_mut() {
                        obj.remove("death");
                    }
                }
            }
        }
        other => {
            return Err(AppError::BadRequest(format!(
                "unknown initiative op: {other}"
            )))
        }
    }

    Ok((
        json!({ "entries": entries, "active_id": active_id, "round": round }),
        newly_dead,
    ))
}

/// one round passes for everyone with a running death timer. hits zero ->
/// marked dead, name returned for the chat announcement. already-dead entries
/// stay dead.
fn tick_death_timers(entries: &mut [Value]) -> Vec<String> {
    let mut newly_dead = Vec::new();
    for entry in entries.iter_mut() {
        let Some(death) = entry.get("death") else { continue };
        if death.get("dead").and_then(Value::as_bool) == Some(true) {
            continue;
        }
        let left = death.get("left").and_then(Value::as_i64).unwrap_or(0) - 1;
        if left <= 0 {
            entry["death"]["left"] = json!(0);
            entry["death"]["dead"] = json!(true);
            newly_dead.push(
                entry
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("someone")
                    .to_string(),
            );
        } else {
            entry["death"]["left"] = json!(left);
        }
    }
    newly_dead
}

async fn announce_death(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    session_id: Uuid,
    name: &str,
    metadata: &Value,
) -> Result<(), AppError> {
    let event = NewEvent {
        aggregate_type: "chat_message",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(session_id),
        event_type: "chat_message.sent",
        payload: json!({ "body": format!("{name}'s death timer runs out") }),
        metadata: metadata.clone(),
    };
    chat::projection::append_and_project(&mut *tx, &event).await?;
    Ok(())
}

/// initiative desc, name asc for ties - the display order and the turn order
fn sorted_ids(entries: &[Value]) -> Vec<String> {
    let mut sortable: Vec<(i64, String, String)> = entries
        .iter()
        .map(|e| {
            (
                e.get("initiative").and_then(Value::as_i64).unwrap_or(0),
                e.get("name").and_then(Value::as_str).unwrap_or("").to_string(),
                e.get("id").and_then(Value::as_str).unwrap_or("").to_string(),
            )
        })
        .collect();
    sortable.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    sortable.into_iter().map(|(_, _, id)| id).collect()
}

fn clean_entry_name(name: Option<&str>) -> Result<String, AppError> {
    let name = name.unwrap_or("").trim();
    if name.is_empty() || name.chars().count() > 60 {
        return Err(AppError::BadRequest(
            "entry name must be 1-60 characters".to_string(),
        ));
    }
    Ok(name.to_string())
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

                // a crawling round passes for anyone bleeding out too
                if let Some(init_state) =
                    projection::initiative_state_for_update(&mut tx, id).await?
                {
                    let mut entries: Vec<Value> = init_state
                        .get("entries")
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    let has_timers = entries.iter().any(|e| e.get("death").is_some());
                    if has_timers {
                        let newly_dead = tick_death_timers(&mut entries);
                        for name in &newly_dead {
                            announce_death(&mut tx, id, name, &metadata).await?;
                        }
                        let mut next = init_state.clone();
                        next["entries"] = json!(entries);
                        projection::set_initiative_state(&mut tx, id, &next, &metadata).await?;
                    }
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

#[cfg(test)]
mod initiative_tests {
    use super::*;

    fn req(op: &str) -> InitiativeRequest {
        InitiativeRequest {
            op: op.into(),
            name: None,
            kind: None,
            character_id: None,
            entry_id: None,
            initiative: None,
            count: None,
            rounds: None,
        }
    }

    fn empty_state() -> Value {
        json!({ "entries": [], "active_id": null, "round": 1 })
    }

    #[test]
    fn advance_walks_the_order_and_wraps_into_a_new_round() {
        let mut state = empty_state();
        for (name, init) in [("Ranna", 18), ("Goblin 1", 12), ("Brey", 5)] {
            let mut r = req("add");
            r.name = Some(name.into());
            r.initiative = Some(init);
            state = apply_initiative_op(state, &r, &[10]).unwrap().0;
        }

        state = apply_initiative_op(state, &req("advance"), &[]).unwrap().0;
        let order = sorted_ids(state["entries"].as_array().unwrap());
        assert_eq!(state["active_id"], json!(order[0]));
        assert_eq!(state["round"], 1);

        state = apply_initiative_op(state, &req("advance"), &[]).unwrap().0;
        state = apply_initiative_op(state, &req("advance"), &[]).unwrap().0;
        assert_eq!(state["active_id"], json!(order[2]));

        // wrap
        state = apply_initiative_op(state, &req("advance"), &[]).unwrap().0;
        assert_eq!(state["active_id"], json!(order[0]));
        assert_eq!(state["round"], 2);
    }

    #[test]
    fn add_group_numbers_the_monsters_and_uses_prerolled_dice() {
        let mut r = req("add_group");
        r.name = Some("Goblin".into());
        r.count = Some(3);
        let (state, _) = apply_initiative_op(empty_state(), &r, &[12, 7, 19]).unwrap();

        let entries = state["entries"].as_array().unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0]["name"], "Goblin 1");
        assert_eq!(entries[2]["name"], "Goblin 3");
        assert_eq!(entries[1]["initiative"], 7);
    }

    #[test]
    fn removing_the_active_entry_clears_the_pointer() {
        let mut r = req("add");
        r.name = Some("Ogre".into());
        r.initiative = Some(9);
        let mut state = apply_initiative_op(empty_state(), &r, &[10]).unwrap().0;
        state = apply_initiative_op(state, &req("advance"), &[]).unwrap().0;
        let entry_id = state["entries"][0]["id"].as_str().unwrap().to_string();

        let mut rm = req("remove");
        rm.entry_id = Some(entry_id.parse().unwrap());
        state = apply_initiative_op(state, &rm, &[]).unwrap().0;

        assert!(state["entries"].as_array().unwrap().is_empty());
        assert_eq!(state["active_id"], Value::Null);
    }

    #[test]
    fn ties_break_by_name_so_the_order_is_stable() {
        let mut state = empty_state();
        for name in ["Brey", "Adder", "Cole"] {
            let mut r = req("add");
            r.name = Some(name.into());
            r.initiative = Some(10);
            state = apply_initiative_op(state, &r, &[10]).unwrap().0;
        }
        let order = sorted_ids(state["entries"].as_array().unwrap());
        let names: Vec<&str> = order
            .iter()
            .map(|oid| {
                state["entries"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|e| e["id"].as_str() == Some(oid))
                    .unwrap()["name"]
                    .as_str()
                    .unwrap()
            })
            .collect();
        assert_eq!(names, vec!["Adder", "Brey", "Cole"]);
    }

    #[test]
    fn death_timer_ticks_on_round_wrap_and_announces_once() {
        // one entry so every advance wraps into a new round
        let mut r = req("add");
        r.name = Some("Ranna".into());
        r.initiative = Some(10);
        let mut state = apply_initiative_op(empty_state(), &r, &[10]).unwrap().0;
        let entry_id = state["entries"][0]["id"].as_str().unwrap().to_string();

        let mut d = req("death_start");
        d.entry_id = Some(entry_id.parse().unwrap());
        d.rounds = Some(2);
        state = apply_initiative_op(state, &d, &[]).unwrap().0;
        assert_eq!(state["entries"][0]["death"]["left"], 2);

        // first advance just starts the order, no wrap
        state = apply_initiative_op(state, &req("advance"), &[]).unwrap().0;
        assert_eq!(state["entries"][0]["death"]["left"], 2);

        // wrap 1: 2 -> 1, nobody dies
        let (next, dead) = apply_initiative_op(state, &req("advance"), &[]).unwrap();
        state = next;
        assert!(dead.is_empty());
        assert_eq!(state["entries"][0]["death"]["left"], 1);

        // wrap 2: 1 -> 0, dies exactly once
        let (next, dead) = apply_initiative_op(state, &req("advance"), &[]).unwrap();
        state = next;
        assert_eq!(dead, vec!["Ranna".to_string()]);
        assert_eq!(state["entries"][0]["death"]["dead"], true);

        // wrap 3: stays dead, no re-announcement
        let (next, dead) = apply_initiative_op(state, &req("advance"), &[]).unwrap();
        assert!(dead.is_empty());
        assert_eq!(next["entries"][0]["death"]["left"], 0);
    }

    #[test]
    fn death_clear_stabilizes() {
        let mut r = req("add");
        r.name = Some("Brey".into());
        r.initiative = Some(8);
        let mut state = apply_initiative_op(empty_state(), &r, &[10]).unwrap().0;
        let entry_id = state["entries"][0]["id"].as_str().unwrap().to_string();

        let mut d = req("death_start");
        d.entry_id = Some(entry_id.parse().unwrap());
        d.rounds = Some(3);
        state = apply_initiative_op(state, &d, &[]).unwrap().0;

        let mut c = req("death_clear");
        c.entry_id = Some(entry_id.parse().unwrap());
        state = apply_initiative_op(state, &c, &[]).unwrap().0;
        assert!(state["entries"][0].get("death").is_none());
    }
}
