//! Projection of `party_vault_item` events into `party_vault_items`. Create /
//! update (partial patch) / delete collection aggregate, full-snapshot events.
//!
//! Cross-aggregate wrinkle: `container_id` is `ON DELETE SET NULL` referencing
//! party_vault_containers, so [`replay_select`] reconstructs container_id as NULL
//! when the referenced container no longer lives — mirroring the FK.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

const COLS: &str = "id, session_id, container, name, quantity, notes, added_by_name, source_client, created_at, container_id, slots, item_type, currency";

#[allow(clippy::too_many_arguments)]
pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    container_id: Option<Uuid>,
    name: &str,
    quantity: i32,
    notes: &str,
    slots: i32,
    item_type: &str,
    currency: Option<&str>,
    added_by_name: &str,
    source_client: Option<&str>,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into party_vault_items (id, session_id, container_id, name, quantity, notes, slots, item_type, currency, added_by_name, source_client)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_vault_item', ins.id, ins.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'party_vault_item' and e.aggregate_id = ins.id), 0) + 1,
                'party_vault_item.created', to_jsonb(ins), $12
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id).bind(session_id).bind(container_id).bind(name).bind(quantity).bind(notes)
    .bind(slots).bind(item_type).bind(currency).bind(added_by_name).bind(source_client).bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

pub async fn update(tx: &mut Transaction<'_, Postgres>, id: Uuid, patch: &Value, metadata: &Value) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with upd as (
            update party_vault_items set
                name          = coalesce($2->>'name', name),
                quantity      = coalesce(($2->>'quantity')::int, quantity),
                notes         = coalesce($2->>'notes', notes),
                slots         = coalesce(($2->>'slots')::int, slots),
                item_type     = coalesce($2->>'item_type', item_type),
                currency      = coalesce($2->>'currency', currency),
                container_id  = case when $2 ? 'container_id' then ($2->>'container_id')::uuid else container_id end,
                source_client = $2->>'source_client'
            where id = $1
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_vault_item', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'party_vault_item' and e.aggregate_id = upd.id), 0) + 1,
                'party_vault_item.updated', to_jsonb(upd), $3
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
            delete from party_vault_items where id = $1 returning session_id
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_vault_item', $1, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'party_vault_item' and e.aggregate_id = $1), 0) + 1,
                'party_vault_item.deleted', '{}'::jsonb, $2
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
        select distinct on (e.aggregate_id)
            (e.payload->>'id')::uuid,
            (e.payload->>'session_id')::uuid,
            e.payload->>'container',
            e.payload->>'name',
            (e.payload->>'quantity')::int,
            e.payload->>'notes',
            e.payload->>'added_by_name',
            e.payload->>'source_client',
            (e.payload->>'created_at')::timestamptz,
            case
                when (e.payload->>'container_id') is null then null
                when exists (
                    select 1 from events rc
                    where rc.aggregate_type = 'party_vault_container'
                      and rc.aggregate_id = (e.payload->>'container_id')::uuid
                      and rc.event_type = 'party_vault_container.created'
                      and not exists (
                        select 1 from events d
                        where d.aggregate_type = 'party_vault_container'
                          and d.aggregate_id = rc.aggregate_id
                          and d.event_type = 'party_vault_container.deleted'
                      )
                ) then (e.payload->>'container_id')::uuid
                else null
            end,
            (e.payload->>'slots')::int,
            e.payload->>'item_type',
            e.payload->>'currency'
        from events e
        where e.aggregate_type = 'party_vault_item'
          and e.event_type in ('party_vault_item.created', 'party_vault_item.updated')
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'party_vault_item' and d.aggregate_id = e.aggregate_id
              and d.event_type = 'party_vault_item.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#
    )
}
