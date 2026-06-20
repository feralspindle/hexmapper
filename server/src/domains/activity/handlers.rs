use axum::extract::State;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::activity::projection;
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

const MAX_LEN: usize = 500;

#[derive(Debug, Deserialize)]
pub struct RecordActivityRequest {
    pub dungeon_id: Uuid,
    pub verb: String,
    #[serde(default)]
    pub what: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ActivityRow {
    pub id: Uuid,
    pub dungeon_id: Uuid,
    pub user_id: Option<Uuid>,
    pub display_name: String,
    pub verb: String,
    pub what: String,
    pub created_at: DateTime<Utc>,
}

pub async fn record_activity(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<RecordActivityRequest>,
) -> Result<Json<ActivityRow>, AppError> {
    let verb = req.verb.trim();
    if verb.is_empty() {
        return Err(AppError::BadRequest("activity verb cannot be empty".to_string()));
    }
    if verb.chars().count() > MAX_LEN || req.what.chars().count() > MAX_LEN {
        return Err(AppError::BadRequest(format!("activity fields cannot exceed {MAX_LEN} characters")));
    }

    let session_id = authz::dungeon_session_id(state.pool(), req.dungeon_id)
        .await?
        .ok_or(AppError::NotFound)?;

    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let display_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;

    let row_id = Uuid::new_v4();

    let event = NewEvent {
        aggregate_type: "dungeon_activity",
        aggregate_id: row_id,
        session_id: Some(session_id),
        event_type: "dungeon_activity.recorded",
        payload: json!({
            "dungeon_id": req.dungeon_id,
            "verb": verb,
            "what": req.what,
        }),
        metadata: auth.metadata_with(json!({ "display_name": display_name })),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_and_project(&mut tx, &event).await
    })?;

    Ok(Json(row))
}
