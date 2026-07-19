//! Projection of `compendium_entry` events into the `compendium_entries` read
//! model. Full-snapshot collection aggregate: `created` / `deleted`. Create is
//! an upsert on (session_id, kind, name) so a re-import refreshes an entry in
//! place — the event carries the surviving row's id, so replay stays
//! latest-snapshot-per-aggregate like the other collections.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'id')::uuid,
        ({s}->>'session_id')::uuid,
        ({s}->>'created_by')::uuid,
        {s}->>'kind',
        {s}->>'name',
        {s}->'data',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz
        "#
    )
}

const COLS: &str = "id, session_id, created_by, kind, name, data, created_at, updated_at";

pub async fn upsert(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    created_by: Uuid,
    kind: &str,
    name: &str,
    data: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with up as (
            insert into compendium_entries (session_id, created_by, kind, name, data)
            values ($1, $2, $3, $4, $5)
            on conflict (session_id, kind, name) do update set
                data = excluded.data,
                updated_at = now()
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'compendium_entry', up.id, up.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'compendium_entry' and e.aggregate_id = up.id), 0) + 1,
                'compendium_entry.created', to_jsonb(up), $6
            from up
        )
        select to_jsonb(up) from up
        "#,
    )
    .bind(session_id)
    .bind(created_by)
    .bind(kind)
    .bind(name)
    .bind(data)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

pub async fn delete(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    metadata: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with del as (
            delete from compendium_entries where id = $1 returning session_id
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'compendium_entry', $1, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'compendium_entry' and e.aggregate_id = $1), 0) + 1,
                'compendium_entry.deleted', '{}'::jsonb, $2
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
        where e.aggregate_type = 'compendium_entry'
          and e.event_type = 'compendium_entry.created'
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'compendium_entry'
              and d.aggregate_id = e.aggregate_id
              and d.event_type = 'compendium_entry.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = snapshot_columns("e.payload"),
    )
}
