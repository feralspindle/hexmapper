//! Projection of `dungeon_token` events into the `dungeon_tokens` read model.
//! Full-snapshot collection aggregate (created/updated/deleted). A token links
//! to a character or a stat block (exactly one); one token per
//! (dungeon_id, subject) — create() upserts on that pair, so re-placing a
//! subject's token moves the existing one instead of stacking a duplicate.
//! Replay is latest-event-wins; rows whose character or stat block was deleted
//! are dropped, mirroring the on delete cascade FKs.

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
        ({s}->>'character_id')::uuid,
        ({s}->>'stat_block_id')::uuid,
        ({s}->>'x')::int,
        ({s}->>'y')::int,
        {s}->>'source_client',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz
        "#
    )
}

const COLS: &str = "id, dungeon_id, session_id, character_id, stat_block_id, x, y, source_client, created_at, updated_at";

/// Place a token (insert, or update-on-conflict by dungeon_id+subject so a
/// second placement moves the existing token). `dungeon_id` and `session_id`
/// are resolved server-side; `body` carries character_id or stat_block_id plus
/// x/y/source_client. The conflict arbiter must match the link column: the
/// character pair is a full unique constraint, the stat block pair a partial
/// unique index.
pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    dungeon_id: Uuid,
    session_id: Uuid,
    body: &Value,
    metadata: &Value,
) -> Result<Value, AppError> {
    let conflict = if body.get("stat_block_id").and_then(Value::as_str).is_some() {
        "on conflict (dungeon_id, stat_block_id) where stat_block_id is not null"
    } else {
        "on conflict (dungeon_id, character_id)"
    };
    let sql = format!(
        r#"
        with up as (
            insert into dungeon_tokens (id, dungeon_id, session_id, character_id, stat_block_id, x, y, source_client)
            values (
                coalesce(($3->>'id')::uuid, gen_random_uuid()),
                $1, $2,
                ($3->>'character_id')::uuid,
                ($3->>'stat_block_id')::uuid,
                round(($3->>'x')::numeric)::int,
                round(($3->>'y')::numeric)::int,
                $3->>'source_client'
            )
            {conflict} do update set
                x = excluded.x, y = excluded.y,
                source_client = excluded.source_client,
                updated_at = now()
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_token', up.id, up.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_token' and e.aggregate_id = up.id), 0) + 1,
                'dungeon_token.created', to_jsonb(up), $4
            from up
        )
        select to_jsonb(up) from up
        "#
    );
    let row: Value = sqlx::query_scalar(&sql)
        .bind(dungeon_id).bind(session_id).bind(body).bind(metadata)
        .fetch_one(&mut **tx)
        .await?;
    Ok(row)
}

pub async fn update(tx: &mut Transaction<'_, Postgres>, id: Uuid, patch: &Value, metadata: &Value) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with upd as (
            update dungeon_tokens set
                x             = case when $2 ? 'x' then round(($2->>'x')::numeric)::int else x end,
                y             = case when $2 ? 'y' then round(($2->>'y')::numeric)::int else y end,
                source_client = case when $2 ? 'source_client' then $2->>'source_client' else source_client end,
                updated_at    = now()
            where id = $1
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_token', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_token' and e.aggregate_id = upd.id), 0) + 1,
                'dungeon_token.updated', to_jsonb(upd), $3
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
        with del as ( delete from dungeon_tokens where id = $1 returning id, session_id ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'dungeon_token', del.id, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'dungeon_token' and e.aggregate_id = del.id), 0) + 1,
                'dungeon_token.deleted', '{}'::jsonb, $2
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
    // the subject FKs are on delete cascade, so a deleted character or stat
    // block takes its tokens with it without a dungeon_token.deleted event;
    // replay mirrors that by dropping rows whose subject no longer exists
    // (same idea as the photo_broadcasts set-null reconstruction).
    format!(
        r#"
        insert into {target_table} ({COLS})
        select {cols}
        from (
            select distinct on (e.aggregate_id) e.event_type, e.payload
            from events e
            where e.aggregate_type = 'dungeon_token'
            order by e.aggregate_id, e.sequence desc
        ) latest
        where latest.event_type <> 'dungeon_token.deleted'
          and (
            exists (select 1 from characters c where c.id = (latest.payload->>'character_id')::uuid)
            or exists (select 1 from stat_blocks b where b.id = (latest.payload->>'stat_block_id')::uuid)
          )
        "#,
        cols = snapshot_columns("latest.payload"),
    )
}
