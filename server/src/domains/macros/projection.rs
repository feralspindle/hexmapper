//! Projection of `dice_macro` events into the `dice_macros` read model.
//!
//! First *lifecycle* aggregate: `dice_macro.created` inserts a row,
//! `dice_macro.deleted` removes it. Replay therefore excludes aggregates that
//! have a later `.deleted` event (see [`replay_select`]).

use sqlx::{Postgres, Transaction};

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::MacroRow;

/// `dice_macros` projection columns, derived from an event row aliased `src`.
fn projection_columns(src: &str) -> String {
    format!(
        r#"
        {src}.aggregate_id,
        ({src}.metadata->>'user_id')::uuid,
        {src}.payload->>'label',
        {src}.payload->'pending',
        ({src}.payload->>'modifier')::int,
        {src}.created_at
        "#
    )
}

const PROJECTION_TARGET: &str = r#"
    dice_macros (id, user_id, label, pending, modifier, created_at)
"#;

/// Appends a `dice_macro.created` event and folds it into `dice_macros` in a
/// single round trip, returning the projected row.
pub async fn append_and_project(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<MacroRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into {PROJECTION_TARGET}
        select {cols}
        from evt
        returning id, user_id, label, pending, modifier, created_at
        "#,
        cols = projection_columns("evt"),
    );

    let row: MacroRow = sqlx::query_as(&sql)
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

/// Appends a `dice_macro.deleted` event and removes the projection row in a single
/// round trip.
pub async fn append_and_unproject(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<(), AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        delete from dice_macros where id in (select aggregate_id from evt)
        "#
    );

    sqlx::query(&sql)
        .bind(event.aggregate_type)
        .bind(event.aggregate_id)
        .bind(event.session_id)
        .bind(event.event_type)
        .bind(&event.payload)
        .bind(&event.metadata)
        .execute(&mut **tx)
        .await?;

    Ok(())
}

/// SQL that rebuilds the `dice_macros` projection from the event log into
/// `target_table`: every `dice_macro.created` aggregate that has no later
/// `dice_macro.deleted` event. Used by replay-diff verification.
pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} (id, user_id, label, pending, modifier, created_at)
        select {cols}
        from events e
        where e.aggregate_type = 'dice_macro' and e.event_type = 'dice_macro.created'
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'dice_macro'
              and d.aggregate_id = e.aggregate_id
              and d.event_type = 'dice_macro.deleted'
          )
        order by e.aggregate_id, e.sequence
        "#,
        cols = projection_columns("e"),
    )
}
