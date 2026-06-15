//! Projection of photo events into the `reference_photos` and `photo_broadcasts`
//! read models. Two aggregates:
//!
//! - `reference_photo` — lifecycle (`created`/`deleted`), like macros.
//! - `photo_broadcast` — append-only (`sent`).
//!
//! Cross-aggregate wrinkle: `photo_broadcasts.photo_id` has `ON DELETE SET NULL`,
//! so deleting a reference photo nulls the link in existing broadcasts. That side
//! effect isn't a photo_broadcast event, so [`replay_photo_broadcasts`] reconstructs
//! `photo_id` as NULL when the referenced photo no longer lives (no `created`, or a
//! later `deleted`), mirroring the FK exactly.

use sqlx::{Postgres, Transaction};

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::{BroadcastRow, PhotoRow};

// ---- reference_photo (lifecycle) -----------------------------------------

fn photo_columns(src: &str) -> String {
    format!(
        r#"
        {src}.aggregate_id,
        {src}.session_id::text,
        ({src}.metadata->>'user_id')::uuid,
        {src}.payload->>'name',
        {src}.payload->>'storage_path',
        {src}.created_at
        "#
    )
}

/// Appends `reference_photo.created` and folds it into `reference_photos` in one
/// round trip, returning the projected row.
pub async fn append_and_project_photo(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<PhotoRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into reference_photos (id, session_id, user_id, name, storage_path, created_at)
        select {cols}
        from evt
        returning id, session_id, user_id, name, storage_path, created_at
        "#,
        cols = photo_columns("evt"),
    );

    let row: PhotoRow = sqlx::query_as(&sql)
        .bind(event.aggregate_type)
        .bind(event.aggregate_id)
        .bind(event.session_id)
        .bind(event.event_type)
        .bind(&event.payload)
        .bind(&event.metadata)
        .fetch_one(&mut **tx)
        .await?;

    Ok(row)
}

/// Appends `reference_photo.deleted` and removes the projection row in one round
/// trip. (The FK then nulls photo_id on any referencing broadcasts.)
pub async fn append_and_unproject_photo(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<(), AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        delete from reference_photos where id in (select aggregate_id from evt)
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

/// Rebuilds `reference_photos`: every `created` aggregate with no later `deleted`.
pub fn replay_reference_photos(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} (id, session_id, user_id, name, storage_path, created_at)
        select {cols}
        from events e
        where e.aggregate_type = 'reference_photo' and e.event_type = 'reference_photo.created'
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'reference_photo'
              and d.aggregate_id = e.aggregate_id
              and d.event_type = 'reference_photo.deleted'
          )
        order by e.aggregate_id, e.sequence
        "#,
        cols = photo_columns("e"),
    )
}

// ---- photo_broadcast (append-only) ---------------------------------------

/// Appends `photo_broadcast.sent` and folds it into `photo_broadcasts` in one round
/// trip. photo_id comes straight from the payload (the photo exists at send time).
pub async fn append_and_project_broadcast(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<BroadcastRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into photo_broadcasts (id, session_id, user_id, photo_id, photo_url, photo_name, created_at)
        select
            evt.aggregate_id,
            evt.session_id::text,
            (evt.metadata->>'user_id')::uuid,
            (evt.payload->>'photo_id')::uuid,
            evt.payload->>'photo_url',
            evt.payload->>'photo_name',
            evt.created_at
        from evt
        returning id, session_id, user_id, photo_id, photo_url, photo_name, created_at
        "#
    );

    let row: BroadcastRow = sqlx::query_as(&sql)
        .bind(event.aggregate_type)
        .bind(event.aggregate_id)
        .bind(event.session_id)
        .bind(event.event_type)
        .bind(&event.payload)
        .bind(&event.metadata)
        .fetch_one(&mut **tx)
        .await?;

    Ok(row)
}

/// Rebuilds `photo_broadcasts` (append-only), reconstructing photo_id as NULL when
/// the referenced reference_photo no longer lives — mirroring ON DELETE SET NULL.
pub fn replay_photo_broadcasts(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} (id, session_id, user_id, photo_id, photo_url, photo_name, created_at)
        select
            e.aggregate_id,
            e.session_id::text,
            (e.metadata->>'user_id')::uuid,
            case when exists (
                select 1 from events rp
                where rp.aggregate_type = 'reference_photo'
                  and rp.aggregate_id = (e.payload->>'photo_id')::uuid
                  and rp.event_type = 'reference_photo.created'
                  and not exists (
                    select 1 from events d
                    where d.aggregate_type = 'reference_photo'
                      and d.aggregate_id = rp.aggregate_id
                      and d.event_type = 'reference_photo.deleted'
                  )
            ) then (e.payload->>'photo_id')::uuid else null end,
            e.payload->>'photo_url',
            e.payload->>'photo_name',
            e.created_at
        from events e
        where e.aggregate_type = 'photo_broadcast' and e.event_type = 'photo_broadcast.sent'
        order by e.aggregate_id, e.sequence
        "#
    )
}
