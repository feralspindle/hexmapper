use std::collections::{BTreeSet, HashSet};
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
        // through this listener, so nothing else is lost during the gap. The
        // gap set rides along so ids that committed out of order during the
        // outage are still delivered (#193).
        let mut resume: Option<(i64, BTreeSet<i64>)> = None;
        loop {
            match listen(&database_url, &state, &mut resume).await {
                Ok(()) => tracing::warn!("realtime event listener ended"),
                Err(error) => tracing::error!(%error, "realtime event listener failed"),
            }
            metrics::counter!("realtime_listener_restarts_total").increment(1);
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}

const EVENT_BURST: &str = "select id, aggregate_type, aggregate_id, session_id, event_type, payload, metadata, created_at from events where id = $1 or id > $2 order by id";
const EVENTS_AFTER: &str = "select id, aggregate_type, aggregate_id, session_id, event_type, payload, metadata, created_at from events where id > $1 or id = any($2) order by id";
const MAX_TRACKED_GAPS: usize = 1024;

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

    // oracle tables and their rows are user-owned aggregates with no session
    // of their own; fan their events out to every session the table is added
    // to, since the hub routes strictly by session and would drop them
    if row.session_id.is_none()
        && matches!(
            row.aggregate_type.as_str(),
            "oracle_table" | "oracle_table_row"
        )
    {
        let table_id = if row.aggregate_type == "oracle_table" {
            Some(row.aggregate_id)
        } else {
            row.payload
                .get("table_id")
                .and_then(Value::as_str)
                .and_then(|s| s.parse::<uuid::Uuid>().ok())
        };
        if let Some(table_id) = table_id {
            let sessions: Vec<uuid::Uuid> = retry_query(
                || {
                    sqlx::query_scalar(
                        "select session_id from session_oracle_tables where table_id = $1",
                    )
                    .bind(table_id)
                    .fetch_all(state.pool())
                },
                "oracle_table_sessions",
            )
            .await?;
            for session_id in sessions {
                let mut copy = row.clone();
                copy.session_id = Some(session_id);
                state.realtime().dispatch_event(copy).await;
            }
        }
        return Ok(());
    }

    state.realtime().dispatch_event(row).await;
    Ok(())
}

/// Dispatches every event committed after the cursor's high-water mark, plus
/// any tracked gap id (assigned before the mark but uncommitted when a scan
/// passed it) that has committed since. Covers NOTIFYs lost while the listener
/// connection was down, including a lower id that committed during the gap —
/// previously that id was skipped forever and clients stayed stale (#193).
async fn catch_up(state: &AppState, cursor: &mut BurstCursor) -> Result<(), sqlx::Error> {
    let last_seen = cursor.last_seen;
    let gap_ids: Vec<i64> = cursor.gaps.iter().copied().collect();
    let rows = retry_query(
        || {
            sqlx::query_as::<_, EventRow>(EVENTS_AFTER)
                .bind(last_seen)
                .bind(gap_ids.clone())
                .fetch_all(state.pool())
        },
        "events_catch_up",
    )
    .await?;
    let recovered = rows.len();
    for row in rows {
        cursor.note_dispatched(row.id, row.id);
        dispatch_row(state, row).await?;
    }
    if recovered > 0 {
        metrics::counter!("realtime_events_recovered_total").increment(recovered as u64);
        tracing::warn!(
            recovered,
            "realtime listener dispatched events missed during reconnect"
        );
    }
    Ok(())
}

/// bookkeeping for burst dispatch. one NOTIFY triggers a scan that can pull in
/// rows whose own NOTIFYs are still in flight, so remember those ids and skip
/// them when they arrive. every event insert notifies exactly once, so entries
/// drain instead of accumulating.
///
/// ids a scan advanced past without seeing (assigned but uncommitted — id
/// order != commit order) are tracked as gaps. while connected their own
/// NOTIFY delivers them via the `id = $1` arm of the burst query; across a
/// reconnect the NOTIFY is dead, so catch_up re-checks the gap set (#193). an
/// aborted transaction leaves a permanent gap, so the set prunes from the low
/// end instead of growing forever.
struct BurstCursor {
    last_seen: i64,
    dispatched_ahead: HashSet<i64>,
    gaps: BTreeSet<i64>,
}

impl BurstCursor {
    fn new(last_seen: i64) -> Self {
        Self::resume(last_seen, BTreeSet::new())
    }

