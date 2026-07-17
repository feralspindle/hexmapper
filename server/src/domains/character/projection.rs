//! Projection of `character` events into the `characters` read model, plus the
//! append-only `character_sheet_log`.
//!
//! `character` is a full-snapshot collection aggregate: `created` / `data_updated`
//! (the debounced full-blob sheet save) / `deleted`. The data blob lives in the
//! snapshot, so replay = latest snapshot per aggregate (deletes excluded).
//! `clear_initiative` is a GM bulk op that strips `data->initiative` from every
//! character in a session — it records a `data_updated` event per affected
//! character so the change stays in the log (otherwise replay would diverge).

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'id')::uuid,
        ({s}->>'session_id')::uuid,
        ({s}->>'user_id')::uuid,
        {s}->'data',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz
        "#
    )
}

const COLS: &str = "id, session_id, user_id, data, created_at, updated_at";

pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Option<Uuid>,
    user_id: Uuid,
    data: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into characters (id, session_id, user_id, data)
            values ($1, $2, $3, $4)
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'character', ins.id, ins.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'character' and e.aggregate_id = ins.id), 0) + 1,
                'character.created', to_jsonb(ins), $5
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id)
    .bind(session_id)
    .bind(user_id)
    .bind(data)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

/// Replaces the full `data` blob (the debounced sheet save) and records a snapshot.
pub async fn update_data(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    data: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with upd as (
            update characters set data = $2 where id = $1 returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'character', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'character' and e.aggregate_id = upd.id), 0) + 1,
                'character.data_updated', to_jsonb(upd), $3
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

/// Adjusts one numeric currency field in `data` in place (floor 0), recording
/// the usual `data_updated` snapshot so replay stays consistent. The narrow
/// member-allowed alternative to the owner/GM-only full-blob `update_data`.
pub async fn adjust_currency(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    currency: &str,
    delta: i64,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with upd as (
            update characters
            set data = jsonb_set(
                data,
                array[$2],
                to_jsonb(greatest(0::numeric, coalesce((data->>$2)::numeric, 0) + $3))
            )
            where id = $1
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'character', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'character' and e.aggregate_id = upd.id), 0) + 1,
                'character.data_updated', to_jsonb(upd), $4
            from upd
        )
        select to_jsonb(upd) from upd
        "#,
    )
    .bind(id)
    .bind(currency)
    .bind(delta)
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
            delete from characters where id = $1 returning session_id
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'character', $1, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'character' and e.aggregate_id = $1), 0) + 1,
                'character.deleted', '{}'::jsonb, $2
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

/// Strips `data->initiative` from every character in the session that has it,
/// recording a `character.data_updated` snapshot per affected character. Returns
/// the number affected.
pub async fn clear_initiative(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    metadata: &Value,
) -> Result<i64, AppError> {
    let count: i64 = sqlx::query_scalar(
        r#"
        with affected as (
            update characters set data = data - 'initiative'
            where session_id = $1 and data ? 'initiative'
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'character', a.id, a.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'character' and e.aggregate_id = a.id), 0) + 1,
                'character.data_updated', to_jsonb(a), $2
            from affected a
        )
        select count(*)::bigint from affected
        "#,
    )
    .bind(session_id)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(count)
}

pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({COLS})
        select distinct on (e.aggregate_id) {cols}
        from events e
        where e.aggregate_type = 'character'
          and e.event_type in ('character.created', 'character.data_updated')
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'character'
              and d.aggregate_id = e.aggregate_id
              and d.event_type = 'character.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = snapshot_columns("e.payload"),
    )
}

// ---- character_sheet_log (append-only) ----------------------------------

pub async fn append_sheet_log(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    user_id: Uuid,
    display_name: &str,
    what: &str,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into character_sheet_log (id, session_id, user_id, display_name, what)
            values ($1, $2, $3, $4, $5)
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'character_sheet_log', ins.id, ins.session_id, 1, 'character_sheet_log.recorded', to_jsonb(ins), $6
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id)
    .bind(session_id)
    .bind(user_id)
    .bind(display_name)
    .bind(what)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

pub fn replay_sheet_log(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} (id, session_id, user_id, display_name, what, created_at)
        select
            (e.payload->>'id')::uuid,
            (e.payload->>'session_id')::uuid,
            (e.payload->>'user_id')::uuid,
            e.payload->>'display_name',
            e.payload->>'what',
            (e.payload->>'created_at')::timestamptz
        from events e
        where e.aggregate_type = 'character_sheet_log' and e.event_type = 'character_sheet_log.recorded'
        order by e.aggregate_id, e.sequence
        "#
    )
}
