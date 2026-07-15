//! Projection of `dungeon_icon` events into the `dungeon_icons` read model.
//! Free-placed grid icons for fog-mode dungeons (same palette as room items,
//! but living on the cell grid instead of inside a room's jsonb). Full-snapshot
//! collection aggregate (created/updated/deleted), replay is latest-event-wins.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'id')::uuid,
        ({s}->>'dungeon_id')::uuid,
        ({s}->>'session_id')::uuid,
        {s}->>'type',
        {s}->>'label',
        {s}->>'notes',
        ({s}->>'x')::int,
        ({s}->>'y')::int,
        {s}->>'source_client',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz
        "#
    )
}

const COLS: &str = "id, dungeon_id, session_id, type, label, notes, x, y, source_client, created_at, updated_at";

/// Place an icon. `dungeon_id` and `session_id` are resolved server-side;
/// `body` carries type/label/notes/x/y/source_client.
pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    dungeon_id: Uuid,
    session_id: Uuid,
    body: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into dungeon_icons (id, dungeon_id, session_id, type, label, notes, x, y, source_client)
            values (
                coalesce(($3->>'id')::uuid, gen_random_uuid()),
                $1, $2,
                $3->>'type',
                $3->>'label',
                $3->>'notes',
                round(($3->>'x')::numeric)::int,
                round(($3->>'y')::numeric)::int,
                $3->>'source_client'
            )
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_icon', ins.id, ins.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_icon' and e.aggregate_id = ins.id), 0) + 1,
                'dungeon_icon.created', to_jsonb(ins), $4
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(dungeon_id).bind(session_id).bind(body).bind(metadata)
    .fetch_one(&mut **tx)
    .await?;
    Ok(row)
}

pub async fn update(tx: &mut Transaction<'_, Postgres>, id: Uuid, patch: &Value, metadata: &Value) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with upd as (
            update dungeon_icons set
                label         = case when $2 ? 'label' then $2->>'label' else label end,
                notes         = case when $2 ? 'notes' then $2->>'notes' else notes end,
                x             = case when $2 ? 'x' then round(($2->>'x')::numeric)::int else x end,
                y             = case when $2 ? 'y' then round(($2->>'y')::numeric)::int else y end,
                source_client = case when $2 ? 'source_client' then $2->>'source_client' else source_client end,
                updated_at    = now()
            where id = $1
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_icon', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_icon' and e.aggregate_id = upd.id), 0) + 1,
                'dungeon_icon.updated', to_jsonb(upd), $3
            from upd
        )
        select 1
        "#,
    )
    .bind(id).bind(patch).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(())
}

pub async fn delete(tx: &mut Transaction<'_, Postgres>, id: Uuid, metadata: &Value) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with del as ( delete from dungeon_icons where id = $1 returning id, session_id ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_icon', del.id, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_icon' and e.aggregate_id = del.id), 0) + 1,
                'dungeon_icon.deleted', '{}'::jsonb, $2
            from del
        )
        select 1
        "#,
    )
    .bind(id).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(())
}

pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({COLS})
        select {cols}
        from (
            select distinct on (e.aggregate_id) e.event_type, e.payload
            from events e
            where e.aggregate_type = 'dungeon_icon'
            order by e.aggregate_id, e.sequence desc
        ) latest
        where latest.event_type <> 'dungeon_icon.deleted'
        "#,
        cols = snapshot_columns("latest.payload"),
    )
}
