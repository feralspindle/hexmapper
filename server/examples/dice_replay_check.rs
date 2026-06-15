//! Replay-diff verification for the dice projection (Phase 8).
//!
//! Proves the `dice_rolls` projection is a faithful fold of the event log:
//! inside a single transaction it (1) backfills genesis events for any rows that
//! lack them, (2) replays the whole event log into a shadow table via the real
//! `projection::replay_select`, and (3) diffs the shadow against the live table on
//! every event-derived column. The transaction is rolled back, so this writes
//! nothing — it is a dry run of "backfill + rebuild" against live data.
//!
//! display_name is excluded from the diff: it is a trigger-filled denormalized
//! snapshot of the user's name, not carried in the event.

use hexmap_server::domains::dice::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS_BACKFILL: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'dice_roll', dr.id, dr.session_id, 1, 'dice_roll.rolled',
  jsonb_build_object(
    'pending', dr.pending, 'modifier', dr.modifier, 'results', dr.results,
    'total', dr.total, 'label', dr.label, 'character_id', dr.character_id
  ),
  jsonb_build_object('user_id', dr.user_id, 'genesis', true),
  dr.created_at
from dice_rolls dr
where not exists (
  select 1 from events e
  where e.aggregate_type = 'dice_roll' and e.aggregate_id = dr.id
)
"#;

const SHADOW_DDL: &str = r#"
create temp table shadow_dice_rolls (
  id           uuid,
  session_id   uuid,
  user_id      uuid,
  pending      jsonb,
  modifier     int,
  results      jsonb,
  total        int,
  label        text,
  character_id uuid,
  created_at   timestamptz
) on commit drop
"#;

const DIFF_COLS: &str =
    "id, session_id, user_id, pending, modifier, results, total, label, character_id, created_at";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new().max_connections(1).connect(&database_url).await.expect("connect");
    let mut conn = pool.acquire().await.expect("acquire");
    let mut tx = conn.begin().await.expect("begin");

    let backfilled = sqlx::query(GENESIS_BACKFILL).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis events backfilled (this dry run): {backfilled}");

    sqlx::query(SHADOW_DDL).execute(&mut *tx).await.expect("create shadow");

    let replayed = sqlx::query(&projection::replay_select("shadow_dice_rolls"))
        .execute(&mut *tx).await.expect("replay").rows_affected();
    println!("rows replayed from event log into shadow: {replayed}");

    let live_count: i64 = sqlx::query_scalar("select count(*) from dice_rolls").fetch_one(&mut *tx).await.unwrap();
    println!("live dice_rolls rows: {live_count}");

    let missing: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from dice_rolls except select {DIFF_COLS} from shadow_dice_rolls) d"
    )).fetch_one(&mut *tx).await.unwrap();

    let extra: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from shadow_dice_rolls except select {DIFF_COLS} from dice_rolls) d"
    )).fetch_one(&mut *tx).await.unwrap();

    println!("live rows not reproduced by replay: {missing}");
    println!("replayed rows not matching a live row: {extra}");

    if missing == 0 && extra == 0 {
        println!("\n✅ replay is faithful — the event log fully reconstructs the dice_rolls projection");
    } else {
        println!("\n❌ replay diverged — projection is NOT a faithful fold of the events");
    }

    tx.rollback().await.expect("rollback");
    println!("(transaction rolled back — nothing written)");
}
