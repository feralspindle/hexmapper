use std::collections::BTreeMap;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::macros::projection;
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

const MAX_LABEL_LEN: usize = 100;

#[derive(Debug, Deserialize)]
pub struct SaveMacroRequest {
    pub label: String,
    pub pending: BTreeMap<String, i32>,
    #[serde(default)]
    pub modifier: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MacroRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub label: String,
    pub pending: serde_json::Value,
    pub modifier: i32,
    pub created_at: DateTime<Utc>,
}

pub async fn save_macro(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<SaveMacroRequest>,
) -> Result<Json<MacroRow>, AppError> {
    let label = req.label.trim();
    if label.is_empty() {
        return Err(AppError::BadRequest("macro label cannot be empty".to_string()));
    }
    if label.chars().count() > MAX_LABEL_LEN {
        return Err(AppError::BadRequest(format!("macro label cannot exceed {MAX_LABEL_LEN} characters")));
    }

    let row_id = Uuid::new_v4();

    let event = NewEvent {
        aggregate_type: "dice_macro",
        aggregate_id: row_id,
        session_id: None,
        event_type: "dice_macro.created",
        payload: json!({
            "label": label,
            "pending": req.pending,
            "modifier": req.modifier,
        }),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_and_project(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn delete_macro(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(macro_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    if !authz::owns_macro(state.pool(), auth.user_id, macro_id).await? {
        return Err(AppError::Forbidden);
    }

    let event = NewEvent {
        aggregate_type: "dice_macro",
        aggregate_id: macro_id,
        session_id: None,
        event_type: "dice_macro.deleted",
        payload: json!({}),
        metadata: auth.metadata(),
    };

    retry_tx!(state.pool(), |tx| {
        projection::append_and_unproject(&mut tx, &event).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}
