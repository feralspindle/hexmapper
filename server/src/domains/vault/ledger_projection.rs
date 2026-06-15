//! Projection of `party_bank_ledger` events into `party_bank_ledger`. Append-only.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

#[allow(clippy::too_many_arguments)]
pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    description: &str,
    character_name: Option<&str>,
    display_name: &str,
    gold_change: i32,
    silver_change: i32,
    copper_change: i32,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into party_bank_ledger (id, session_id, description, character_name, display_name, gold_change, silver_change, copper_change)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_bank_ledger', ins.id, ins.session_id, 1, 'party_bank_ledger.recorded', to_jsonb(ins), $9
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id).bind(session_id).bind(description).bind(character_name).bind(display_name)
    .bind(gold_change).bind(silver_change).bind(copper_change).bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} (id, session_id, description, character_name, display_name, gold_change, silver_change, copper_change, created_at)
        select
            (e.payload->>'id')::uuid,
            (e.payload->>'session_id')::uuid,
            e.payload->>'description',
            e.payload->>'character_name',
            e.payload->>'display_name',
            (e.payload->>'gold_change')::int,
            (e.payload->>'silver_change')::int,
            (e.payload->>'copper_change')::int,
            (e.payload->>'created_at')::timestamptz
        from events e
        where e.aggregate_type = 'party_bank_ledger' and e.event_type = 'party_bank_ledger.recorded'
        order by e.aggregate_id, e.sequence
        "#
    )
}
