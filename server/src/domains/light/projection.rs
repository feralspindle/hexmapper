//! projection of `light_source` events into the `light_sources` read model.
//! full-snapshot rows (created/updated/deleted), latest-event-wins on replay.
//! the timer algebra matches the session torch: pause folds the running span
//! into elapsed_ms, the client interpolates from started_at while running.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::LightSourceRow;

const RETURNING: &str = "id, session_id, created_by, name, kind, mode, duration_ms, elapsed_ms, running, started_at, duration_rounds, rounds_elapsed, expired, attached_character_id, attached_q, attached_r, created_at, updated_at";

pub async fn append_created(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<LightSourceRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into light_sources
            (id, session_id, created_by, name, kind, mode, duration_ms, duration_rounds, attached_character_id, attached_q, attached_r, created_at, updated_at)
        select aggregate_id,
               session_id,
               (metadata->>'user_id')::uuid,
               payload->>'name',
               coalesce(payload->>'kind', 'torch'),
               coalesce(payload->>'mode', 'real_time'),
               coalesce((payload->>'duration_ms')::bigint, 3600000),
               coalesce((payload->>'duration_rounds')::integer, 10),
               nullif(payload->>'attached_character_id', '')::uuid,
               (payload->>'attached_q')::integer,
               (payload->>'attached_r')::integer,
               created_at,
               created_at
        from evt
        returning {RETURNING}
        "#
    );

    bind_event(sqlx::query_as(&sql), event)
        .fetch_one(&mut **tx)
        .await
        .map_err(Into::into)
}

/// applies a state patch. the handler computes the new timer fields, the
/// projection just writes what the payload carries.
pub async fn append_updated(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<LightSourceRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        update light_sources l set
            running = case when evt.payload ? 'running' then (evt.payload->>'running')::boolean else l.running end,
            elapsed_ms = case when evt.payload ? 'elapsed_ms' then (evt.payload->>'elapsed_ms')::bigint else l.elapsed_ms end,
            started_at = case when evt.payload ? 'started_at' then nullif(evt.payload->>'started_at', '')::timestamptz else l.started_at end,
            rounds_elapsed = case when evt.payload ? 'rounds_elapsed' then (evt.payload->>'rounds_elapsed')::integer else l.rounds_elapsed end,
            expired = case when evt.payload ? 'expired' then (evt.payload->>'expired')::boolean else l.expired end,
            attached_character_id = case when evt.payload ? 'attached_character_id' then nullif(evt.payload->>'attached_character_id', '')::uuid else l.attached_character_id end,
            updated_at = evt.created_at
        from evt
        where l.id = evt.aggregate_id
        returning l.id, l.session_id, l.created_by, l.name, l.kind, l.mode, l.duration_ms, l.elapsed_ms, l.running, l.started_at, l.duration_rounds, l.rounds_elapsed, l.expired, l.attached_character_id, l.attached_q, l.attached_r, l.created_at, l.updated_at
        "#
    );

    bind_event(sqlx::query_as(&sql), event)
        .fetch_one(&mut **tx)
        .await
        .map_err(Into::into)
}

pub async fn append_deleted(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<(), AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        delete from light_sources l using evt where l.id = evt.aggregate_id
        "#
    );

    sqlx::query(&sql)
        .bind(event.aggregate_type)
        .bind(event.aggregate_id)
        .bind(event.session_id)
        .bind(event.event_type)
        .bind(&event.payload)
        .bind(&event.metadata)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

pub async fn fetch(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
) -> Result<Option<LightSourceRow>, AppError> {
    sqlx::query_as(&format!(
        "select {RETURNING} from light_sources where id = $1 for update"
    ))
    .bind(id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(Into::into)
}

fn bind_event<'q, O>(
    query: sqlx::query::QueryAs<'q, Postgres, O, sqlx::postgres::PgArguments>,
    event: &'q NewEvent,
) -> sqlx::query::QueryAs<'q, Postgres, O, sqlx::postgres::PgArguments>
where
    O: for<'r> sqlx::FromRow<'r, sqlx::postgres::PgRow> + Send + Unpin,
{
    query
        .bind(event.aggregate_type)
        .bind(event.aggregate_id)
        .bind(event.session_id)
        .bind(event.event_type)
        .bind(&event.payload)
        .bind(&event.metadata)
}
