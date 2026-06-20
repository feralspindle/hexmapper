//! Projection of `dice_roll.rolled` events into the `dice_rolls` read model.
//!
//! This is the *only* place `dice_rolls` rows are written. Every column is derived
//! from the event (aggregate_id / session_id / payload / metadata / created_at), so
//! the same derivation drives both the live command path ([`append_and_project`])
//! and replay/rebuild ([`replay_select`]).

use sqlx::{Postgres, Transaction};

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::DiceRollRow;

/// The `dice_rolls` projection columns, derived from an event row aliased `src`.
/// `display_name` is intentionally omitted — it is filled by the
/// `fill_dice_display_name` trigger (a denormalized snapshot of the user's name at
/// insert time), not carried in the event.
fn projection_columns(src: &str, reconcile_character_fk: bool) -> String {
    let event_character_id = format!("nullif({src}.payload->>'character_id', '')::uuid");
    let character_id = if reconcile_character_fk {
        format!(
            "case when exists (select 1 from characters c where c.id = {event_character_id}) \
             then {event_character_id} else null end"
        )
    } else {
        event_character_id
    };

    format!(
        r#"
        {src}.aggregate_id,
        {src}.session_id,
        ({src}.metadata->>'user_id')::uuid,
        {src}.payload->'pending',
        ({src}.payload->>'modifier')::int,
        {src}.payload->'results',
        ({src}.payload->>'total')::int,
        {src}.payload->>'label',
        {character_id},
        {src}.created_at
        "#
    )
}

const PROJECTION_TARGET: &str = r#"
    dice_rolls (id, session_id, user_id, pending, modifier, results, total, label, character_id, created_at)
"#;

/// Appends a `dice_roll.rolled` event and folds it into `dice_rolls` in a single
/// round trip, returning the projected row (with the trigger-filled `display_name`).
pub async fn append_and_project(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<DiceRollRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into {PROJECTION_TARGET}
        select {cols}
        from evt
        returning id, session_id, user_id, display_name, pending, modifier, results, total, created_at, label, character_id
        "#,
        cols = projection_columns("evt", false),
    );

    let row: DiceRollRow = sqlx::query_as(&sql)
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

/// SQL that rebuilds the entire `dice_rolls` projection from the event log into
/// `target_table` (a shadow table with the same projected columns). Used by the
/// replay-diff verification; never targets the live table.
pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} (id, session_id, user_id, pending, modifier, results, total, label, character_id, created_at)
        select {cols}
        from events
        where aggregate_type = 'dice_roll' and event_type = 'dice_roll.rolled'
        order by aggregate_id, sequence
        "#,
        cols = projection_columns("events", true),
    )
}

#[cfg(test)]
mod tests {
    use super::replay_select;

    #[test]
    fn replay_nulls_character_ids_that_no_longer_exist() {
        let sql = replay_select("shadow_dice_rolls");

        assert!(sql.contains("exists (select 1 from characters"));
        assert!(sql.contains("then nullif(events.payload->>'character_id', '')::uuid else null"));
    }
}
