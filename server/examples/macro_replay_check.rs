//! Replay-diff verification for the macro projection (Phase 8). Dry run: backfills
//! genesis events, replays the event log into a shadow table via the real
//! `projection::replay_select` (which excludes aggregates with a later .deleted
//! event), diffs against the live table, then rolls back.

use hexmap_server::domains::macros::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS_BACKFILL: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'dice_macro', dm.id, null, 1, 'dice_macro.created',
  jsonb_build_object('label', dm.label, 'pending', dm.pending, 'modifier', dm.modifier),
  jsonb_build_object('user_id', dm.user_id, 'genesis', true),
  dm.created_at
from dice_macros dm
where not exists (
  select 1 from events e
  where e.aggregate_type = 'dice_macro' and e.aggregate_id = dm.id
)
"#;

const SHADOW_DDL: &str = r#"
create temp table shadow_dice_macros (
  id         uuid,
  user_id    uuid,
  label      text,
  pending    jsonb,
  modifier   int,
  created_at timestamptz
) on commit drop
"#;

const DIFF_COLS: &str = "id, user_id, label, pending, modifier, created_at";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new().max_connections(1).connect(&database_url).await.expect("connect");
    let mut conn = pool.acquire().await.expect("acquire");
    let mut tx = conn.begin().await.expect("begin");

    let backfilled = sqlx::query(GENESIS_BACKFILL).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis events backfilled (this dry run): {backfilled}");

    let deleted_events: i64 = sqlx::query_scalar(
        "select count(*) from events where aggregate_type = 'dice_macro' and event_type = 'dice_macro.deleted'",
    ).fetch_one(&mut *tx).await.unwrap();
    println!("dice_macro.deleted events in log (excluded by replay): {deleted_events}");

    sqlx::query(SHADOW_DDL).execute(&mut *tx).await.expect("create shadow");

    let replayed = sqlx::query(&projection::replay_select("shadow_dice_macros"))
        .execute(&mut *tx).await.expect("replay").rows_affected();
    println!("rows replayed from event log into shadow: {replayed}");

    let live_count: i64 = sqlx::query_scalar("select count(*) from dice_macros").fetch_one(&mut *tx).await.unwrap();
    println!("live dice_macros rows: {live_count}");

    let missing: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from dice_macros except select {DIFF_COLS} from shadow_dice_macros) d"
    )).fetch_one(&mut *tx).await.unwrap();
    let extra: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from shadow_dice_macros except select {DIFF_COLS} from dice_macros) d"
    )).fetch_one(&mut *tx).await.unwrap();

    println!("live rows not reproduced by replay: {missing}");
    println!("replayed rows not matching a live row: {extra}");

    if missing == 0 && extra == 0 {
        println!("\n✅ replay is faithful — the event log fully reconstructs the dice_macros projection (deletes excluded)");
    } else {
        println!("\n❌ replay diverged — projection is NOT a faithful fold of the events");
    }

    tx.rollback().await.expect("rollback");
    println!("(transaction rolled back — nothing written)");
}
