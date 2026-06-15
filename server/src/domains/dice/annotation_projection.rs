//! Projection of `dice_roll_annotation.created` events into the
//! `dice_roll_annotations` read model. Append-only (like `dice_roll.rolled`).
//!
//! `display_name` is NOT NULL and is otherwise filled by the `fill_display_name`
//! BEFORE-INSERT trigger (from `user_id`). To keep replay self-contained we resolve
//! the same value in the handler and carry it in the event metadata, then project it
//! — so the shadow table (which has no trigger) reproduces every column. On the live
//! table the trigger re-derives the identical value, so live and replay agree.

use sqlx::{Postgres, Transaction};

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::AnnotationRow;

/// The `dice_roll_annotations` projection columns, derived from an event row `src`.
fn projection_columns(src: &str) -> String {
    format!(
        r#"
        {src}.aggregate_id,
        ({src}.payload->>'roll_id')::uuid,
        {src}.session_id,
        ({src}.metadata->>'user_id')::uuid,
        {src}.metadata->>'display_name',
        {src}.payload->>'body',
        {src}.created_at
        "#
    )
}

const PROJECTION_TARGET: &str = r#"
    dice_roll_annotations (id, roll_id, session_id, user_id, display_name, body, created_at)
"#;

/// Appends a `dice_roll_annotation.created` event and folds it into
/// `dice_roll_annotations` in one round trip, returning the projected row.
pub async fn append_and_project(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<AnnotationRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into {PROJECTION_TARGET}
        select {cols}
        from evt
        returning id, roll_id, session_id, user_id, display_name, body, created_at
        "#,
        cols = projection_columns("evt"),
    );

    let row: AnnotationRow = sqlx::query_as(&sql)
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

/// Rebuilds the entire `dice_roll_annotations` projection from the event log into a
/// shadow `target_table`. Used by the replay-diff verification; never the live table.
pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} (id, roll_id, session_id, user_id, display_name, body, created_at)
        select {cols}
        from events
        where aggregate_type = 'dice_roll_annotation' and event_type = 'dice_roll_annotation.created'
        order by aggregate_id, sequence
        "#,
        cols = projection_columns("events"),
    )
}
