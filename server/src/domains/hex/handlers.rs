use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::hex::projection;
use crate::error::AppError;
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

fn player_visible_row(mut row: Value) -> Option<Value> {
    if row.get("revealed").and_then(Value::as_bool) != Some(true) {
        return None;
    }

    if let Some(object) = row.as_object_mut() {
        object.remove("gm_markers");
        object.remove("source_client");
    }
    Some(row)
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

    // Members can edit visible cells. Visibility and GM markers remain GM-only.
    let is_gm = authz::is_session_gm(state.pool(), auth.user_id, session_id).await?;
    let changes_gm_data = body.get("revealed").is_some() || body.get("gm_markers").is_some();
    let authorized = if changes_gm_data {
        is_gm
    } else if is_gm {
        true
    } else {
        authz::is_session_member(state.pool(), auth.user_id, session_id).await?
    };
    if !authorized {
        return Err(AppError::Forbidden);
    }
    ensure_map_in_session(&state, map_id, session_id).await?;
    if !is_gm && !projection::is_revealed(state.pool(), map_id, q, r).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let mut tx = state.pool().begin().await?;
    let mut row = projection::upsert(&mut tx, session_id, &body, &metadata).await?;
    tx.commit().await?;

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
    let mut tx = state.pool().begin().await?;
    projection::delete_one(&mut tx, req.map_id, req.q, req.r, &metadata).await?;
    tx.commit().await?;
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
    let mut tx = state.pool().begin().await?;
    projection::set_revealed(&mut tx, req.map_id, req.revealed, &metadata).await?;
    tx.commit().await?;
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
    let mut tx = state.pool().begin().await?;
    projection::clear_all(&mut tx, req.map_id, &metadata).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
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
}
