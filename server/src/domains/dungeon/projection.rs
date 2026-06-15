//! Projection of `dungeon` events into the `dungeons` read model. Full-snapshot
//! aggregate (created/updated/deleted). The three torch operations replicate the
//! old torch_* RPCs' server-side elapsed-time math, each recording a
//! `dungeon.updated` snapshot.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'id')::uuid,
        ({s}->>'session_id')::uuid,
        ({s}->>'hex_id')::uuid,
        {s}->>'name',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz,
        ({s}->>'torch_running')::boolean,
        ({s}->>'torch_elapsed_ms')::bigint,
        ({s}->>'torch_started_at')::timestamptz,
        {s}->>'map_image_path',
        ({s}->>'map_image_offset_x')::int,
        ({s}->>'map_image_offset_y')::int,
        ({s}->>'map_image_scale')::double precision,
        ({s}->>'map_image_rotation')::int,
        ({s}->>'fog_mode')::boolean,
        ({s}->>'fog_reveal_all')::boolean,
        ({s}->>'map_offset_locked')::boolean
        "#
    )
}

const COLS: &str = "id, session_id, hex_id, name, created_at, updated_at, torch_running, torch_elapsed_ms, torch_started_at, map_image_path, map_image_offset_x, map_image_offset_y, map_image_scale, map_image_rotation, fog_mode, fog_reveal_all, map_offset_locked";

/// Wraps a `dungeons` mutation that exposes `s` (the updated row) in a
/// `dungeon.<event>` snapshot event. Returns the row JSON (or None if 0 rows).
async fn run_event(
    tx: &mut Transaction<'_, Postgres>,
    mutation_cte: &str,
    event_type: &str,
    id: Uuid,
    metadata: &Value,
) -> Result<Option<Value>, AppError> {
    let sql = format!(
        r#"
        with s as ( {mutation_cte} ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon', s.id, s.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon' and e.aggregate_id = s.id), 0) + 1,
                '{event_type}', to_jsonb(s), $2
            from s
        )
        select to_jsonb(s) from s
        "#
    );
    let row: Option<Value> = sqlx::query_scalar(&sql)
        .bind(id)
        .bind(metadata)
        .fetch_optional(&mut **tx)
        .await?;
    Ok(row)
}

pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    hex_id: Uuid,
    name: &str,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into dungeons (id, session_id, hex_id, name) values ($1, $2, $3, $4) returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon', ins.id, ins.session_id, 1, 'dungeon.created', to_jsonb(ins), $5 from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id)
    .bind(session_id)
    .bind(hex_id)
    .bind(name)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;
    Ok(row)
}

/// Partial update of dungeon config/torch fields. `case when patch ? 'key'` lets
/// explicit nulls through (e.g. clearing map_image_path / torch_started_at).
pub async fn update(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    patch: &Value,
    metadata: &Value,
) -> Result<Option<Value>, AppError> {
    let cte = r#"
        update dungeons set
            name               = case when $3 ? 'name' then $3->>'name' else name end,
            map_image_path     = case when $3 ? 'map_image_path' then $3->>'map_image_path' else map_image_path end,
            map_image_offset_x = case when $3 ? 'map_image_offset_x' then round(($3->>'map_image_offset_x')::numeric)::int else map_image_offset_x end,
            map_image_offset_y = case when $3 ? 'map_image_offset_y' then round(($3->>'map_image_offset_y')::numeric)::int else map_image_offset_y end,
            map_image_scale    = case when $3 ? 'map_image_scale' then ($3->>'map_image_scale')::double precision else map_image_scale end,
            map_image_rotation = case when $3 ? 'map_image_rotation' then round(($3->>'map_image_rotation')::numeric)::int else map_image_rotation end,
            fog_mode           = case when $3 ? 'fog_mode' then ($3->>'fog_mode')::boolean else fog_mode end,
            fog_reveal_all     = case when $3 ? 'fog_reveal_all' then ($3->>'fog_reveal_all')::boolean else fog_reveal_all end,
            map_offset_locked  = case when $3 ? 'map_offset_locked' then ($3->>'map_offset_locked')::boolean else map_offset_locked end,
            torch_running      = case when $3 ? 'torch_running' then ($3->>'torch_running')::boolean else torch_running end,
            torch_elapsed_ms   = case when $3 ? 'torch_elapsed_ms' then ($3->>'torch_elapsed_ms')::bigint else torch_elapsed_ms end,
            torch_started_at   = case when $3 ? 'torch_started_at' then ($3->>'torch_started_at')::timestamptz else torch_started_at end,
            updated_at         = now()
        where id = $1
        returning *
    "#;
    let sql = format!(
        r#"
        with s as ( {cte} ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon', s.id, s.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon' and e.aggregate_id = s.id), 0) + 1,
                'dungeon.updated', to_jsonb(s), $2
            from s
        )
        select to_jsonb(s) from s
        "#
    );
    let row: Option<Value> = sqlx::query_scalar(&sql)
        .bind(id)
        .bind(metadata)
        .bind(patch)
        .fetch_optional(&mut **tx)
        .await?;
    Ok(row)
}

pub async fn torch_start(tx: &mut Transaction<'_, Postgres>, id: Uuid, metadata: &Value) -> Result<(), AppError> {
    run_event(tx, "update dungeons set torch_running = true, torch_started_at = now() where id = $1 returning *", "dungeon.updated", id, metadata).await?;
    Ok(())
}

pub async fn torch_pause(tx: &mut Transaction<'_, Postgres>, id: Uuid, metadata: &Value) -> Result<(), AppError> {
    run_event(
        tx,
        r#"update dungeons set
            torch_elapsed_ms = least(3600000, torch_elapsed_ms + (extract(epoch from (now() - torch_started_at)) * 1000)::bigint),
            torch_running = false,
            torch_started_at = null
        where id = $1 and torch_running = true and torch_started_at is not null
        returning *"#,
        "dungeon.updated", id, metadata,
    ).await?;
    Ok(())
}

pub async fn torch_reset(tx: &mut Transaction<'_, Postgres>, id: Uuid, metadata: &Value) -> Result<(), AppError> {
    run_event(
        tx,
        "update dungeons set torch_elapsed_ms = 0, torch_started_at = case when torch_running then now() else null end where id = $1 returning *",
        "dungeon.updated", id, metadata,
    ).await?;
    Ok(())
}

pub async fn delete(tx: &mut Transaction<'_, Postgres>, id: Uuid, metadata: &Value) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with del as ( delete from dungeons where id = $1 returning id, session_id ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon', del.id, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon' and e.aggregate_id = del.id), 0) + 1,
                'dungeon.deleted', '{}'::jsonb, $2
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

/// Latest-event-wins replay: take the newest event per aggregate, drop those whose
/// newest event is a delete.
pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({COLS})
        select {cols}
        from (
            select distinct on (e.aggregate_id) e.event_type, e.payload
            from events e
            where e.aggregate_type = 'dungeon'
            order by e.aggregate_id, e.sequence desc
        ) latest
        where latest.event_type <> 'dungeon.deleted'
        "#,
        cols = snapshot_columns("latest.payload"),
    )
}
