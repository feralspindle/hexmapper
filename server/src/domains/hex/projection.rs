//! Projection of `hex_cell` events into the `hex_cells` read model. Full-snapshot
//! aggregate keyed by the row id (the `on conflict (map_id,q,r)` upsert preserves
//! it). The upsert is *partial* (case-when per column) so a player editing one
//! cell (e.g. adding a marker) doesn't wipe GM-only columns like gm_markers.
//!
//! Bulk ops (set_revealed for revealAll/hideAll, clear_all) are set-based and
//! record one event per affected cell, so the changes stay in the log.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'id')::uuid,
        ({s}->>'session_id')::uuid,
        ({s}->>'q')::int,
        ({s}->>'r')::int,
        {s}->>'label',
        {s}->>'notes',
        {s}->>'terrain_type',
        {s}->>'color',
        ({s}->>'has_dungeon')::boolean,
        {s}->>'source_client',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz,
        ({s}->>'revealed')::boolean,
        ({s}->>'map_id')::uuid,
        {s}->>'marker_color',
        {s}->>'marker_label',
        {s}->>'gm_markers'
        "#
    )
}

const COLS: &str = "id, session_id, q, r, label, notes, terrain_type, color, has_dungeon, source_client, created_at, updated_at, revealed, map_id, marker_color, marker_label, gm_markers";

/// Upserts a hex cell (insert-or-partial-update by map_id,q,r) and records a
/// `hex_cell.upserted` snapshot. `body` carries the cell fields; session_id is bound
/// separately. Only columns present in `body` are updated on conflict.
pub async fn upsert(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    body: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with up as (
            insert into hex_cells (session_id, map_id, q, r, label, notes, terrain_type, color, has_dungeon, revealed, marker_color, marker_label, gm_markers, source_client)
            values (
                $1,
                ($2->>'map_id')::uuid,
                ($2->>'q')::int,
                ($2->>'r')::int,
                $2->>'label',
                $2->>'notes',
                $2->>'terrain_type',
                $2->>'color',
                coalesce(($2->>'has_dungeon')::boolean, false),
                coalesce(($2->>'revealed')::boolean, false),
                $2->>'marker_color',
                $2->>'marker_label',
                $2->>'gm_markers',
                $2->>'source_client'
            )
            on conflict (map_id, q, r) do update set
                label         = case when $2 ? 'label' then $2->>'label' else hex_cells.label end,
                notes         = case when $2 ? 'notes' then $2->>'notes' else hex_cells.notes end,
                terrain_type  = case when $2 ? 'terrain_type' then $2->>'terrain_type' else hex_cells.terrain_type end,
                color         = case when $2 ? 'color' then $2->>'color' else hex_cells.color end,
                has_dungeon   = case when $2 ? 'has_dungeon' then ($2->>'has_dungeon')::boolean else hex_cells.has_dungeon end,
                revealed      = case when $2 ? 'revealed' then ($2->>'revealed')::boolean else hex_cells.revealed end,
                marker_color  = case when $2 ? 'marker_color' then $2->>'marker_color' else hex_cells.marker_color end,
                marker_label  = case when $2 ? 'marker_label' then $2->>'marker_label' else hex_cells.marker_label end,
                gm_markers    = case when $2 ? 'gm_markers' then $2->>'gm_markers' else hex_cells.gm_markers end,
                source_client = $2->>'source_client',
                updated_at    = now()
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'hex_cell', up.id, up.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'hex_cell' and e.aggregate_id = up.id), 0) + 1,
                'hex_cell.upserted', to_jsonb(up), $3
            from up
        )
        select to_jsonb(up) from up
        "#,
    )
    .bind(session_id)
    .bind(body)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

/// Deletes a single hex cell by (map_id, q, r), recording a `hex_cell.deleted`.
pub async fn delete_one(
    tx: &mut Transaction<'_, Postgres>,
    map_id: Uuid,
    q: i32,
    r: i32,
    metadata: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with del as (
            delete from hex_cells where map_id = $1 and q = $2 and r = $3 returning id, session_id
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'hex_cell', del.id, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'hex_cell' and e.aggregate_id = del.id), 0) + 1,
                'hex_cell.deleted', '{}'::jsonb, $4
            from del
        )
        select 1
        "#,
    )
    .bind(map_id).bind(q).bind(r).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(())
}

/// Sets `revealed` for every cell in a map that doesn't already have that value
/// (revealAll/hideAll), recording a `hex_cell.upserted` snapshot per affected cell.
pub async fn set_revealed(
    tx: &mut Transaction<'_, Postgres>,
    map_id: Uuid,
    revealed: bool,
    metadata: &Value,
) -> Result<i64, AppError> {
    let count: i64 = sqlx::query_scalar(
        r#"
        with up as (
            update hex_cells set revealed = $2, source_client = null, updated_at = now()
            where map_id = $1 and revealed is distinct from $2
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'hex_cell', u.id, u.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'hex_cell' and e.aggregate_id = u.id), 0) + 1,
                'hex_cell.upserted', to_jsonb(u), $3
            from up u
        )
        select count(*)::bigint from up
        "#,
    )
    .bind(map_id).bind(revealed).bind(metadata)
    .fetch_one(&mut **tx)
    .await?;
    Ok(count)
}

/// Deletes every cell in a map (clearAll), recording a `hex_cell.deleted` per cell.
pub async fn clear_all(
    tx: &mut Transaction<'_, Postgres>,
    map_id: Uuid,
    metadata: &Value,
) -> Result<i64, AppError> {
    let count: i64 = sqlx::query_scalar(
        r#"
        with del as (
            delete from hex_cells where map_id = $1 returning id, session_id
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'hex_cell', d.id, d.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'hex_cell' and e.aggregate_id = d.id), 0) + 1,
                'hex_cell.deleted', '{}'::jsonb, $2
            from del d
        )
        select count(*)::bigint from del
        "#,
    )
    .bind(map_id).bind(metadata)
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
        where e.aggregate_type = 'hex_cell' and e.event_type = 'hex_cell.upserted'
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'hex_cell' and d.aggregate_id = e.aggregate_id and d.event_type = 'hex_cell.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = snapshot_columns("e.payload"),
    )
}
