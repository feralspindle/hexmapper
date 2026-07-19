use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::compendium::projection;
use crate::error::AppError;
use crate::retry_tx;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub session_id: Uuid,
    pub kind: Option<String>,
}

pub async fn list_entries(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<Value>>, AppError> {
    require_member(&state, auth.user_id, query.session_id).await?;
    let rows: Vec<Value> = sqlx::query_scalar(
        r#"
        select to_jsonb(c) from compendium_entries c
        where session_id = $1 and ($2::text is null or kind = $2)
        order by kind, name
        "#,
    )
    .bind(query.session_id)
    .bind(query.kind)
    .fetch_all(state.pool())
    .await?;

    Ok(Json(rows))
}

pub async fn delete_entry(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let session_id: Option<Uuid> =
        sqlx::query_scalar("select session_id from compendium_entries where id = $1")
            .bind(id)
            .fetch_optional(state.pool())
            .await?;
    let session_id = session_id.ok_or(AppError::NotFound)?;
    require_member(&state, auth.user_id, session_id).await?;

    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        projection::delete(&mut tx, id, &metadata).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

async fn require_member(state: &AppState, user_id: Uuid, session_id: Uuid) -> Result<(), AppError> {
    if authz::is_session_member(state.pool(), user_id, session_id).await? {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}
