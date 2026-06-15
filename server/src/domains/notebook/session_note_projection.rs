//! Projection of `party_session_note` events into the `party_session_notes` read
//! model. Same full-snapshot collection pattern as `party_quest` (see projection.rs).

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'id')::uuid,
        ({s}->>'session_id')::uuid,
        {s}->>'title',
        {s}->>'content',
        {s}->>'author_name',
        {s}->>'author_user_id',
        ({s}->>'is_gm_author')::boolean,
        {s}->>'source_client',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz
        "#
    )
}

const COLS: &str = "id, session_id, title, content, author_name, author_user_id, is_gm_author, source_client, created_at, updated_at";

pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    author_name: &str,
    author_user_id: &str,
    is_gm_author: bool,
    source_client: Option<&str>,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into party_session_notes (id, session_id, author_name, author_user_id, is_gm_author, source_client)
            values ($1, $2, $3, $4, $5, $6)
            returning *
        ),
        seq as (
            select coalesce(max(sequence), 0) + 1 as n
            from events where aggregate_type = 'party_session_note' and aggregate_id = $1
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_session_note', $1, $2, (select n from seq), 'party_session_note.created', to_jsonb(ins), $7
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id)
    .bind(session_id)
    .bind(author_name)
    .bind(author_user_id)
    .bind(is_gm_author)
    .bind(source_client)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

pub async fn update(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    patch: &Value,
    metadata: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with upd as (
            update party_session_notes set
                title         = coalesce($2->>'title', title),
                content       = coalesce($2->>'content', content),
                source_client = $2->>'source_client',
                updated_at    = now()
            where id = $1
            returning *
        ),
        seq as (
            select coalesce(max(sequence), 0) + 1 as n
            from events where aggregate_type = 'party_session_note' and aggregate_id = $1
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_session_note', $1, upd.session_id, (select n from seq), 'party_session_note.updated', to_jsonb(upd), $3
            from upd
        )
        select 1
        "#,
    )
    .bind(id)
    .bind(patch)
    .bind(metadata)
    .fetch_optional(&mut **tx)
    .await?;

    Ok(())
}

pub async fn delete(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    metadata: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with del as (
            delete from party_session_notes where id = $1 returning session_id
        ),
        seq as (
            select coalesce(max(sequence), 0) + 1 as n
            from events where aggregate_type = 'party_session_note' and aggregate_id = $1
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_session_note', $1, del.session_id, (select n from seq), 'party_session_note.deleted', '{}'::jsonb, $2
            from del
        )
        select 1
        "#,
    )
    .bind(id)
    .bind(metadata)
    .fetch_optional(&mut **tx)
    .await?;

    Ok(())
}

pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({COLS})
        select distinct on (e.aggregate_id) {cols}
        from events e
        where e.aggregate_type = 'party_session_note'
          and e.event_type in ('party_session_note.created', 'party_session_note.updated')
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'party_session_note'
              and d.aggregate_id = e.aggregate_id
              and d.event_type = 'party_session_note.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = snapshot_columns("e.payload"),
    )
}
