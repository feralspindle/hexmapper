use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::hex::visibility::{visible_hex_row, VisibleHexRow};
use crate::domains::hex::{generate, projection};
use crate::error::AppError;
use crate::retry_tx;
use crate::state::AppState;

fn uuid_body_field(body: &Value, field: &str) -> Result<Uuid, AppError> {
    body.get(field)
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::BadRequest(format!("{field} required")))
}

fn i32_body_field(body: &Value, field: &str) -> Result<i32, AppError> {
    body.get(field)
        .and_then(|v| v.as_i64())
        .and_then(|n| i32::try_from(n).ok())
        .ok_or_else(|| AppError::BadRequest(format!("{field} required")))
}

fn player_visible_row(row: Value) -> Option<Value> {
    match visible_hex_row(row, false) {
        VisibleHexRow::Full(row) => Some(row),
        VisibleHexRow::Sentinel(_) => None,
    }
}

async fn ensure_map_in_session(
    state: &AppState,
    map_id: Uuid,
    session_id: Uuid,
) -> Result<(), AppError> {
    let map_session_id = authz::row_session_id(state.pool(), authz::SessionTable::Maps, map_id)
        .await?
        .ok_or(AppError::NotFound)?;

    if map_session_id != session_id {
        return Err(AppError::Forbidden);
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ListHexRequest {
    pub session_id: Uuid,
    pub map_id: Option<Uuid>,
}

pub async fn list_hexes(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(req): Query<ListHexRequest>,
) -> Result<Json<Value>, AppError> {
    let is_gm = authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await?;
    if !is_gm && !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    if let Some(map_id) = req.map_id {
        ensure_map_in_session(&state, map_id, req.session_id).await?;
    }

    let rows = projection::list(state.pool(), req.session_id, req.map_id, is_gm).await?;
    Ok(Json(rows))
}

/// Body carries the cell fields, including `session_id`, `map_id`, `q`, `r`.
pub async fn upsert_hex(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let session_id = uuid_body_field(&body, "session_id")?;
    let map_id = uuid_body_field(&body, "map_id")?;
    let q = i32_body_field(&body, "q")?;
    let r = i32_body_field(&body, "r")?;

    // Members can edit visible cells. Hiding cells and GM markers remain GM-only;
    // `revealed: true` is allowed for member edits only when the cell/map is
    // already visible to them, which covers blank/reveal-all maps without
    // granting reveal permission for hidden FOW cells.
    let is_gm = authz::is_session_gm(state.pool(), auth.user_id, session_id).await?;
    ensure_map_in_session(&state, map_id, session_id).await?;
    if !is_gm {
        if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
            return Err(AppError::Forbidden);
        }
        if body.get("gm_markers").is_some()
            || body.get("explored").and_then(Value::as_bool) == Some(false)
            || body.get("revealed").and_then(Value::as_bool) == Some(false)
            || !projection::is_revealed(state.pool(), map_id, q, r).await?
        {
            return Err(AppError::Forbidden);
        }
    }

    let metadata = auth.metadata();
    let mut row = retry_tx!(state.pool(), |tx| {
        projection::upsert(&mut tx, session_id, &body, &metadata).await
    })?;

    if !is_gm {
        row = player_visible_row(row).ok_or(AppError::Forbidden)?;
    }

    Ok(Json(row))
}

#[derive(Debug, Deserialize)]
pub struct DeleteHexRequest {
    pub session_id: Uuid,
    pub map_id: Uuid,
    pub q: i32,
    pub r: i32,
}

pub async fn delete_hex(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<DeleteHexRequest>,
) -> Result<StatusCode, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    ensure_map_in_session(&state, req.map_id, req.session_id).await?;
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        projection::delete_one(&mut tx, req.map_id, req.q, req.r, &metadata).await
    })?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct BulkRevealRequest {
    pub session_id: Uuid,
    pub map_id: Uuid,
    pub revealed: bool,
}

