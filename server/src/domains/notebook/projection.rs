//! Projection of `party_quest` events into the `party_quests` read model.
//!
//! Collection aggregate with **full-snapshot events**: every `created`/`updated`
//! event stores `to_jsonb(row)`, so a partial update merges the patch over the
//! current row (via `coalesce`) inside the CTE and records the resulting full
//! snapshot. Replay is therefore the latest snapshot per aggregate, excluding
//! deleted (see [`replay_select`]) — and genesis is a single snapshot per row.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

/// The `party_quests` columns derived from a snapshot jsonb expression `s`.
/// Shared by replay and (implicitly) by the snapshot the CTEs record.
fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'id')::uuid,
        ({s}->>'session_id')::uuid,
        {s}->>'title',
        {s}->>'description',
        {s}->'goals',
        {s}->>'reward',
        ({s}->>'completed')::boolean,
        {s}->>'added_by_name',
        ({s}->>'is_gm_added')::boolean,
        ({s}->>'display_order')::int,
        {s}->>'source_client',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz,
        ({s}->>'reward_qty')::int,
        {s}->>'reward_type',
        {s}->'rewards'
        "#
    )
}

const COLS: &str = "id, session_id, title, description, goals, reward, completed, added_by_name, is_gm_added, display_order, source_client, created_at, updated_at, reward_qty, reward_type, rewards";

/// Inserts a new quest and records a `party_quest.created` event carrying the full
/// inserted snapshot (incl. server defaults). Returns the row as JSON.
pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    added_by_name: &str,
    is_gm_added: bool,
    display_order: i32,
    source_client: Option<&str>,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into party_quests (id, session_id, added_by_name, is_gm_added, display_order, source_client)
            values ($1, $2, $3, $4, $5, $6)
            returning *
        ),
        seq as (
            select coalesce(max(sequence), 0) + 1 as n
            from events where aggregate_type = 'party_quest' and aggregate_id = $1
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_quest', $1, $2, (select n from seq), 'party_quest.created', to_jsonb(ins), $7
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id)
    .bind(session_id)
    .bind(added_by_name)
    .bind(is_gm_added)
    .bind(display_order)
    .bind(source_client)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

/// Applies a partial patch (only present keys take effect) and records a
/// `party_quest.updated` event with the resulting full snapshot.
pub async fn update(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    patch: &Value,
    metadata: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with upd as (
            update party_quests set
                title         = coalesce($2->>'title', title),
                description   = coalesce($2->>'description', description),
                goals         = coalesce($2->'goals', goals),
                reward        = coalesce($2->>'reward', reward),
                completed     = coalesce(($2->>'completed')::boolean, completed),
                display_order = coalesce(($2->>'display_order')::int, display_order),
                reward_qty    = coalesce(($2->>'reward_qty')::int, reward_qty),
                reward_type   = coalesce($2->>'reward_type', reward_type),
                rewards       = coalesce($2->'rewards', rewards),
                source_client = $2->>'source_client',
                updated_at    = now()
            where id = $1
            returning *
        ),
        seq as (
            select coalesce(max(sequence), 0) + 1 as n
            from events where aggregate_type = 'party_quest' and aggregate_id = $1
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_quest', $1, upd.session_id, (select n from seq), 'party_quest.updated', to_jsonb(upd), $3
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

/// Deletes a quest and records a `party_quest.deleted` event.
pub async fn delete(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    metadata: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with del as (
            delete from party_quests where id = $1 returning session_id
        ),
        seq as (
            select coalesce(max(sequence), 0) + 1 as n
            from events where aggregate_type = 'party_quest' and aggregate_id = $1
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_quest', $1, del.session_id, (select n from seq), 'party_quest.deleted', '{}'::jsonb, $2
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

/// Rebuilds `party_quests` from the event log into `target_table`: the latest
/// snapshot per aggregate, excluding aggregates with a `deleted` event.
pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({COLS})
        select distinct on (e.aggregate_id) {cols}
        from events e
        where e.aggregate_type = 'party_quest'
          and e.event_type in ('party_quest.created', 'party_quest.updated')
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'party_quest'
              and d.aggregate_id = e.aggregate_id
              and d.event_type = 'party_quest.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = snapshot_columns("e.payload"),
    )
}
