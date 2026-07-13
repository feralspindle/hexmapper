//! Projection of `party_vault_activity.recorded` events into `party_vault_activity`.
//! Append-only. Like the ledger, the payload is the full projected row so replay
//! is self-contained; `display_name` and `character_name` are snapshots taken at
//! record time so later renames don't rewrite history.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

#[allow(clippy::too_many_arguments)]
pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    user_id: Uuid,
    display_name: &str,
    character_name: Option<&str>,
    verb: &str,
    what: &str,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into party_vault_activity (id, session_id, user_id, display_name, character_name, verb, what)
            values ($1, $2, $3, $4, $5, $6, $7)
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'party_vault_activity', ins.id, ins.session_id, 1, 'party_vault_activity.recorded', to_jsonb(ins), $8
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id).bind(session_id).bind(user_id).bind(display_name).bind(character_name)
    .bind(verb).bind(what).bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} (id, session_id, user_id, display_name, character_name, verb, what, created_at)
        select
            (e.payload->>'id')::uuid,
            (e.payload->>'session_id')::uuid,
            (e.payload->>'user_id')::uuid,
            e.payload->>'display_name',
            e.payload->>'character_name',
            e.payload->>'verb',
            e.payload->>'what',
            (e.payload->>'created_at')::timestamptz
        from events e
        where e.aggregate_type = 'party_vault_activity' and e.event_type = 'party_vault_activity.recorded'
        order by e.aggregate_id, e.sequence
        "#
    )
}
