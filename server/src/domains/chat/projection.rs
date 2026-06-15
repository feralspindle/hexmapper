//! Projection of `chat_message.sent` events into the `chat_messages` read model.
//!
//! The only place `chat_messages` rows are written. Every column is derived from
//! the event, so the same derivation drives the live command path
//! ([`append_and_project`]) and replay/rebuild ([`replay_select`]).

use sqlx::{Postgres, Transaction};

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::ChatMessageRow;

/// `chat_messages` projection columns, derived from an event row aliased `src`.
/// `display_name` is omitted — the `fill_display_name` trigger fills it from
/// auth.users (a denormalized snapshot, not carried in the event).
fn projection_columns(src: &str) -> String {
    format!(
        r#"
        {src}.aggregate_id,
        {src}.session_id,
        ({src}.metadata->>'user_id')::uuid,
        {src}.payload->>'body',
        {src}.created_at
        "#
    )
}

const PROJECTION_TARGET: &str = r#"
    chat_messages (id, session_id, user_id, body, created_at)
"#;

/// Appends a `chat_message.sent` event and folds it into `chat_messages` in a
/// single round trip, returning the projected row (trigger-filled `display_name`).
pub async fn append_and_project(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<ChatMessageRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into {PROJECTION_TARGET}
        select {cols}
        from evt
        returning id, session_id, user_id, display_name, body, created_at
        "#,
        cols = projection_columns("evt"),
    );

    let row: ChatMessageRow = sqlx::query_as(&sql)
        .bind(event.aggregate_type)
        .bind(event.aggregate_id)
        .bind(event.session_id)
        .bind(event.event_type)
        .bind(&event.payload)
        .bind(&event.metadata)
        .fetch_one(&mut **tx)
        .await?;

    Ok(row)
}

/// SQL that rebuilds the entire `chat_messages` projection from the event log into
/// `target_table` (a shadow table). Used by replay-diff verification; never targets
/// the live table.
pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} (id, session_id, user_id, body, created_at)
        select {cols}
        from events
        where aggregate_type = 'chat_message' and event_type = 'chat_message.sent'
        order by aggregate_id, sequence
        "#,
        cols = projection_columns("events"),
    )
}
