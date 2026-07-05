//! Projection of `map` events into the `maps` read model. Full-snapshot collection
//! aggregate (created/updated/deleted). The `maps` row is also written by hexStore
//! (party_hex_*) — those go through update() too, so they stay in the log.
//!
//! update() uses `case when patch ? 'key'` (not coalesce) so a patch can set a
//! column to an explicit NULL (e.g. clearPartyHex sets party_hex_q/r to null).

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'id')::uuid,
        ({s}->>'session_id')::uuid,
        {s}->>'name',
        {s}->>'map_type',
        {s}->>'map_image_path',
        ({s}->>'map_hex_width')::double precision,
        ({s}->>'map_hex_height')::double precision,
        ({s}->>'map_image_rotation')::int,
        ({s}->>'map_grid_rotation')::int,
        ({s}->>'map_image_offset_x')::int,
        ({s}->>'map_image_offset_y')::int,
        ({s}->>'map_grid_offset_x')::int,
        ({s}->>'map_grid_offset_y')::int,
        ({s}->>'map_offset_locked')::boolean,
        ({s}->>'created_at')::timestamptz,
        ({s}->>'fog_reveal_all')::boolean,
        ({s}->>'map_scale')::numeric,
        {s}->>'map_scale_unit',
        ({s}->>'map_image_scale')::double precision,
        ({s}->>'parent_map_id')::uuid,
        ({s}->>'parent_hex_id')::uuid,
        ({s}->>'party_hex_q')::int,
        ({s}->>'party_hex_r')::int,
        ({s}->>'map_grid_cols')::int,
        ({s}->>'map_grid_rows')::int
        "#
    )
}

const COLS: &str = "id, session_id, name, map_type, map_image_path, map_hex_width, map_hex_height, map_image_rotation, map_grid_rotation, map_image_offset_x, map_image_offset_y, map_grid_offset_x, map_grid_offset_y, map_offset_locked, created_at, fog_reveal_all, map_scale, map_scale_unit, map_image_scale, parent_map_id, parent_hex_id, party_hex_q, party_hex_r, map_grid_cols, map_grid_rows";

/// Inserts a map, filling any column the `fields` payload omits with its table
/// default, and records a `map.created` snapshot. `fields` may include session_id
/// (ignored — session_id is bound explicitly).
pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    fields: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into maps (
                id, session_id, name, map_type, map_image_path, map_hex_width, map_hex_height,
                map_image_rotation, map_grid_rotation, map_image_offset_x, map_image_offset_y,
                map_grid_offset_x, map_grid_offset_y, map_offset_locked, fog_reveal_all,
                map_scale, map_scale_unit, map_image_scale, parent_map_id, parent_hex_id, party_hex_q, party_hex_r,
                map_grid_cols, map_grid_rows
            )
            values (
                $1, $2,
                coalesce($3->>'name', 'Untitled Map'),
                coalesce($3->>'map_type', 'hex'),
                $3->>'map_image_path',
                coalesce(($3->>'map_hex_width')::double precision, 96),
                ($3->>'map_hex_height')::double precision,
                coalesce(round(($3->>'map_image_rotation')::numeric)::int, 0),
                coalesce(round(($3->>'map_grid_rotation')::numeric)::int, 0),
                coalesce(round(($3->>'map_image_offset_x')::numeric)::int, 0),
                coalesce(round(($3->>'map_image_offset_y')::numeric)::int, 0),
                coalesce(round(($3->>'map_grid_offset_x')::numeric)::int, 0),
                coalesce(round(($3->>'map_grid_offset_y')::numeric)::int, 0),
                coalesce(($3->>'map_offset_locked')::boolean, false),
                coalesce(($3->>'fog_reveal_all')::boolean, false),
                ($3->>'map_scale')::numeric,
                coalesce($3->>'map_scale_unit', 'miles'),
                coalesce(($3->>'map_image_scale')::double precision, 1.0),
                ($3->>'parent_map_id')::uuid,
                ($3->>'parent_hex_id')::uuid,
                ($3->>'party_hex_q')::int,
                ($3->>'party_hex_r')::int,
                ($3->>'map_grid_cols')::int,
                ($3->>'map_grid_rows')::int
            )
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'map', ins.id, ins.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'map' and e.aggregate_id = ins.id), 0) + 1,
                'map.created', to_jsonb(ins), $4
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id).bind(session_id).bind(fields).bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

