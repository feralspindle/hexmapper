//! Projection of `dungeon_fog_cell` events into the `dungeon_fog_cells` read model.
//! Lifecycle aggregate keyed by the row id; a cell is revealed = the row exists,
//! hidden = the row is deleted. `dungeon_fog_cells` has no session_id column, so the
//! event's session_id is resolved from the dungeon and passed in. Replay is
//! latest-event-wins (a re-revealed coord gets a fresh id, so no resurrection of the
//! same id ever happens — but the form is uniform with rooms/corridors).

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'id')::uuid,
        ({s}->>'dungeon_id')::uuid,
        ({s}->>'cell_x')::int,
        ({s}->>'cell_y')::int,
        {s}->>'source_client',
        ({s}->>'created_at')::timestamptz
        "#
    )
}

const COLS: &str = "id, dungeon_id, cell_x, cell_y, source_client, created_at";

/// Reveal one cell (upsert by dungeon_id,cell_x,cell_y). `body` carries
/// dungeon_id/cell_x/cell_y/source_client; `session_id` is resolved server-side.
pub async fn reveal_one(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    body: &Value,
    metadata: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with up as (
            insert into dungeon_fog_cells (dungeon_id, cell_x, cell_y, source_client)
            values (($2->>'dungeon_id')::uuid, ($2->>'cell_x')::int, ($2->>'cell_y')::int, $2->>'source_client')
            on conflict (dungeon_id, cell_x, cell_y) do update set source_client = excluded.source_client
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_fog_cell', up.id, $1,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_fog_cell' and e.aggregate_id = up.id), 0) + 1,
                'dungeon_fog_cell.revealed', to_jsonb(up), $3
            from up
        )
        select 1
        "#,
    )
    .bind(session_id).bind(body).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(())
}

/// Hide one cell (delete by dungeon_id,cell_x,cell_y).
pub async fn hide_one(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    body: &Value,
    metadata: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with del as (
            delete from dungeon_fog_cells
            where dungeon_id = ($2->>'dungeon_id')::uuid and cell_x = ($2->>'cell_x')::int and cell_y = ($2->>'cell_y')::int
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_fog_cell', del.id, $1,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_fog_cell' and e.aggregate_id = del.id), 0) + 1,
                'dungeon_fog_cell.deleted', '{}'::jsonb, $3
            from del
        )
        select 1
        "#,
    )
    .bind(session_id).bind(body).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(())
}

/// Reveal many cells. `body.cells` is `[{cell_x, cell_y}, ...]`. Only freshly
/// inserted rows (on conflict do nothing) get a revealed event.
pub async fn reveal_bulk(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    body: &Value,
    metadata: &Value,
) -> Result<i64, AppError> {
    let count: i64 = sqlx::query_scalar(
        r#"
        with input as (
            select ($2->>'dungeon_id')::uuid as dungeon_id,
                   (c->>'cell_x')::int as cell_x,
                   (c->>'cell_y')::int as cell_y,
                   $2->>'source_client' as source_client
            from jsonb_array_elements($2->'cells') c
        ),
        ins as (
            insert into dungeon_fog_cells (dungeon_id, cell_x, cell_y, source_client)
            select dungeon_id, cell_x, cell_y, source_client from input
            on conflict (dungeon_id, cell_x, cell_y) do nothing
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_fog_cell', i.id, $1, 1, 'dungeon_fog_cell.revealed', to_jsonb(i), $3
            from ins i
        )
        select count(*)::bigint from ins
        "#,
    )
    .bind(session_id).bind(body).bind(metadata)
    .fetch_one(&mut **tx)
    .await?;
    Ok(count)
}

/// Hide many cells. `body.cells` is `[{cell_x, cell_y}, ...]`.
pub async fn hide_bulk(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    body: &Value,
    metadata: &Value,
) -> Result<i64, AppError> {
    let count: i64 = sqlx::query_scalar(
        r#"
        with input as (
            select ($2->>'dungeon_id')::uuid as dungeon_id,
                   (c->>'cell_x')::int as cell_x,
                   (c->>'cell_y')::int as cell_y
            from jsonb_array_elements($2->'cells') c
        ),
        del as (
            delete from dungeon_fog_cells f using input i
            where f.dungeon_id = i.dungeon_id and f.cell_x = i.cell_x and f.cell_y = i.cell_y
            returning f.*
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_fog_cell', d.id, $1,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_fog_cell' and e.aggregate_id = d.id), 0) + 1,
                'dungeon_fog_cell.deleted', '{}'::jsonb, $3
            from del d
        )
        select count(*)::bigint from del
        "#,
    )
    .bind(session_id).bind(body).bind(metadata)
    .fetch_one(&mut **tx)
    .await?;
    Ok(count)
}

/// Delete every fog cell for a dungeon (revealAll / hideAll both clear the rows;
/// the fog_reveal_all flag toggles separately via the dungeon update).
pub async fn clear_all(
    tx: &mut Transaction<'_, Postgres>,
    dungeon_id: Uuid,
    session_id: Uuid,
    metadata: &Value,
) -> Result<i64, AppError> {
    let count: i64 = sqlx::query_scalar(
        r#"
        with del as (
            delete from dungeon_fog_cells where dungeon_id = $1 returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_fog_cell', d.id, $2,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_fog_cell' and e.aggregate_id = d.id), 0) + 1,
                'dungeon_fog_cell.deleted', '{}'::jsonb, $3
            from del d
        )
        select count(*)::bigint from del
        "#,
    )
    .bind(dungeon_id).bind(session_id).bind(metadata)
    .fetch_one(&mut **tx)
    .await?;
    Ok(count)
}

pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({COLS})
        select {cols}
        from (
            select distinct on (e.aggregate_id) e.event_type, e.payload
            from events e
            where e.aggregate_type = 'dungeon_fog_cell'
            order by e.aggregate_id, e.sequence desc
        ) latest
        where latest.event_type <> 'dungeon_fog_cell.deleted'
        "#,
        cols = snapshot_columns("latest.payload"),
    )
}
