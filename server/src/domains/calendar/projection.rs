//! Projection of calendar events into `party_calendar_settings` (one row per
//! session) and `party_calendar_days` (collection, keyed by session+date).
//!
//! Both are upsert-only, full-snapshot aggregates. The aggregate id is the row's
//! own id (the `on conflict` upsert preserves it across writes), determined inside
//! the CTE, so no separate identity scheme is needed. Replay = latest snapshot per
//! aggregate.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

// ---- party_calendar_settings --------------------------------------------

const SETTINGS_COLS: &str = "id, session_id, month_names, days_per_month, weekday_names, epoch_weekday, year_prefix, year_suffix, current_year, current_month, current_day, updated_at";

/// Upserts the per-session calendar settings (the client sends the complete
/// settings object) and records a `party_calendar_settings.updated` snapshot.
pub async fn update_settings(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    settings: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with up as (
            insert into party_calendar_settings (
                session_id, month_names, days_per_month, weekday_names, epoch_weekday,
                year_prefix, year_suffix, current_year, current_month, current_day, updated_at
            )
            values (
                $1, $2->'month_names', $2->'days_per_month', $2->'weekday_names', ($2->>'epoch_weekday')::int,
                $2->>'year_prefix', $2->>'year_suffix', ($2->>'current_year')::int, ($2->>'current_month')::int, ($2->>'current_day')::int, now()
            )
            on conflict (session_id) do update set
                month_names    = excluded.month_names,
                days_per_month = excluded.days_per_month,
                weekday_names  = excluded.weekday_names,
                epoch_weekday  = excluded.epoch_weekday,
                year_prefix    = excluded.year_prefix,
                year_suffix    = excluded.year_suffix,
                current_year   = excluded.current_year,
                current_month  = excluded.current_month,
                current_day    = excluded.current_day,
                updated_at     = now()
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_calendar_settings', up.id, up.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'party_calendar_settings' and e.aggregate_id = up.id), 0) + 1,
                'party_calendar_settings.updated', to_jsonb(up), $3
            from up
        )
        select to_jsonb(up) from up
        "#,
    )
    .bind(session_id)
    .bind(settings)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

pub fn replay_settings(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({SETTINGS_COLS})
        select distinct on (e.aggregate_id)
            (e.payload->>'id')::uuid,
            (e.payload->>'session_id')::uuid,
            e.payload->'month_names',
            e.payload->'days_per_month',
            e.payload->'weekday_names',
            (e.payload->>'epoch_weekday')::int,
            e.payload->>'year_prefix',
            e.payload->>'year_suffix',
            (e.payload->>'current_year')::int,
            (e.payload->>'current_month')::int,
            (e.payload->>'current_day')::int,
            (e.payload->>'updated_at')::timestamptz
        from events e
        where e.aggregate_type = 'party_calendar_settings' and e.event_type = 'party_calendar_settings.updated'
        order by e.aggregate_id, e.sequence desc
        "#
    )
}

// ---- party_calendar_days ------------------------------------------------

const DAY_COLS: &str = "id, session_id, year, month, day, weather, notes, updated_at";

/// Upserts a day annotation (partial patch: weather/notes) keyed by
/// (session, year, month, day) and records a `party_calendar_day.upserted` snapshot.
pub async fn upsert_day(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    year: i32,
    month: i32,
    day: i32,
    patch: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with up as (
            insert into party_calendar_days (session_id, year, month, day, weather, notes, updated_at)
            values ($1, $2, $3, $4, $5->>'weather', coalesce($5->>'notes', ''), now())
            on conflict (session_id, year, month, day) do update set
                weather    = coalesce($5->>'weather', party_calendar_days.weather),
                notes      = coalesce($5->>'notes', party_calendar_days.notes),
                updated_at = now()
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_calendar_day', up.id, up.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'party_calendar_day' and e.aggregate_id = up.id), 0) + 1,
                'party_calendar_day.upserted', to_jsonb(up), $6
            from up
        )
        select to_jsonb(up) from up
        "#,
    )
    .bind(session_id)
    .bind(year)
    .bind(month)
    .bind(day)
    .bind(patch)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

pub fn replay_days(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({DAY_COLS})
        select distinct on (e.aggregate_id)
            (e.payload->>'id')::uuid,
            (e.payload->>'session_id')::uuid,
            (e.payload->>'year')::int,
            (e.payload->>'month')::int,
            (e.payload->>'day')::int,
            e.payload->>'weather',
            e.payload->>'notes',
            (e.payload->>'updated_at')::timestamptz
        from events e
        where e.aggregate_type = 'party_calendar_day' and e.event_type = 'party_calendar_day.upserted'
        order by e.aggregate_id, e.sequence desc
        "#
    )
}
