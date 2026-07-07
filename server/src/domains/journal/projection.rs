//! projection of `journal_entry` events into the `journal_entries` read model.
//! full-snapshot rows (created/updated/deleted), latest-event-wins on replay.

use sqlx::{Postgres, Transaction};

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::JournalEntryRow;

const RETURNING: &str = "id, session_id, author_user_id, author_name, kind, body, pin, game_date, created_at, updated_at";

pub async fn append_created(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<JournalEntryRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into journal_entries
            (id, session_id, author_user_id, author_name, kind, body, pin, game_date, created_at, updated_at)
        select aggregate_id,
               session_id,
               (metadata->>'user_id')::uuid,
               coalesce(payload->>'author_name', ''),
               coalesce(payload->>'kind', 'prose'),
               coalesce(payload->>'body', ''),
               payload->'pin',
               payload->'game_date',
               created_at,
               created_at
        from evt
        returning {RETURNING}
        "#
    );

    bind(sqlx::query_as(&sql), event)
        .fetch_one(&mut **tx)
        .await
        .map_err(Into::into)
}

pub async fn append_updated(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<JournalEntryRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        update journal_entries j set
            body = coalesce(evt.payload->>'body', j.body),
            updated_at = evt.created_at
        from evt
        where j.id = evt.aggregate_id
        returning j.id, j.session_id, j.author_user_id, j.author_name, j.kind, j.body, j.pin, j.game_date, j.created_at, j.updated_at
        "#
    );

    bind(sqlx::query_as(&sql), event)
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
        delete from journal_entries j using evt where j.id = evt.aggregate_id
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

fn bind<'q, O>(
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
