//! Projection of `dungeon_activity.recorded` events into the `dungeon_activity`
//! read model. Append-only.
//!
//! `display_name` is a server-resolved snapshot of the actor's name; it lives in
//! the event **metadata** (alongside user_id) so the event is self-contained and
//! replay reproduces it exactly — rather than re-deriving from auth.users, which
//! could drift if the user later renamed themselves.

use sqlx::{Postgres, Transaction};

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::ActivityRow;

/// `dungeon_activity` columns, derived from an event row aliased `src`.
fn projection_columns(src: &str) -> String {
    format!(
        r#"
        {src}.aggregate_id,
        ({src}.payload->>'dungeon_id')::uuid,
        ({src}.metadata->>'user_id')::uuid,
        {src}.metadata->>'display_name',
        {src}.payload->>'verb',
        {src}.payload->>'what',
        {src}.created_at
        "#
    )
}

const PROJECTION_TARGET: &str = r#"
    dungeon_activity (id, dungeon_id, user_id, display_name, verb, what, created_at)
"#;

/// Appends a `dungeon_activity.recorded` event and folds it into `dungeon_activity`
/// in a single round trip, returning the projected row.
pub async fn append_and_project(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<ActivityRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into {PROJECTION_TARGET}
        select {cols}
        from evt
        returning id, dungeon_id, user_id, display_name, verb, what, created_at
        "#,
        cols = projection_columns("evt"),
    );

    let row: ActivityRow = sqlx::query_as(&sql)
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

/// SQL that rebuilds the entire `dungeon_activity` projection from the event log
/// into `target_table`. Used by replay-diff verification.
pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} (id, dungeon_id, user_id, display_name, verb, what, created_at)
        select {cols}
        from events e
        where e.aggregate_type = 'dungeon_activity' and e.event_type = 'dungeon_activity.recorded'
        order by e.aggregate_id, e.sequence
        "#,
        cols = projection_columns("e"),
    )
}