pub async fn bulk_reveal(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<BulkRevealRequest>,
) -> Result<StatusCode, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    ensure_map_in_session(&state, req.map_id, req.session_id).await?;
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        projection::set_revealed(&mut tx, req.map_id, req.revealed, &metadata).await
    })?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct ClearHexRequest {
    pub session_id: Uuid,
    pub map_id: Uuid,
}

pub async fn clear_hex(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<ClearHexRequest>,
) -> Result<StatusCode, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    ensure_map_in_session(&state, req.map_id, req.session_id).await?;
    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        projection::clear_all(&mut tx, req.map_id, &metadata).await
    })?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct ExploreHexRequest {
    pub session_id: Uuid,
    pub map_id: Uuid,
    pub q: i32,
    pub r: i32,
}

/// Party entry into a hex. On exploration-mode maps (or cells explicitly
/// marked unexplored) this generates the cell's contents exactly once —
/// the advisory lock plus the explored re-check inside the transaction is
/// the canonical generation guard for co-op: concurrent entries serialize
/// and the losers see the already-generated row.
///
/// Generation is a solo/co-op feature: in GM-led sessions the GM authors the
/// map and this endpoint no-ops, even if the map's exploration flag was left
/// on from an earlier play-mode switch.
///
/// Contents are rolled before the lock/transaction from an optimistic read,
/// so concurrent explorers of the same hex only serialize on the re-check +
/// upsert and a sequence-conflict retry does not re-roll; a losing pre-roll
/// is simply discarded.
pub async fn explore_hex(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<ExploreHexRequest>,
) -> Result<Json<Value>, AppError> {
    let scope: Option<(Uuid, bool, String, bool, bool)> = sqlx::query_as(
        r#"
        select m.session_id,
               m.exploration_mode,
               s.play_mode,
               s.owner_id = $2,
               exists (
                   select 1 from session_members sm
                   where sm.session_id = s.id and sm.user_id = $2
               )
        from maps m
        join sessions s on s.id = m.session_id
        where m.id = $1
        "#,
    )
    .bind(req.map_id)
    .bind(auth.user_id)
    .fetch_optional(state.pool())
    .await?;

    let Some((map_session_id, exploration_mode, play_mode, is_gm, is_listed_member)) = scope
    else {
        return Err(AppError::NotFound);
    };
    if map_session_id != req.session_id {
        return Err(AppError::Forbidden);
    }
    if !is_gm && !is_listed_member {
        return Err(AppError::Forbidden);
    }
    if play_mode != "gm_less" {
        return Ok(Json(
            serde_json::json!({ "generated": false, "cell": Value::Null }),
        ));
    }

    let pre_read: Option<Value> = fetch_cell(state.pool(), &req).await?;
    let needs_generation = match &pre_read {
        Some(row) => row.get("explored").and_then(Value::as_bool) == Some(false),
        None => exploration_mode,
    };
    let pre_rolled = if needs_generation {
        let terrain = existing_field(pre_read.as_ref(), "terrain_type");
        Some(generate::generate_contents(state.pool(), req.session_id, terrain.as_deref()).await?)
    } else {
        None
    };

    let metadata = auth.metadata();
    let (generated, row) = retry_tx!(state.pool(), |tx| {
        explore_in_tx(
            &mut tx,
            &state,
            &req,
            exploration_mode,
            pre_rolled.as_ref(),
            &metadata,
        )
        .await
    })?;

    let cell = match row {
        Some(row) if is_gm => Some(row),
        Some(row) => player_visible_row(row),
        None => None,
    };

    Ok(Json(serde_json::json!({ "generated": generated, "cell": cell })))
}

async fn fetch_cell<'e, E>(executor: E, req: &ExploreHexRequest) -> Result<Option<Value>, AppError>
where
    E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
    sqlx::query_scalar("select to_jsonb(h) from hex_cells h where map_id = $1 and q = $2 and r = $3")
        .bind(req.map_id)
        .bind(req.q)
        .bind(req.r)
        .fetch_optional(executor)
        .await
        .map_err(Into::into)
}

