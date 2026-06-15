//! Projection of `party_vault_container` events into `party_vault_containers`.
//! Create + delete collection aggregate, full-snapshot events (see notebook
//! projection.rs for the pattern). Containers are not edited, so no update path.

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
        ({s}->>'gear_slots')::int,
        {s}->>'source_client',
        ({s}->>'created_at')::timestamptz
        "#
    )
}

const COLS: &str = "id, session_id, name, gear_slots, source_client, created_at";

pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    name: &str,
    gear_slots: i32,
    source_client: Option<&str>,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into party_vault_containers (id, session_id, name, gear_slots, source_client)
            values ($1, $2, $3, $4, $5)
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_vault_container', ins.id, ins.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'party_vault_container' and e.aggregate_id = ins.id), 0) + 1,
                'party_vault_container.created', to_jsonb(ins), $6
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id)
    .bind(session_id)
    .bind(name)
    .bind(gear_slots)
    .bind(source_client)
    .bind(metadata)
    .fetch_one(&mut **tx)
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
        with del as (
            delete from party_vault_containers where id = $1 returning session_id
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_vault_container', $1, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'party_vault_container' and e.aggregate_id = $1), 0) + 1,
                'party_vault_container.deleted', '{}'::jsonb, $2
            from del
        )
        select 1
        "#,
    )
    .bind(id)
    .bind(metadata)
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
        where e.aggregate_type = 'party_vault_container'
          and e.event_type = 'party_vault_container.created'
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'party_vault_container'
              and d.aggregate_id = e.aggregate_id
              and d.event_type = 'party_vault_container.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = snapshot_columns("e.payload"),
    )
}
