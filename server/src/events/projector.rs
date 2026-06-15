//! Model-A (synchronous, in-transaction) event projection.
//!
//! In true event sourcing the event log is the source of truth and projection
//! rows are a *fold* of the events. The command path appends an event and, in the
//! same transaction (so Supabase Realtime keeps firing unchanged), derives the
//! projection row purely from that event.
//!
//! [`APPEND_EVENT_CTE`] is the shared head of that single round trip: it computes
//! the next per-aggregate sequence and inserts the event, exposing it as `evt`.
//! Each domain appends a projection statement that selects `from evt`, deriving
//! every projection column from the event's own fields — proving the event fully
//! determines the projection (which is what makes replay/rebuild possible).

/// CTE head that computes the next per-aggregate sequence and inserts the event,
/// exposing it as `evt(aggregate_id, session_id, payload, metadata, created_at)`.
///
/// Bind order: `$1` aggregate_type, `$2` aggregate_id, `$3` session_id,
/// `$4` event_type, `$5` payload, `$6` metadata.
///
/// A domain projection appends an `insert ... select <cols> from evt returning ...`
/// using the same `$1..$6` binds, so the whole command is one network round trip.
pub const APPEND_EVENT_CTE: &str = r#"
with seq as (
    select coalesce(max(sequence), 0) + 1 as next_seq
    from events
    where aggregate_type = $1 and aggregate_id = $2
),
evt as (
    insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
    values ($1, $2, $3, (select next_seq from seq), $4, $5, $6)
    returning aggregate_id, session_id, payload, metadata, created_at
)
"#;