    fn resume(last_seen: i64, gaps: BTreeSet<i64>) -> Self {
        Self {
            last_seen,
            dispatched_ahead: HashSet::new(),
            gaps,
        }
    }

    /// the state worth carrying across a listener restart: the high-water
    /// mark and the unresolved gaps below it
    fn snapshot(&self) -> (i64, BTreeSet<i64>) {
        (self.last_seen, self.gaps.clone())
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
        self.gaps.remove(&row_id);
        if row_id > self.last_seen {
            let floor = (self.last_seen + 1).max(row_id - MAX_TRACKED_GAPS as i64);
            for missing in floor..row_id {
                self.gaps.insert(missing);
            }
            self.last_seen = row_id;
        }
        while self.gaps.len() > MAX_TRACKED_GAPS {
            self.gaps.pop_first();
        }
    }
}

async fn listen(
    database_url: &str,
    state: &AppState,
    resume: &mut Option<(i64, BTreeSet<i64>)>,
) -> Result<(), sqlx::Error> {
    let mut listener = PgListener::connect(database_url).await?;
    listener.listen("hexmap_events").await?;
    let mut cursor = match resume.clone() {
        // a previous listen() dispatched through this state; deliver everything
        // that committed while the listener was down before taking NOTIFYs
        Some((last_seen, gaps)) => {
            let mut cursor = BurstCursor::resume(last_seen, gaps);
            catch_up(state, &mut cursor).await?;
            cursor
        }
        None => {
            let max_id: i64 = retry_query(
                || {
                    sqlx::query_scalar("select coalesce(max(id), 0) from events")
                        .fetch_one(state.pool())
                },
                "max_event_id",
            )
            .await?;
            BurstCursor::new(max_id)
        }
    };
    *resume = Some(cursor.snapshot());
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
                // Under-advance on mid-burst failure is fine: the resume state
                // only moves after a whole burst lands, so a restart re-sends
                // the tail and clients apply row upserts by id.
                *resume = Some(cursor.snapshot());
            }
            None => {
                metrics::counter!("realtime_listener_reconnects_total").increment(1);
                tracing::warn!("realtime listener reconnected; scanning for missed events");
                catch_up(state, &mut cursor).await?;
                // notifications for pending ids died with the old connection;
                // catch_up just covered everything they were tracking
                cursor.dispatched_ahead.clear();
                *resume = Some(cursor.snapshot());
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
    fn skipped_ids_are_tracked_as_gaps_until_dispatched() {
        let mut cursor = BurstCursor::new(10);
        // the scan for 13's notify returns only 13: 11 and 12 are in-flight
        cursor.note_dispatched(13, 13);
        assert_eq!(cursor.snapshot().1, BTreeSet::from([11, 12]));

        // 12 commits and gets dispatched (via notify or catch_up); 11 remains
        cursor.note_dispatched(12, 12);
        assert_eq!(cursor.snapshot().1, BTreeSet::from([11]));
        assert_eq!(cursor.last_seen, 13);
    }

    #[test]
    fn gaps_survive_a_snapshot_resume_across_reconnects() {
        // connection 1 sees 12 while 11 is still in an open transaction
        let mut cursor = BurstCursor::new(10);
        cursor.note_dispatched(12, 12);
        let (last_seen, gaps) = cursor.snapshot();

        // connection 2 resumes: catch_up queries `id > 12 or id = any([11])`,
        // so 11 committed during the outage is finally delivered
        let mut resumed = BurstCursor::resume(last_seen, gaps);
        assert!(resumed.gaps.contains(&11));
        resumed.note_dispatched(11, 11);
        assert!(resumed.gaps.is_empty());
        assert_eq!(resumed.last_seen, 12);
    }

    #[test]
    fn gap_tracking_is_bounded() {
        let mut cursor = BurstCursor::new(0);
        // a pathological jump only tracks the newest MAX_TRACKED_GAPS ids
        cursor.note_dispatched(5_000, 5_000);
        assert_eq!(cursor.gaps.len(), MAX_TRACKED_GAPS);
        assert_eq!(cursor.gaps.first(), Some(&(5_000 - MAX_TRACKED_GAPS as i64)));

        // further overflow prunes from the low end
        cursor.note_dispatched(6_500, 6_500);
        assert_eq!(cursor.gaps.len(), MAX_TRACKED_GAPS);
        assert_eq!(cursor.gaps.last(), Some(&6_499));
    }
}
