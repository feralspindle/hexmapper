//! Optimistic-concurrency retry for the event-sourcing write path.
//!
//! Every command computes `next_sequence = max(sequence) + 1` for its aggregate and
//! appends at that sequence. Two concurrent commits to the *same* aggregate read the
//! same `max`, and the `events_aggregate_type_aggregate_id_sequence_key` unique
//! constraint makes the second insert raise `23505`. Rather than surface that as a
//! 500, [`retry_tx!`](crate::retry_tx) re-runs the whole transaction: a fresh `begin`
//! re-reads the now larger `max(sequence)` and appends at the next slot. This is the
//! standard optimistic-concurrency guard for an append-only log.
//!
//! Different aggregates never collide (each has its own `aggregate_id`), and
//! append-only aggregates always use a fresh id at sequence 1 — so the retry only
//! ever fires on genuine same-aggregate races (e.g. owner + GM saving one character,
//! or two players editing one dungeon room).

use crate::error::AppError;

/// Postgres-assigned name of the `unique (aggregate_type, aggregate_id, sequence)`
/// constraint on `events` (confirmed against the live DB via pg_constraint). Matching
/// on the *name* — not just the `23505` code — keeps the retry scoped to sequence
/// races: a unique violation on a projection's natural key (e.g. `hex_cells`'
/// `(map_id, q, r)`, or the `session_members` pk) is a real error, not retryable.
const EVENTS_SEQ_CONSTRAINT: &str = "events_aggregate_type_aggregate_id_sequence_key";

/// Max attempts before giving up with [`AppError::Conflict`] (409). Realistic
/// same-aggregate contention here is 2–3 writers (owner + GM, a couple of players);
/// the headroom covers bursty hot aggregates.
pub const MAX_ATTEMPTS: u32 = 8;

/// Sleeps a short randomized backoff between retries. Without jitter, all losers of a
/// sequence race wake and retry in lockstep and immediately re-collide (a thundering
/// herd); spreading them over a small exponential window lets them serialize. The
/// window is tiny (≤ ~32ms) — a same-region commit is sub-10ms, so this is cheap
/// insurance, not a latency tax on the common (uncontended) path, which never sleeps.
pub async fn backoff(attempt: u32) {
    use rand::Rng;
    let window_ms = 1u64 << attempt.min(5);
    let jitter = rand::thread_rng().gen_range(0..=window_ms);
    tokio::time::sleep(std::time::Duration::from_millis(jitter)).await;
}

/// True when `err` is a unique violation on the events sequence constraint — i.e. a
/// lost optimistic-concurrency race that retrying can resolve.
pub fn is_sequence_conflict(err: &AppError) -> bool {
    let AppError::Database(sqlx::Error::Database(db)) = err else {
        return false;
    };
    db.code().as_deref() == Some("23505") && db.constraint() == Some(EVENTS_SEQ_CONSTRAINT)
}

/// Records one retry on the `sequence_conflict_retries_total` counter (§11).
pub fn record_retry() {
    metrics::counter!("sequence_conflict_retries_total").increment(1);
}

/// Runs a single command transaction with optimistic-concurrency retry.
///
/// ```ignore
/// let row = retry_tx!(state.pool(), |tx| {
///     projection::update_data(tx, id, &req.data, &metadata).await
/// })?;
/// ```
///
/// The closure-shaped body receives a fresh `&mut Transaction` (bound to the name you
/// give, here `tx`) on each attempt and must evaluate to `Result<T, AppError>` — it
/// *is* the whole command (the single-CTE append+project). Keep authz and other
/// pool reads outside the macro. The body is re-executed from scratch on a sequence
/// conflict; a rolled-back transaction leaves no trace, so this is safe as long as
/// the body has no side effects outside the transaction (none of ours do — new row
/// ids are only minted on create paths, which never conflict).
///
/// Evaluates to `Result<T, AppError>`: on success the transaction is committed and
/// `Ok(value)` returned; a sequence conflict (from the append insert or, defensively,
/// from commit) rolls back and retries up to [`MAX_ATTEMPTS`]; any other error rolls
/// back and propagates; exhaustion yields `Err(AppError::Conflict)`. `?` inside the
/// body is scoped to the current attempt (it does not escape the retry loop).
#[macro_export]
macro_rules! retry_tx {
    ($pool:expr, |$tx:ident| $body:expr) => {{
        let __pool = $pool;
        let mut __attempt: u32 = 0;
        loop {
            let __last = __attempt + 1 == $crate::events::retry::MAX_ATTEMPTS;
            let mut $tx = match __pool.begin().await {
                ::core::result::Result::Ok(__t) => __t,
                ::core::result::Result::Err(__e) => {
                    break ::core::result::Result::Err::<_, $crate::error::AppError>(
                        $crate::error::AppError::from(__e),
                    )
                }
            };
            let __body_result: ::core::result::Result<_, $crate::error::AppError> =
                async { $body }.await;
            match __body_result {
                ::core::result::Result::Ok(__v) => match $tx.commit().await {
                    ::core::result::Result::Ok(()) => break ::core::result::Result::Ok(__v),
                    ::core::result::Result::Err(__e) => {
                        let __e = $crate::error::AppError::from(__e);
                        if $crate::events::retry::is_sequence_conflict(&__e) && !__last {
                            $crate::events::retry::record_retry();
                            $crate::events::retry::backoff(__attempt).await;
                            __attempt += 1;
                            continue;
                        }
                        break ::core::result::Result::Err(__e);
                    }
                },
                ::core::result::Result::Err(__e) => {
                    let _ = $tx.rollback().await;
                    if $crate::events::retry::is_sequence_conflict(&__e) && !__last {
                        $crate::events::retry::record_retry();
                        $crate::events::retry::backoff(__attempt).await;
                        __attempt += 1;
                        continue;
                    }
                    break ::core::result::Result::Err(__e);
                }
            }
        }
    }};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constraint_name_matches_live_db() {
        // Guards against the projection insert outgrowing this name; confirmed via
        // `select conname from pg_constraint where conrelid='events'::regclass`.
        assert_eq!(
            EVENTS_SEQ_CONSTRAINT,
            "events_aggregate_type_aggregate_id_sequence_key"
        );
    }

    #[test]
    fn non_database_errors_are_not_conflicts() {
        assert!(!is_sequence_conflict(&AppError::Conflict));
        assert!(!is_sequence_conflict(&AppError::NotFound));
        assert!(!is_sequence_conflict(&AppError::Forbidden));
    }
}
