use std::collections::HashSet;
use std::time::Duration;

use serde_json::Value;
use sqlx::postgres::PgListener;

use super::protocol::EventRow;
use crate::state::AppState;

pub fn spawn_event_listener(database_url: String, state: AppState) {
    tokio::spawn(async move {
        // Carrying the cursor across restarts lets the next listen() resume via
        // catch_up instead of re-seeding at max(id), so a listener blip no longer
        // needs disconnect_all() — clients keep their sockets and the missed
        // events are dispatched on recovery. Broadcasts and presence never flow
        // through this listener, so nothing else is lost during the gap.
        let mut resume_from: Option<i64> = None;
        loop {
            match listen(&database_url, &state, &mut resume_from).await {
                Ok(()) => tracing::warn!("realtime event listener ended"),
                Err(error) => tracing::error!(%error, "realtime event listener failed"),
            }
            metrics::counter!("realtime_listener_restarts_total").increment(1);
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}

const EVENT_BURST: &str = "select id, aggregate_type, aggregate_id, session_id, event_type, payload, metadata, created_at from events where id = $1 or id > $2 order by id";
const EVENTS_AFTER: &str = "select id, aggregate_type, aggregate_id, session_id, event_type, payload, metadata, created_at from events where id > $1 order by id";

/// Retries transient query failures before surfacing them; the caller's error
/// path restarts the listener and replays from the resume cursor.
async fn retry_query<T, Fut>(
    mut run: impl FnMut() -> Fut,
    what: &'static str,
) -> Result<T, sqlx::Error>
where
    Fut: std::future::Future<Output = Result<T, sqlx::Error>>,
{
    let mut attempt: u32 = 0;
    loop {
        match run().await {
            Ok(value) => return Ok(value),
            Err(error) if attempt < 2 => {
                attempt += 1;
                tracing::warn!(%error, what, attempt, "realtime listener query failed; retrying");
                tokio::time::sleep(Duration::from_millis(100 << attempt)).await;
            }
            Err(error) => return Err(error),
        }
    }
}

async fn dispatch_row(state: &AppState, mut row: EventRow) -> Result<(), sqlx::Error> {
    if row.aggregate_type == "dice_roll" {
        let roll_id = row.aggregate_id;
        if let Some(payload) = retry_query(
            || {
                sqlx::query_scalar::<_, Value>(
                    "select to_jsonb(dr) from dice_rolls dr where id = $1",
                )
                .bind(roll_id)
                .fetch_optional(state.pool())
            },
            "dice_roll_payload",
        )
        .await?
        {
            row.payload = payload;
        }
    }
    // visible_event decides per viewer but has no pool, so resolve fog state
    // for grid-anchored events here and stamp it into metadata - metadata
    // never reaches clients, the payload does (#153). Tokens, icons, and cell
    // notes all share the rule: on unrevealed ground the row is GM-only.
    let fog_coord_keys = match (row.aggregate_type.as_str(), row.event_type.as_str()) {
        ("dungeon_token", "dungeon_token.created" | "dungeon_token.updated") => Some(("x", "y")),
        ("dungeon_icon", "dungeon_icon.created" | "dungeon_icon.updated") => Some(("x", "y")),
        ("dungeon_cell_note", "dungeon_cell_note.created" | "dungeon_cell_note.edited") => {
            Some(("cell_x", "cell_y"))
        }
        _ => None,
    };
    if let Some((x_key, y_key)) = fog_coord_keys {
        let dungeon_id = row
            .payload
            .get("dungeon_id")
            .and_then(Value::as_str)
            .and_then(|s| s.parse::<uuid::Uuid>().ok());
        let cell = row
            .payload
            .get(x_key)
            .and_then(Value::as_i64)
            .zip(row.payload.get(y_key).and_then(Value::as_i64));
        if let (Some(dungeon_id), Some((x, y))) = (dungeon_id, cell) {
            let fogged: Option<bool> = retry_query(
                || {
                    sqlx::query_scalar(
                        r#"
                        select d.fog_mode and not d.fog_reveal_all and not exists (
                            select 1 from dungeon_fog_cells f
                            where f.dungeon_id = d.id and f.cell_x = $2 and f.cell_y = $3
                        )
                        from dungeons d where d.id = $1
                        "#,
                    )
                    .bind(dungeon_id)
                    .bind(x as i32)
                    .bind(y as i32)
                    .fetch_optional(state.pool())
                },
                "dungeon_cell_fog",
            )
            .await?;
            if let (Some(fogged), Value::Object(metadata)) = (fogged, &mut row.metadata) {
                metadata.insert("fogged".into(), Value::Bool(fogged));
            }
        }
    }
    let lag = (chrono::Utc::now() - row.created_at)
        .num_milliseconds()
        .max(0) as f64
        / 1000.0;
    metrics::histogram!("realtime_event_delivery_lag_seconds").record(lag);
    state.realtime().dispatch_event(row).await;
    Ok(())
}

/// Dispatches every event committed after `last_seen`, returning the new high-water
/// mark. Covers NOTIFYs lost while the listener connection was down. An event whose
/// id was assigned before the gap but committed during it can still slip through
/// (id order != commit order); that window is a single in-flight transaction.
async fn catch_up(state: &AppState, last_seen: i64) -> Result<i64, sqlx::Error> {
    let rows = retry_query(
        || {
            sqlx::query_as::<_, EventRow>(EVENTS_AFTER)
                .bind(last_seen)
                .fetch_all(state.pool())
        },
        "events_catch_up",
    )
    .await?;
    let mut max_seen = last_seen;
    let recovered = rows.len();
    for row in rows {
        max_seen = max_seen.max(row.id);
        dispatch_row(state, row).await?;
    }
    if recovered > 0 {
        metrics::counter!("realtime_events_recovered_total").increment(recovered as u64);
        tracing::warn!(
            recovered,
            "realtime listener dispatched events missed during reconnect"
        );
    }
    Ok(max_seen)
}

/// bookkeeping for burst dispatch. one NOTIFY triggers a scan that can pull in
/// rows whose own NOTIFYs are still in flight, so remember those ids and skip
/// them when they arrive. every event insert notifies exactly once, so entries
/// drain instead of accumulating.
struct BurstCursor {
    last_seen: i64,
    dispatched_ahead: HashSet<i64>,
}

impl BurstCursor {
    fn new(last_seen: i64) -> Self {
        Self {
            last_seen,
            dispatched_ahead: HashSet::new(),
        }
    }

    /// true if this notification's row still needs fetching, false if it
    /// already went out with an earlier burst scan
    fn needs_fetch(&mut self, id: i64) -> bool {
        !self.dispatched_ahead.remove(&id)
    }

    /// record a row dispatched by the scan for notification `notified_id`
    fn note_dispatched(&mut self, row_id: i64, notified_id: i64) {
        if row_id != notified_id {
            self.dispatched_ahead.insert(row_id);
        }
        self.last_seen = self.last_seen.max(row_id);
    }

    /// notifications for pending ids died with the old connection; catch_up
    /// owns everything past the new mark
    fn reset(&mut self, last_seen: i64) {
        self.last_seen = last_seen;
        self.dispatched_ahead.clear();
    }
}

async fn listen(
    database_url: &str,
    state: &AppState,
    resume_from: &mut Option<i64>,
) -> Result<(), sqlx::Error> {
    let mut listener = PgListener::connect(database_url).await?;
    listener.listen("hexmap_events").await?;
    let initial: i64 = match *resume_from {
        // a previous listen() dispatched through this id; deliver everything
        // that committed while the listener was down before taking NOTIFYs
        Some(last_seen) => catch_up(state, last_seen).await?,
        None => {
            retry_query(
                || {
                    sqlx::query_scalar("select coalesce(max(id), 0) from events")
                        .fetch_one(state.pool())
                },
                "max_event_id",
            )
            .await?
        }
    };
    *resume_from = Some(initial);
    let mut cursor = BurstCursor::new(initial);
    loop {
        // `try_recv` returns Ok(None) when the connection dropped and was silently
        // re-established — NOTIFYs sent during the gap are lost, so scan the events
        // table forward instead of trusting the stream. `recv` would swallow that
        // signal and clients would go permanently stale.
        match listener.try_recv().await? {
            Some(notification) => {
                let Ok(id) = notification.payload().parse::<i64>() else {
                    continue;
                };
                if !cursor.needs_fetch(id) {
                    continue;
                }
                // a bulk write (the fog brush, mostly) commits hundreds of event
                // rows at once and the trigger NOTIFYs per row. fetching one row
                // per notification meant one db round trip per cell, so players
                // watched a brush stroke reveal cell by cell. scan the whole
                // committed burst on its first notification instead. the id = $1
                // arm covers a row committed out of id order, which the range
                // scan would otherwise skip forever.
                let rows = retry_query(
                    || {
                        sqlx::query_as::<_, EventRow>(EVENT_BURST)
                            .bind(id)
                            .bind(cursor.last_seen)
                            .fetch_all(state.pool())
                    },
                    "event_burst",
                )
                .await?;
                for row in rows {
                    cursor.note_dispatched(row.id, id);
                    dispatch_row(state, row).await?;
                }
                // Under-advance on mid-burst failure is fine: a restart re-sends
                // the tail of the burst and clients apply row upserts by id.
                *resume_from = Some(cursor.last_seen);
            }
            None => {
                metrics::counter!("realtime_listener_reconnects_total").increment(1);
                tracing::warn!("realtime listener reconnected; scanning for missed events");
                let last_seen = catch_up(state, cursor.last_seen).await?;
                cursor.reset(last_seen);
                *resume_from = Some(last_seen);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn burst_cursor_skips_notifies_for_rows_already_dispatched() {
        let mut cursor = BurstCursor::new(10);
        // notify for 11 arrives, scan returns the whole burst 11..=13
        assert!(cursor.needs_fetch(11));
        for id in 11..=13 {
            cursor.note_dispatched(id, 11);
        }
        assert_eq!(cursor.last_seen, 13);
        // the burst's remaining notifies are already handled, a new event isn't
        assert!(!cursor.needs_fetch(12));
        assert!(!cursor.needs_fetch(13));
        assert!(cursor.needs_fetch(14));
    }

    #[test]
    fn burst_cursor_fetches_a_row_committed_out_of_id_order() {
        let mut cursor = BurstCursor::new(10);
        // 12 and 13 commit first, then 11 (id assigned earlier) commits late
        assert!(cursor.needs_fetch(12));
        cursor.note_dispatched(12, 12);
        cursor.note_dispatched(13, 12);
        assert!(cursor.needs_fetch(11));
        cursor.note_dispatched(11, 11);
        assert_eq!(cursor.last_seen, 13);
    }

    #[test]
    fn burst_cursor_reset_drops_pending_ids() {
        let mut cursor = BurstCursor::new(0);
        assert!(cursor.needs_fetch(1));
        cursor.note_dispatched(1, 1);
        cursor.note_dispatched(2, 1);
        // reconnect: id 2's notify is gone, catch_up owns everything past 5
        cursor.reset(5);
        assert_eq!(cursor.last_seen, 5);
        assert!(cursor.needs_fetch(2));
        assert!(cursor.needs_fetch(6));
    }
}
