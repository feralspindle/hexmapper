//! Projection of `session` events into the `sessions` read model. Full-snapshot
//! aggregate (created/updated/deleted). The three torch operations replicate the
//! old session_torch_* RPCs' server-side elapsed-time math, each recording a
//! `session.updated` snapshot.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'id')::uuid,
        {s}->>'name',
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz,
        ({s}->>'owner_id')::uuid,
        ({s}->>'map_hex_size')::int,
        ({s}->>'active_map_id')::uuid,
        ({s}->>'party_hex_q')::int,
        ({s}->>'party_hex_r')::int,
        ({s}->>'torch_running')::boolean,
        ({s}->>'torch_elapsed_ms')::bigint,
        ({s}->>'torch_started_at')::timestamptz,
        {s}->>'hex_mode',
        ({s}->>'gm_initiative')::integer,
        coalesce({s}->>'play_mode', 'gm'),
        coalesce(({s}->>'crawl_round')::integer, 0),
        coalesce(({s}->>'crawl_check_every')::integer, 3),
        coalesce({s}->'initiative_state', '{{"entries": [], "active_id": null, "round": 1}}'::jsonb)
        "#
    )
}

const COLS: &str = "id, name, created_at, updated_at, owner_id, map_hex_size, active_map_id, party_hex_q, party_hex_r, torch_running, torch_elapsed_ms, torch_started_at, hex_mode, gm_initiative, play_mode, crawl_round, crawl_check_every, initiative_state";

/// Wraps a `sessions` mutation that exposes `s` (the updated/inserted row) in a
/// `session.<event>` snapshot event. Returns the row JSON (or None if 0 rows).
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
            select 'session', s.id, s.id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'session' and e.aggregate_id = s.id), 0) + 1,
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
    owner_id: Uuid,
    name: &str,
    play_mode: &str,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with s as (
            insert into sessions (id, name, owner_id, play_mode) values ($1, $3, $4, $5) returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'session', s.id, s.id, 1, 'session.created', to_jsonb(s), $2 from s
        )
        select to_jsonb(s) from s
        "#,
    )
    .bind(id)
    .bind(metadata)
    .bind(name)
    .bind(owner_id)
    .bind(play_mode)
    .fetch_one(&mut **tx)
    .await?;
    Ok(row)
}

/// Partial update of session settings (name / active_map_id / hex_mode / map_hex_size
/// / party_hex). `case when patch ? 'key'` lets explicit nulls through.
pub async fn update(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    patch: &Value,
    metadata: &Value,
) -> Result<Option<Value>, AppError> {
    let cte = r#"
        update sessions set
            name          = case when $3 ? 'name' then $3->>'name' else name end,
            active_map_id = case when $3 ? 'active_map_id' then ($3->>'active_map_id')::uuid else active_map_id end,
            hex_mode      = case when $3 ? 'hex_mode' then $3->>'hex_mode' else hex_mode end,
            map_hex_size  = case when $3 ? 'map_hex_size' then ($3->>'map_hex_size')::int else map_hex_size end,
            party_hex_q   = case when $3 ? 'party_hex_q' then ($3->>'party_hex_q')::int else party_hex_q end,
            party_hex_r   = case when $3 ? 'party_hex_r' then ($3->>'party_hex_r')::int else party_hex_r end,
            gm_initiative = case when $3 ? 'gm_initiative' then ($3->>'gm_initiative')::integer else gm_initiative end,
            play_mode     = case when $3 ? 'play_mode' then $3->>'play_mode' else play_mode end,
            crawl_check_every = case when $3 ? 'crawl_check_every' then ($3->>'crawl_check_every')::integer else crawl_check_every end,
            updated_at    = now()
        where id = $1
        returning *
    "#;
    // $3 is the patch; bind it after the standard $1/$2 in a custom statement.
    let sql = format!(
        r#"
        with s as ( {cte} ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'session', s.id, s.id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'session' and e.aggregate_id = s.id), 0) + 1,
                'session.updated', to_jsonb(s), $2
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

pub async fn torch_start(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    metadata: &Value,
) -> Result<(), AppError> {
    run_event(tx, "update sessions set torch_running = true, torch_started_at = now() where id = $1 returning *", "session.updated", id, metadata).await?;
    Ok(())
}

pub async fn torch_pause(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    metadata: &Value,
) -> Result<(), AppError> {
    run_event(
        tx,
        r#"update sessions set
            torch_elapsed_ms = least(3600000, torch_elapsed_ms + (extract(epoch from (now() - torch_started_at)) * 1000)::bigint),
            torch_running = false,
            torch_started_at = null
        where id = $1 and torch_running = true and torch_started_at is not null
        returning *"#,
        "session.updated", id, metadata,
    ).await?;
    Ok(())
}

pub async fn torch_reset(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    metadata: &Value,
) -> Result<(), AppError> {
    run_event(
        tx,
        "update sessions set torch_elapsed_ms = 0, torch_started_at = case when torch_running then now() else null end where id = $1 returning *",
        "session.updated", id, metadata,
    ).await?;
    Ok(())
}

/// bump the crawling round and hand back the fresh session row so the handler
/// can run the encounter check against the new count
pub async fn crawl_advance(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    metadata: &Value,
) -> Result<Option<Value>, AppError> {
    run_event(
        tx,
        "update sessions set crawl_round = crawl_round + 1, updated_at = now() where id = $1 returning *",
        "session.updated", id, metadata,
    ).await
}

pub async fn crawl_reset(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    metadata: &Value,
) -> Result<Option<Value>, AppError> {
    run_event(
        tx,
        "update sessions set crawl_round = 0, updated_at = now() where id = $1 returning *",
        "session.updated", id, metadata,
    ).await
}

/// reads the initiative blob with a row lock so concurrent ops can't clobber
/// each other - the caller mutates and writes back in the same tx
pub async fn initiative_state_for_update(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
) -> Result<Option<Value>, AppError> {
    sqlx::query_scalar("select initiative_state from sessions where id = $1 for update")
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(Into::into)
}

pub async fn set_initiative_state(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    state: &Value,
    metadata: &Value,
) -> Result<Option<Value>, AppError> {
    let row: Option<Value> = sqlx::query_scalar(
        r#"
        with s as (
            update sessions set initiative_state = $3, updated_at = now() where id = $1 returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'session', s.id, s.id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'session' and e.aggregate_id = s.id), 0) + 1,
                'session.updated', to_jsonb(s), $2
            from s
        )
        select to_jsonb(s) from s
        "#,
    )
    .bind(id)
    .bind(metadata)
    .bind(state)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(row)
}

pub async fn delete(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    metadata: &Value,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with del as ( delete from sessions where id = $1 returning id ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'session', $1, $1,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'session' and e.aggregate_id = $1), 0) + 1,
                'session.deleted', '{}'::jsonb, $2
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
        where e.aggregate_type = 'session' and e.event_type in ('session.created', 'session.updated')
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'session' and d.aggregate_id = e.aggregate_id and d.event_type = 'session.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = snapshot_columns("e.payload"),
    )
}
