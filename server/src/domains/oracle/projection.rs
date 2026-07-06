use sqlx::{Postgres, Transaction};

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::{OracleRollRow, OracleTableRow, OracleTableRowRow};

pub async fn append_table_created(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<OracleTableRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into oracle_tables (id, session_id, created_by, name, description, mode, tag, created_at, updated_at)
        select aggregate_id,
               session_id,
               (metadata->>'user_id')::uuid,
               payload->>'name',
               coalesce(payload->>'description', ''),
               coalesce(payload->>'mode', 'weighted'),
               nullif(payload->>'tag', ''),
               created_at,
               created_at
        from evt
        returning id, session_id, created_by, name, description, mode, tag, created_at, updated_at
        "#
    );

    sqlx::query_as(&sql)
        .bind(event.aggregate_type)
        .bind(event.aggregate_id)
        .bind(event.session_id)
        .bind(event.event_type)
        .bind(&event.payload)
        .bind(&event.metadata)
        .fetch_one(&mut **tx)
        .await
        .map_err(Into::into)
}

pub async fn append_table_updated(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<OracleTableRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        update oracle_tables ot set
            name = case when evt.payload ? 'name' then evt.payload->>'name' else ot.name end,
            description = case when evt.payload ? 'description' then coalesce(evt.payload->>'description', '') else ot.description end,
            mode = case when evt.payload ? 'mode' then evt.payload->>'mode' else ot.mode end,
            tag = case when evt.payload ? 'tag' then nullif(evt.payload->>'tag', '') else ot.tag end,
            updated_at = evt.created_at
        from evt
        where ot.id = evt.aggregate_id
        returning ot.id, ot.session_id, ot.created_by, ot.name, ot.description, ot.mode, ot.tag, ot.created_at, ot.updated_at
        "#
    );

    sqlx::query_as(&sql)
        .bind(event.aggregate_type)
        .bind(event.aggregate_id)
        .bind(event.session_id)
        .bind(event.event_type)
        .bind(&event.payload)
        .bind(&event.metadata)
        .fetch_one(&mut **tx)
        .await
        .map_err(Into::into)
}

pub async fn append_table_deleted(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<(), AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        delete from oracle_tables where id in (select aggregate_id from evt)
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

pub async fn append_row_created(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<OracleTableRowRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into oracle_table_rows
            (id, table_id, weight, range_min, range_max, result, notes, position, created_at, updated_at)
        select aggregate_id,
               (payload->>'table_id')::uuid,
               coalesce((payload->>'weight')::integer, 1),
               nullif(payload->>'range_min', '')::integer,
               nullif(payload->>'range_max', '')::integer,
               payload->>'result',
               coalesce(payload->>'notes', ''),
               coalesce((payload->>'position')::integer, 0),
               created_at,
               created_at
        from evt
        returning id, table_id, weight, range_min, range_max, result, notes, position, created_at, updated_at
        "#
    );

    sqlx::query_as(&sql)
        .bind(event.aggregate_type)
        .bind(event.aggregate_id)
        .bind(event.session_id)
        .bind(event.event_type)
        .bind(&event.payload)
        .bind(&event.metadata)
        .fetch_one(&mut **tx)
        .await
        .map_err(Into::into)
}

pub async fn append_row_updated(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<OracleTableRowRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        update oracle_table_rows row set
            weight = case when evt.payload ? 'weight' then (evt.payload->>'weight')::integer else row.weight end,
            range_min = case when evt.payload ? 'range_min' then nullif(evt.payload->>'range_min', '')::integer else row.range_min end,
            range_max = case when evt.payload ? 'range_max' then nullif(evt.payload->>'range_max', '')::integer else row.range_max end,
            result = case when evt.payload ? 'result' then evt.payload->>'result' else row.result end,
            notes = case when evt.payload ? 'notes' then coalesce(evt.payload->>'notes', '') else row.notes end,
            position = case when evt.payload ? 'position' then (evt.payload->>'position')::integer else row.position end,
            updated_at = evt.created_at
        from evt
        where row.id = evt.aggregate_id
        returning row.id, row.table_id, row.weight, row.range_min, row.range_max, row.result, row.notes, row.position, row.created_at, row.updated_at
        "#
    );

    sqlx::query_as(&sql)
        .bind(event.aggregate_type)
        .bind(event.aggregate_id)
        .bind(event.session_id)
        .bind(event.event_type)
        .bind(&event.payload)
        .bind(&event.metadata)
        .fetch_one(&mut **tx)
        .await
        .map_err(Into::into)
}

pub async fn append_row_deleted(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<(), AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        delete from oracle_table_rows where id in (select aggregate_id from evt)
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

pub async fn append_roll(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<OracleRollRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into oracle_rolls
            (id, session_id, user_id, display_name, kind, question, table_id, table_name, result, created_at)
        select aggregate_id,
               session_id,
               (metadata->>'user_id')::uuid,
               coalesce(metadata->>'display_name', 'Adventurer'),
               payload->>'kind',
               payload->>'question',
               nullif(payload->>'table_id', '')::uuid,
               payload->>'table_name',
               payload->'result',
               created_at
        from evt
        returning id, session_id, user_id, display_name, kind, question, table_id, table_name, result, created_at
        "#
    );

    sqlx::query_as(&sql)
        .bind(event.aggregate_type)
        .bind(event.aggregate_id)
        .bind(event.session_id)
        .bind(event.event_type)
        .bind(&event.payload)
        .bind(&event.metadata)
        .fetch_one(&mut **tx)
        .await
        .map_err(Into::into)
}
