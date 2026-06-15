//! Replay-diff verification for the activity projection (Phase 8). Dry run:
//! backfills genesis events (display_name preserved in metadata), replays the event
//! log into a shadow table via the real `projection::replay_select`, diffs against
//! the live table — including display_name, now that it is carried in the event —
//! then rolls back.

use hexmap_server::domains::activity::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const PATCH_DISPLAY_NAME: &str = r#"
update events e
set metadata = e.metadata || jsonb_build_object('display_name', da.display_name)
from dungeon_activity da
where e.aggregate_type = 'dungeon_activity'
  and e.event_type = 'dungeon_activity.recorded'
  and e.aggregate_id = da.id
  and not (e.metadata ? 'display_name')
"#;

const GENESIS_BACKFILL: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'dungeon_activity', da.id, d.session_id, 1, 'dungeon_activity.recorded',
  jsonb_build_object('dungeon_id', da.dungeon_id, 'verb', da.verb, 'what', da.what),
  jsonb_build_object('user_id', da.user_id, 'display_name', da.display_name, 'genesis', true),
  da.created_at
from dungeon_activity da
join dungeons d on d.id = da.dungeon_id
where not exists (
  select 1 from events e
  where e.aggregate_type = 'dungeon_activity' and e.aggregate_id = da.id
)
"#;

const SHADOW_DDL: &str = r#"
create temp table shadow_dungeon_activity (
  id           uuid,
  dungeon_id   uuid,
  user_id      uuid,
  display_name text,
  verb         text,
  what         text,
  created_at   timestamptz
) on commit drop
"#;

const DIFF_COLS: &str = "id, dungeon_id, user_id, display_name, verb, what, created_at";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new().max_connections(1).connect(&database_url).await.expect("connect");
    let mut conn = pool.acquire().await.expect("acquire");
    let mut tx = conn.begin().await.expect("begin");

    let patched = sqlx::query(PATCH_DISPLAY_NAME).execute(&mut *tx).await.expect("patch").rows_affected();
    println!("pre-existing events patched with display_name (this dry run): {patched}");

    let backfilled = sqlx::query(GENESIS_BACKFILL).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis events backfilled (this dry run): {backfilled}");

    sqlx::query(SHADOW_DDL).execute(&mut *tx).await.expect("create shadow");

    let replayed = sqlx::query(&projection::replay_select("shadow_dungeon_activity"))
        .execute(&mut *tx).await.expect("replay").rows_affected();
    println!("rows replayed from event log into shadow: {replayed}");

    let live_count: i64 = sqlx::query_scalar("select count(*) from dungeon_activity").fetch_one(&mut *tx).await.unwrap();
    println!("live dungeon_activity rows: {live_count}");

    let missing: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from dungeon_activity except select {DIFF_COLS} from shadow_dungeon_activity) d"
    )).fetch_one(&mut *tx).await.unwrap();
    let extra: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from shadow_dungeon_activity except select {DIFF_COLS} from dungeon_activity) d"
    )).fetch_one(&mut *tx).await.unwrap();

    println!("live rows not reproduced by replay: {missing}");
    println!("replayed rows not matching a live row: {extra}");

    if missing == 0 && extra == 0 {
        println!("\n✅ replay is faithful — the event log fully reconstructs dungeon_activity (incl. display_name)");
    } else {
        println!("\n❌ replay diverged — projection is NOT a faithful fold of the events");
    }

    tx.rollback().await.expect("rollback");
    println!("(transaction rolled back — nothing written)");
}
