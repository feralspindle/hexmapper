//! Projection of `session_member` events into the `session_members` read model.
//! The table is composite-keyed (session_id, user_id) with no surrogate id, so the
//! aggregate_id is derived deterministically as `md5(session_id||user_id)::uuid`.
//! Full-snapshot (joined/updated); replay is latest-event-wins.
//!
//! `display_name` is set by the `fill_display_name` BEFORE trigger (keyed off
//! `user_id`, SECURITY DEFINER — so it resolves correctly on the service_role
//! connection where `auth.uid()` is null); `RETURNING *` captures it, so we never
//! write it ourselves. The `check_active_char_belongs_to_user` trigger validates
//! `active_character_id` on write.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'session_id')::uuid,
        ({s}->>'user_id')::uuid,
        ({s}->>'joined_at')::timestamptz,
        ({s}->>'last_seen_at')::timestamptz,
        ({s}->>'active_character_id')::uuid,
        {s}->>'display_name'
        "#
    )
}

const COLS: &str = "session_id, user_id, joined_at, last_seen_at, active_character_id, display_name";

/// A member joins (or re-touches) a session: upsert keyed by (session_id, user_id),
/// bumping last_seen_at. Records `session_member.joined`.
pub async fn join(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    user_id: Uuid,
    metadata: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with up as (
            insert into session_members (session_id, user_id, last_seen_at)
            values ($1, $2, now())
            on conflict (session_id, user_id) do update set last_seen_at = now()
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'session_member', md5(up.session_id::text || up.user_id::text)::uuid, up.session_id,
                coalesce((select max(sequence) from events e
                    where e.aggregate_type = 'session_member'
                      and e.aggregate_id = md5(up.session_id::text || up.user_id::text)::uuid), 0) + 1,
                'session_member.joined', to_jsonb(up), $3
            from up
        )
        select 1
        "#,
    )
    .bind(session_id).bind(user_id).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(())
}

/// Sets the caller's active character for a session (upsert). `active_character_id`
/// may be null (clearing). Records `session_member.updated`.
pub async fn set_active(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    user_id: Uuid,
    active_character_id: Option<Uuid>,
    metadata: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with up as (
            insert into session_members (session_id, user_id, active_character_id)
            values ($1, $2, $3)
            on conflict (session_id, user_id) do update set active_character_id = $3
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'session_member', md5(up.session_id::text || up.user_id::text)::uuid, up.session_id,
                coalesce((select max(sequence) from events e
                    where e.aggregate_type = 'session_member'
                      and e.aggregate_id = md5(up.session_id::text || up.user_id::text)::uuid), 0) + 1,
                'session_member.updated', to_jsonb(up), $4
            from up
        )
        select 1
        "#,
    )
    .bind(session_id).bind(user_id).bind(active_character_id).bind(metadata)
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
            where e.aggregate_type = 'session_member'
            order by e.aggregate_id, e.sequence desc
        ) latest
        where latest.event_type <> 'session_member.left'
        "#,
        cols = snapshot_columns("latest.payload"),
    )
}
