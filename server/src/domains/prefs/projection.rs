//! Projection of `user_preferences.updated` events into the `user_preferences`
//! read model.
//!
//! First *mutable, multi-event* aggregate: the aggregate id is the user_id and
//! each event carries a full snapshot. The projection is an upsert; replay takes
//! the **latest** snapshot per user (see [`replay_select`]). `updated_at` is
//! derived from the event's `created_at` so it too is reproducible by replay.

use sqlx::{Postgres, Transaction};

use crate::error::AppError;
use crate::events::projector::APPEND_EVENT_CTE;
use crate::events::NewEvent;

use super::handlers::PrefsRow;

/// `user_preferences` columns, derived from an event row aliased `src`.
fn projection_columns(src: &str) -> String {
    format!(
        r#"
        {src}.aggregate_id,
        {src}.payload->>'dungeon_map_style',
        {src}.payload->>'dungeon_density',
        {src}.payload->>'dungeon_palette',
        {src}.payload->>'dungeon_icon_style',
        {src}.payload->>'dungeon_panel_layout',
        ({src}.payload->>'dungeon_show_cursors')::boolean,
        {src}.created_at
        "#
    )
}

const COLUMN_LIST: &str = r#"
    user_id, dungeon_map_style, dungeon_density, dungeon_palette,
    dungeon_icon_style, dungeon_panel_layout, dungeon_show_cursors, updated_at
"#;

/// Appends a `user_preferences.updated` event and folds it into `user_preferences`
/// (upsert) in a single round trip, returning the projected row.
pub async fn append_and_project(
    tx: &mut Transaction<'_, Postgres>,
    event: &NewEvent,
) -> Result<PrefsRow, AppError> {
    let sql = format!(
        r#"
        {APPEND_EVENT_CTE}
        insert into user_preferences ({COLUMN_LIST})
        select {cols}
        from evt
        on conflict (user_id) do update set
            dungeon_map_style    = excluded.dungeon_map_style,
            dungeon_density      = excluded.dungeon_density,
            dungeon_palette      = excluded.dungeon_palette,
            dungeon_icon_style   = excluded.dungeon_icon_style,
            dungeon_panel_layout = excluded.dungeon_panel_layout,
            dungeon_show_cursors = excluded.dungeon_show_cursors,
            updated_at           = excluded.updated_at
        returning {COLUMN_LIST}
        "#,
        cols = projection_columns("evt"),
    );

    let row: PrefsRow = sqlx::query_as(&sql)
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

/// SQL that rebuilds the `user_preferences` projection from the event log into
/// `target_table`: the latest snapshot per aggregate (user). Used by replay-diff
/// verification.
pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({COLUMN_LIST})
        select distinct on (e.aggregate_id) {cols}
        from events e
        where e.aggregate_type = 'user_preferences' and e.event_type = 'user_preferences.updated'
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = projection_columns("e"),
    )
}
