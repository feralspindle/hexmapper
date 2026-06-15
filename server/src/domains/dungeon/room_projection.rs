//! Projection of `dungeon_room` events into the `dungeon_rooms` read model.
//! Full-snapshot collection aggregate (created/updated/deleted). create() is an
//! upsert (on conflict id) so the undo "re-insert deleted room" path resurrects
//! the original id; replay is latest-event-wins so a resurrected room reappears.

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
        ({s}->>'origin_x')::int,
        ({s}->>'origin_y')::int,
        ({s}->>'width')::int,
        ({s}->>'height')::int,
        {s}->>'label',
        {s}->>'notes',
        {s}->>'color',
        {s}->>'source_client',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz,
        {s}->'items',
        {s}->'doors',
        {s}->>'shape',
        {s}->'points'
        "#
    )
}

const COLS: &str = "id, dungeon_id, session_id, origin_x, origin_y, width, height, label, notes, color, source_client, created_at, updated_at, items, doors, shape, points";

/// Upsert a room (insert, or update-on-conflict by id for undo resurrection).
/// `dungeon_id` and `session_id` are resolved server-side; `body` carries the rest.
pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    dungeon_id: Uuid,
    session_id: Uuid,
    body: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with up as (
            insert into dungeon_rooms (id, dungeon_id, session_id, origin_x, origin_y, width, height, label, notes, color, source_client, items, doors, shape, points)
            values (
                coalesce(($3->>'id')::uuid, gen_random_uuid()),
                $1, $2,
                round(($3->>'origin_x')::numeric)::int,
                round(($3->>'origin_y')::numeric)::int,
                round(($3->>'width')::numeric)::int,
                round(($3->>'height')::numeric)::int,
                $3->>'label', $3->>'notes', $3->>'color', $3->>'source_client',
                coalesce($3->'items', '[]'::jsonb),
                coalesce($3->'doors', '[]'::jsonb),
                coalesce($3->>'shape', 'rect'),
                coalesce($3->'points', '[]'::jsonb)
            )
            on conflict (id) do update set
                origin_x = excluded.origin_x, origin_y = excluded.origin_y,
                width = excluded.width, height = excluded.height,
                label = excluded.label, notes = excluded.notes, color = excluded.color,
                source_client = excluded.source_client,
                items = excluded.items, doors = excluded.doors,
                shape = excluded.shape, points = excluded.points,
                updated_at = now()
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_room', up.id, up.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_room' and e.aggregate_id = up.id), 0) + 1,
                'dungeon_room.created', to_jsonb(up), $4
            from up
        )
        select to_jsonb(up) from up
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
            update dungeon_rooms set
                origin_x      = case when $2 ? 'origin_x' then round(($2->>'origin_x')::numeric)::int else origin_x end,
                origin_y      = case when $2 ? 'origin_y' then round(($2->>'origin_y')::numeric)::int else origin_y end,
                width         = case when $2 ? 'width' then round(($2->>'width')::numeric)::int else width end,
                height        = case when $2 ? 'height' then round(($2->>'height')::numeric)::int else height end,
                label         = case when $2 ? 'label' then $2->>'label' else label end,
                notes         = case when $2 ? 'notes' then $2->>'notes' else notes end,
                color         = case when $2 ? 'color' then $2->>'color' else color end,
                source_client = case when $2 ? 'source_client' then $2->>'source_client' else source_client end,
                items         = case when $2 ? 'items' then $2->'items' else items end,
                doors         = case when $2 ? 'doors' then $2->'doors' else doors end,
                shape         = case when $2 ? 'shape' then $2->>'shape' else shape end,
                points        = case when $2 ? 'points' then $2->'points' else points end,
                updated_at    = now()
            where id = $1
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_room', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_room' and e.aggregate_id = upd.id), 0) + 1,
                'dungeon_room.updated', to_jsonb(upd), $3
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
        with del as ( delete from dungeon_rooms where id = $1 returning id, session_id ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_room', del.id, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_room' and e.aggregate_id = del.id), 0) + 1,
                'dungeon_room.deleted', '{}'::jsonb, $2
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
            where e.aggregate_type = 'dungeon_room'
            order by e.aggregate_id, e.sequence desc
        ) latest
        where latest.event_type <> 'dungeon_room.deleted'
        "#,
        cols = snapshot_columns("latest.payload"),
    )
}