fn existing_field(row: Option<&Value>, field: &str) -> Option<String> {
    row.and_then(|row| row.get(field))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

async fn explore_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    state: &AppState,
    req: &ExploreHexRequest,
    exploration_mode: bool,
    pre_rolled: Option<&generate::GeneratedHex>,
    metadata: &Value,
) -> Result<(bool, Option<Value>), AppError> {
    sqlx::query("select pg_advisory_xact_lock(hashtextextended($1 || ':' || $2 || ':' || $3, 0))")
        .bind(req.map_id.to_string())
        .bind(req.q)
        .bind(req.r)
        .execute(&mut **tx)
        .await?;

    let existing = fetch_cell(&mut **tx, req).await?;

    let explored = existing
        .as_ref()
        .map(|row| row.get("explored").and_then(Value::as_bool) != Some(false))
        .unwrap_or(false);

    if let Some(row) = &existing {
        if explored {
            let revealed = row.get("revealed").and_then(Value::as_bool) == Some(true);
            if revealed {
                return Ok((false, Some(row.clone())));
            }
            if !exploration_mode {
                return Ok((false, None));
            }
            let body = serde_json::json!({
                "map_id": req.map_id,
                "q": req.q,
                "r": req.r,
                "revealed": true,
            });
            let updated = projection::upsert(tx, req.session_id, &body, metadata).await?;
            return Ok((false, Some(updated)));
        }
    } else if !exploration_mode {
        return Ok((false, None));
    }

    let existing_terrain = existing_field(existing.as_ref(), "terrain_type");
    let existing_label = existing_field(existing.as_ref(), "label");
    let existing_notes = existing_field(existing.as_ref(), "notes");

    // The pre-roll is reused across retries; the in-tx fallback only fires
    // when the optimistic read raced (cell became unexplored after it).
    let rolled;
    let contents = match pre_rolled {
        Some(contents) => contents,
        None => {
            rolled = generate::generate_contents(
                state.pool(),
                req.session_id,
                existing_terrain.as_deref(),
            )
            .await?;
            &rolled
        }
    };

    let mut body = serde_json::Map::new();
    body.insert("map_id".into(), serde_json::json!(req.map_id));
    body.insert("q".into(), serde_json::json!(req.q));
    body.insert("r".into(), serde_json::json!(req.r));
    body.insert("explored".into(), serde_json::json!(true));
    body.insert("revealed".into(), serde_json::json!(true));
    let terrain = existing_terrain
        .clone()
        .unwrap_or_else(|| contents.terrain_type.clone());
    body.insert("terrain_type".into(), serde_json::json!(terrain));
    if existing_label.is_none() {
        if let Some(label) = &contents.label {
            body.insert("label".into(), serde_json::json!(label));
        }
    }
    if existing_notes.is_none() {
        if let Some(notes) = &contents.notes {
            body.insert("notes".into(), serde_json::json!(notes));
        }
    }

    let row = projection::upsert(tx, req.session_id, &Value::Object(body), metadata).await?;
    Ok((true, Some(row)))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::player_visible_row;

    #[test]
    fn player_visible_row_removes_gm_fields() {
        let row = json!({
            "id": "cell-id",
            "revealed": true,
            "label": "Village",
            "gm_markers": "[{\"kind\":\"trap\"}]",
            "source_client": "client-id"
        });

        let safe = player_visible_row(row).expect("revealed row should be visible");
        assert_eq!(safe["label"], "Village");
        assert!(safe.get("gm_markers").is_none());
        assert!(safe.get("source_client").is_none());
    }

    #[test]
    fn player_visible_row_rejects_hidden_rows() {
        assert!(player_visible_row(json!({ "revealed": false })).is_none());
    }

    #[test]
    fn player_visible_row_rejects_unexplored_rows() {
        assert!(player_visible_row(json!({ "revealed": true, "explored": false })).is_none());
    }
}
