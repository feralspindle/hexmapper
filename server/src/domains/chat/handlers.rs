use axum::extract::State;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::chat::projection;
use crate::error::AppError;
use crate::events::NewEvent;
use crate::state::AppState;

const MAX_BODY_LEN: usize = 2000;

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub session_id: Uuid,
    pub body: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ChatMessageRow {
    pub id: Uuid,
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

pub async fn send_message(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<SendMessageRequest>,
) -> Result<Json<ChatMessageRow>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    let body = req.body.trim();
    if body.is_empty() {
        return Err(AppError::BadRequest("message body cannot be empty".to_string()));
    }
    if body.chars().count() > MAX_BODY_LEN {
        return Err(AppError::BadRequest(format!("message body cannot exceed {MAX_BODY_LEN} characters")));
    }

    let row_id = Uuid::new_v4();

    let event = NewEvent {
        aggregate_type: "chat_message",
        aggregate_id: row_id,
        session_id: Some(req.session_id),
        event_type: "chat_message.sent",
        payload: json!({ "body": body }),
        metadata: auth.metadata(),
    };

    let mut tx = state.pool().begin().await?;
    let row = projection::append_and_project(&mut tx, &event).await?;
    tx.commit().await?;

    Ok(Json(row))
}
