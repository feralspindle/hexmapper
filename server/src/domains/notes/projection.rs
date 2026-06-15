//! Projection of `hex_note` events into the `hex_notes` read model.
//!
//! Lifecycle + mutable aggregate: `hex_note.created` inserts, `hex_note.edited`
//! updates the body (a delta carrying just the new body), `hex_note.deleted`
//! removes the row. Replay folds created + latest edit and excludes deleted
//! aggregates (see [`replay_select`]). `display_name` is carried in the created
//! event's metadata so replay is self-contained.

use sqlx::{Postgres, Transaction};

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::HexNoteRow;

/// Columns for inserting a `hex_notes` row from a `hex_note.created` event `src`.
/// (display_name is also re-filled by the fill_display_name trigger to the same
/// value; including it keeps the live insert and replay aligned.)
fn created_columns(src: &str) -> String {
    format!(
        r#"
        {src}.aggregate_id,
        ({src}.payload->>'hex_cell_id')::uuid,
        {src}.session_id,
        ({src}.metadata->>'user_id')::uuid,
        {src}.metadata->>'display_name',
        {src}.payload->>'body',
        {src}.created_at,
        {src}.created_at
        "#
    )
}

const TARGET_COLS: &str =
    "id, hex_cell_id, session_id, user_id, display_name, body, created_at, updated_at";
const RETURNING: &str =
    "id, hex_cell_id, session_id, user_id, display_name, body, created_at, updated_at";

async fn run(
    tx: &mut Transaction<'_, Postgres>,
    sql: &str,
    event: &NewEvent,
) -> Result<HexNoteRow, AppError> {
    let row = sqlx::query_as(sql)
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

/// Appends `hex_note.created` and folds it into `hex_notes`, returning the row.
pub async fn append_and_project(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<HexNoteRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into hex_notes ({TARGET_COLS})
        select {cols}
        from evt
        returning {RETURNING}
        "#,
        cols = created_columns("evt"),
    );
    run(tx, &sql, event).await
}

/// Appends `hex_note.edited` and updates the row body in one round trip.
pub async fn append_and_edit(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<HexNoteRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        update hex_notes
        set body = (select payload->>'body' from evt),
            updated_at = (select created_at from evt)
        where id = (select aggregate_id from evt)
        returning {RETURNING}
        "#
    );
    run(tx, &sql, event).await
}

/// Appends `hex_note.deleted` and removes the projection row in one round trip.
pub async fn append_and_unproject(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<(), AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        delete from hex_notes where id in (select aggregate_id from evt)
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

/// Rebuilds `hex_notes` from the event log into `target_table`: each `created`
/// aggregate (excluding those with a later `deleted`), folding the latest `edited`
/// body and timestamp over the created snapshot.
pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({TARGET_COLS})
        select
            c.aggregate_id,
            (c.payload->>'hex_cell_id')::uuid,
            c.session_id,
            (c.metadata->>'user_id')::uuid,
            c.metadata->>'display_name',
            coalesce(le.body, c.payload->>'body'),
            c.created_at,
            coalesce(le.created_at, c.created_at)
        from events c
        left join lateral (
            select e.payload->>'body' as body, e.created_at
            from events e
            where e.aggregate_type = 'hex_note'
              and e.aggregate_id = c.aggregate_id
              and e.event_type = 'hex_note.edited'
            order by e.sequence desc
            limit 1
        ) le on true
        where c.aggregate_type = 'hex_note' and c.event_type = 'hex_note.created'
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'hex_note'
              and d.aggregate_id = c.aggregate_id
              and d.event_type = 'hex_note.deleted'
          )
        order by c.aggregate_id, c.sequence
        "#
    )
}
