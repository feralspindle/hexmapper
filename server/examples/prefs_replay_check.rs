//! Replay-diff verification for the prefs projection (Phase 8). Dry run: backfills
//! genesis snapshot events, replays the LATEST snapshot per user into a shadow
//! table via the real `projection::replay_select`, diffs against the live table,
//! then rolls back.

use hexmap_server::domains::prefs::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS_BACKFILL: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'user_preferences', up.user_id, null, 1, 'user_preferences.updated',
  jsonb_build_object(
    'dungeon_map_style', up.dungeon_map_style, 'dungeon_density', up.dungeon_density,
    'dungeon_palette', up.dungeon_palette, 'dungeon_icon_style', up.dungeon_icon_style,
    'dungeon_panel_layout', up.dungeon_panel_layout, 'dungeon_show_cursors', up.dungeon_show_cursors
  ),
  jsonb_build_object('user_id', up.user_id, 'genesis', true),
  up.updated_at
from user_preferences up
where not exists (
  select 1 from events e
  where e.aggregate_type = 'user_preferences' and e.aggregate_id = up.user_id
)
"#;

const SHADOW_DDL: &str = r#"
create temp table shadow_user_preferences (
  user_id              uuid,
  dungeon_map_style    text,
  dungeon_density      text,
  dungeon_palette      text,
  dungeon_icon_style   text,
  dungeon_panel_layout text,
  dungeon_show_cursors boolean,
  updated_at           timestamptz
) on commit drop
"#;

const DIFF_COLS: &str = "user_id, dungeon_map_style, dungeon_density, dungeon_palette, dungeon_icon_style, dungeon_panel_layout, dungeon_show_cursors, updated_at";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new().max_connections(1).connect(&database_url).await.expect("connect");
    let mut conn = pool.acquire().await.expect("acquire");
    let mut tx = conn.begin().await.expect("begin");

    let backfilled = sqlx::query(GENESIS_BACKFILL).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis events backfilled (this dry run): {backfilled}");

    let total_events: i64 = sqlx::query_scalar(
        "select count(*) from events where aggregate_type = 'user_preferences'",
    ).fetch_one(&mut *tx).await.unwrap();
    println!("total user_preferences.updated events in log (incl. history): {total_events}");

    sqlx::query(SHADOW_DDL).execute(&mut *tx).await.expect("create shadow");

    let replayed = sqlx::query(&projection::replay_select("shadow_user_preferences"))
        .execute(&mut *tx).await.expect("replay").rows_affected();
    println!("rows replayed (latest snapshot per user) into shadow: {replayed}");

    let live_count: i64 = sqlx::query_scalar("select count(*) from user_preferences").fetch_one(&mut *tx).await.unwrap();
    println!("live user_preferences rows: {live_count}");

    let missing: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from user_preferences except select {DIFF_COLS} from shadow_user_preferences) d"
    )).fetch_one(&mut *tx).await.unwrap();
    let extra: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from shadow_user_preferences except select {DIFF_COLS} from user_preferences) d"
    )).fetch_one(&mut *tx).await.unwrap();

    println!("live rows not reproduced by replay: {missing}");
    println!("replayed rows not matching a live row: {extra}");

    if missing == 0 && extra == 0 {
        println!("\n✅ replay is faithful — the latest snapshot per user reconstructs the user_preferences projection");
    } else {
        println!("\n❌ replay diverged — projection is NOT a faithful fold of the events");
    }

    tx.rollback().await.expect("rollback");
    println!("(transaction rolled back — nothing written)");
}
