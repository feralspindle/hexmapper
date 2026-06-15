//! Projection of `dungeon_corridor` events into the `dungeon_corridors` read model.
//! Full-snapshot collection aggregate (created/updated/deleted), mirroring
//! room_projection. create() is an upsert (on conflict id) for undo resurrection.

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
        ({s}->>'x1')::int,
        ({s}->>'y1')::int,
        ({s}->>'x2')::int,
        ({s}->>'y2')::int,
        {s}->>'label',
        ({s}->>'width')::int,
        {s}->>'source_client',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz,
        nullif({s}->'points', 'null'::jsonb)
        "#
    )
}

const COLS: &str = "id, dungeon_id, session_id, x1, y1, x2, y2, label, width, source_client, created_at, updated_at, points";

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
            insert into dungeon_corridors (id, dungeon_id, session_id, x1, y1, x2, y2, label, width, source_client, points)
            values (
                coalesce(($3->>'id')::uuid, gen_random_uuid()),
                $1, $2,
                round(($3->>'x1')::numeric)::int,
                round(($3->>'y1')::numeric)::int,
                round(($3->>'x2')::numeric)::int,
                round(($3->>'y2')::numeric)::int,
                $3->>'label',
                coalesce(round(($3->>'width')::numeric)::int, 1),
                $3->>'source_client',
                $3->'points'
            )
            on conflict (id) do update set
                x1 = excluded.x1, y1 = excluded.y1, x2 = excluded.x2, y2 = excluded.y2,
                label = excluded.label, width = excluded.width,
                source_client = excluded.source_client, points = excluded.points,
                updated_at = now()
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_corridor', up.id, up.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_corridor' and e.aggregate_id = up.id), 0) + 1,
                'dungeon_corridor.created', to_jsonb(up), $4
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
            update dungeon_corridors set
                x1            = case when $2 ? 'x1' then round(($2->>'x1')::numeric)::int else x1 end,
                y1            = case when $2 ? 'y1' then round(($2->>'y1')::numeric)::int else y1 end,
                x2            = case when $2 ? 'x2' then round(($2->>'x2')::numeric)::int else x2 end,
                y2            = case when $2 ? 'y2' then round(($2->>'y2')::numeric)::int else y2 end,
                label         = case when $2 ? 'label' then $2->>'label' else label end,
                width         = case when $2 ? 'width' then round(($2->>'width')::numeric)::int else width end,
                source_client = case when $2 ? 'source_client' then $2->>'source_client' else source_client end,
                points        = case when $2 ? 'points' then $2->'points' else points end,
                updated_at    = now()
            where id = $1
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_corridor', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_corridor' and e.aggregate_id = upd.id), 0) + 1,
                'dungeon_corridor.updated', to_jsonb(upd), $3
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
        with del as ( delete from dungeon_corridors where id = $1 returning id, session_id ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_corridor', del.id, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_corridor' and e.aggregate_id = del.id), 0) + 1,
                'dungeon_corridor.deleted', '{}'::jsonb, $2
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
            where e.aggregate_type = 'dungeon_corridor'
            order by e.aggregate_id, e.sequence desc
        ) latest
        where latest.event_type <> 'dungeon_corridor.deleted'
        "#,
        cols = snapshot_columns("latest.payload"),
    )
}
