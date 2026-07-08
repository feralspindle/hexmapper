//! Projection of `party_vault_loot` events into `party_vault_loot`. Create /
//! update (partial patch) / delete collection aggregate, full-snapshot events
//! (see item_projection.rs pattern).

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
        ({s}->>'quantity')::int,
        {s}->>'notes',
        {s}->>'added_by_name',
        {s}->>'source_client',
        ({s}->>'created_at')::timestamptz,
        {s}->>'loot_type',
        {s}->>'currency'
        "#
    )
}

const COLS: &str = "id, session_id, name, quantity, notes, added_by_name, source_client, created_at, loot_type, currency";

#[allow(clippy::too_many_arguments)]
pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    name: &str,
    quantity: i32,
    notes: &str,
    loot_type: &str,
    currency: Option<&str>,
    added_by_name: &str,
    source_client: Option<&str>,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into party_vault_loot (id, session_id, name, quantity, notes, loot_type, currency, added_by_name, source_client)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_vault_loot', ins.id, ins.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'party_vault_loot' and e.aggregate_id = ins.id), 0) + 1,
                'party_vault_loot.created', to_jsonb(ins), $10
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id).bind(session_id).bind(name).bind(quantity).bind(notes)
    .bind(loot_type).bind(currency).bind(added_by_name).bind(source_client).bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

pub async fn update(tx: &mut Transaction<'_, Postgres>, id: Uuid, patch: &Value, metadata: &Value) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with upd as (
            update party_vault_loot set
                name          = coalesce($2->>'name', name),
                quantity      = coalesce(($2->>'quantity')::int, quantity),
                notes         = coalesce($2->>'notes', notes),
                loot_type     = coalesce($2->>'loot_type', loot_type),
                currency      = coalesce($2->>'currency', currency),
                source_client = $2->>'source_client'
            where id = $1
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_vault_loot', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'party_vault_loot' and e.aggregate_id = upd.id), 0) + 1,
                'party_vault_loot.updated', to_jsonb(upd), $3
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
        with del as (
            delete from party_vault_loot where id = $1 returning session_id
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_vault_loot', $1, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'party_vault_loot' and e.aggregate_id = $1), 0) + 1,
                'party_vault_loot.deleted', '{}'::jsonb, $2
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
        where e.aggregate_type = 'party_vault_loot'
          and e.event_type in ('party_vault_loot.created', 'party_vault_loot.updated')
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'party_vault_loot' and d.aggregate_id = e.aggregate_id
              and d.event_type = 'party_vault_loot.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = snapshot_columns("e.payload"),
    )
}
