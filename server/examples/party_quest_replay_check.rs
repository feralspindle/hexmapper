//! Replay-diff verification for the party_quest projection (Phase 8). Dry run:
//! backfills one genesis snapshot per row, replays the latest snapshot per
//! aggregate (deletes excluded) into a shadow table via the real
//! `projection::replay_select`, diffs against the live table, then rolls back.

use hexmap_server::domains::notebook::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'party_quest', q.id, q.session_id, 1, 'party_quest.created', to_jsonb(q),
  jsonb_build_object('user_id', null, 'genesis', true), q.created_at
from party_quests q
where not exists (select 1 from events e where e.aggregate_type = 'party_quest' and e.aggregate_id = q.id)
"#;

const SHADOW_DDL: &str = r#"
create temp table shadow_party_quests (like party_quests including defaults) on commit drop
"#;

const DIFF_COLS: &str = "id, session_id, title, description, goals, reward, completed, added_by_name, is_gm_added, display_order, source_client, created_at, updated_at, reward_qty, reward_type, rewards";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new().max_connections(1).connect(&database_url).await.expect("connect");
    let mut conn = pool.acquire().await.expect("acquire");
    let mut tx = conn.begin().await.expect("begin");

    let bf = sqlx::query(GENESIS).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis backfilled (dry run): {bf}");

    sqlx::query(SHADOW_DDL).execute(&mut *tx).await.expect("ddl");
    let replayed = sqlx::query(&projection::replay_select("shadow_party_quests")).execute(&mut *tx).await.expect("replay").rows_affected();
    let live: i64 = sqlx::query_scalar("select count(*) from party_quests").fetch_one(&mut *tx).await.unwrap();
    println!("replayed: {replayed}  |  live rows: {live}");

    let missing: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from party_quests except select {DIFF_COLS} from shadow_party_quests) d"
    )).fetch_one(&mut *tx).await.unwrap();
    let extra: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from shadow_party_quests except select {DIFF_COLS} from party_quests) d"
    )).fetch_one(&mut *tx).await.unwrap();
    println!("missing: {missing}, extra: {extra}");

    if missing == 0 && extra == 0 {
        println!("\n✅ replay is faithful — the event log fully reconstructs party_quests");
    } else {
        println!("\n❌ replay diverged");
    }

    tx.rollback().await.expect("rollback");
    println!("(transaction rolled back — nothing written)");
}
