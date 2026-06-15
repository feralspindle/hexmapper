//! Projection of `dungeon_element_note` events into the `dungeon_element_notes`
//! read model. Same lifecycle+mutable shape as `hex_note` (see projection.rs),
//! keyed by element_id + element_type instead of hex_cell_id.

use sqlx::{Postgres, Transaction};

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::DungeonElementNoteRow;

fn created_columns(src: &str) -> String {
    format!(
        r#"
        {src}.aggregate_id,
        ({src}.payload->>'element_id')::uuid,
        {src}.payload->>'element_type',
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
    "id, element_id, element_type, session_id, user_id, display_name, body, created_at, updated_at";
const RETURNING: &str =
    "id, element_id, element_type, session_id, user_id, display_name, body, created_at, updated_at";

async fn run(
    tx: &mut Transaction<'_, Postgres>,
    sql: &str,
    event: &NewEvent,
) -> Result<DungeonElementNoteRow, AppError> {
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

pub async fn append_and_project(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<DungeonElementNoteRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into dungeon_element_notes ({TARGET_COLS})
        select {cols}
        from evt
        returning {RETURNING}
        "#,
        cols = created_columns("evt"),
    );
    run(tx, &sql, event).await
}

pub async fn append_and_edit(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<DungeonElementNoteRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        update dungeon_element_notes
        set body = (select payload->>'body' from evt),
            updated_at = (select created_at from evt)
        where id = (select aggregate_id from evt)
        returning {RETURNING}
        "#
    );
    run(tx, &sql, event).await
}

pub async fn append_and_unproject(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<(), AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        delete from dungeon_element_notes where id in (select aggregate_id from evt)
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

pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({TARGET_COLS})
        select
            c.aggregate_id,
            (c.payload->>'element_id')::uuid,
            c.payload->>'element_type',
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
            where e.aggregate_type = 'dungeon_element_note'
              and e.aggregate_id = c.aggregate_id
              and e.event_type = 'dungeon_element_note.edited'
            order by e.sequence desc
            limit 1
        ) le on true
        where c.aggregate_type = 'dungeon_element_note' and c.event_type = 'dungeon_element_note.created'
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'dungeon_element_note'
              and d.aggregate_id = c.aggregate_id
              and d.event_type = 'dungeon_element_note.deleted'
          )
        order by c.aggregate_id, c.sequence
        "#
    )
}
