//! Projection of `stat_block` events into the `stat_blocks` read model.
//!
//! `stat_block` is a full-snapshot collection aggregate like `character`:
//! `created` / `data_updated` / `deleted`, with the whole npc/monster blob in
//! the snapshot, so replay = latest snapshot per aggregate (deletes excluded).

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
        {s}->'data',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz
        "#
    )
}

const COLS: &str = "id, session_id, created_by, kind, data, created_at, updated_at";

pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    created_by: Uuid,
    kind: &str,
    data: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into stat_blocks (id, session_id, created_by, kind, data)
            values ($1, $2, $3, $4, $5)
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'stat_block', ins.id, ins.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'stat_block' and e.aggregate_id = ins.id), 0) + 1,
                'stat_block.created', to_jsonb(ins), $6
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id)
    .bind(session_id)
    .bind(created_by)
    .bind(kind)
    .bind(data)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

/// Replaces the full `data` blob (the debounced panel save) and records a snapshot.
pub async fn update_data(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    data: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with upd as (
            update stat_blocks set data = $2 where id = $1 returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'stat_block', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'stat_block' and e.aggregate_id = upd.id), 0) + 1,
                'stat_block.data_updated', to_jsonb(upd), $3
            from upd
        )
        select to_jsonb(upd) from upd
        "#,
    )
    .bind(id)
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
            delete from stat_blocks where id = $1 returning session_id
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'stat_block', $1, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'stat_block' and e.aggregate_id = $1), 0) + 1,
                'stat_block.deleted', '{}'::jsonb, $2
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
        where e.aggregate_type = 'stat_block'
          and e.event_type in ('stat_block.created', 'stat_block.data_updated')
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'stat_block'
              and d.aggregate_id = e.aggregate_id
              and d.event_type = 'stat_block.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = snapshot_columns("e.payload"),
    )
}