pub async fn update(tx: &mut Transaction<'_, Postgres>, id: Uuid, patch: &Value, metadata: &Value) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with upd as (
            update maps set
                name               = case when $2 ? 'name' then $2->>'name' else name end,
                map_type           = case when $2 ? 'map_type' then $2->>'map_type' else map_type end,
                map_image_path     = case when $2 ? 'map_image_path' then $2->>'map_image_path' else map_image_path end,
                map_hex_width      = case when $2 ? 'map_hex_width' then ($2->>'map_hex_width')::double precision else map_hex_width end,
                map_hex_height     = case when $2 ? 'map_hex_height' then ($2->>'map_hex_height')::double precision else map_hex_height end,
                map_image_rotation = case when $2 ? 'map_image_rotation' then round(($2->>'map_image_rotation')::numeric)::int else map_image_rotation end,
                map_grid_rotation  = case when $2 ? 'map_grid_rotation' then round(($2->>'map_grid_rotation')::numeric)::int else map_grid_rotation end,
                map_image_offset_x = case when $2 ? 'map_image_offset_x' then round(($2->>'map_image_offset_x')::numeric)::int else map_image_offset_x end,
                map_image_offset_y = case when $2 ? 'map_image_offset_y' then round(($2->>'map_image_offset_y')::numeric)::int else map_image_offset_y end,
                map_grid_offset_x  = case when $2 ? 'map_grid_offset_x' then round(($2->>'map_grid_offset_x')::numeric)::int else map_grid_offset_x end,
                map_grid_offset_y  = case when $2 ? 'map_grid_offset_y' then round(($2->>'map_grid_offset_y')::numeric)::int else map_grid_offset_y end,
                map_offset_locked  = case when $2 ? 'map_offset_locked' then ($2->>'map_offset_locked')::boolean else map_offset_locked end,
                fog_reveal_all     = case when $2 ? 'fog_reveal_all' then ($2->>'fog_reveal_all')::boolean else fog_reveal_all end,
                map_scale          = case when $2 ? 'map_scale' then ($2->>'map_scale')::numeric else map_scale end,
                map_scale_unit     = case when $2 ? 'map_scale_unit' then $2->>'map_scale_unit' else map_scale_unit end,
                map_image_scale    = case when $2 ? 'map_image_scale' then ($2->>'map_image_scale')::double precision else map_image_scale end,
                parent_map_id      = case when $2 ? 'parent_map_id' then ($2->>'parent_map_id')::uuid else parent_map_id end,
                parent_hex_id      = case when $2 ? 'parent_hex_id' then ($2->>'parent_hex_id')::uuid else parent_hex_id end,
                party_hex_q        = case when $2 ? 'party_hex_q' then round(($2->>'party_hex_q')::numeric)::int else party_hex_q end,
                party_hex_r        = case when $2 ? 'party_hex_r' then round(($2->>'party_hex_r')::numeric)::int else party_hex_r end,
                map_grid_cols      = case when $2 ? 'map_grid_cols' then round(($2->>'map_grid_cols')::numeric)::int else map_grid_cols end,
                map_grid_rows      = case when $2 ? 'map_grid_rows' then round(($2->>'map_grid_rows')::numeric)::int else map_grid_rows end
            where id = $1
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'map', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'map' and e.aggregate_id = upd.id), 0) + 1,
                'map.updated', to_jsonb(upd), $3
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
        with del as (
            delete from maps where id = $1 returning session_id
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'map', $1, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'map' and e.aggregate_id = $1), 0) + 1,
                'map.deleted', '{}'::jsonb, $2
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
        select distinct on (e.aggregate_id) {cols}
        from events e
        where e.aggregate_type = 'map' and e.event_type in ('map.created', 'map.updated')
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'map' and d.aggregate_id = e.aggregate_id and d.event_type = 'map.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = snapshot_columns("e.payload"),
    )
}
