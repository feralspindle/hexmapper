//! Replay-diff verification for sessions (Phase 8). Dry run; diffs ALL columns.

use hexmap_server::domains::session::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'session', s.id, s.id, 1, 'session.created', to_jsonb(s),
  jsonb_build_object('user_id', s.owner_id, 'genesis', true), s.created_at
from sessions s
where not exists (select 1 from events e where e.aggregate_type = 'session' and e.aggregate_id = s.id)
"#;
const SHADOW_DDL: &str = "create temp table shadow_sessions (like sessions including defaults) on commit drop";
const DIFF_COLS: &str = "id, name, created_at, updated_at, owner_id, map_hex_size, active_map_id, party_hex_q, party_hex_r, torch_running, torch_elapsed_ms, torch_started_at, hex_mode, gm_initiative";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let pool = PgPoolOptions::new().max_connections(1).connect(&env::var("DATABASE_URL").unwrap()).await.expect("connect");
    let mut conn = pool.acquire().await.unwrap();
    let mut tx = conn.begin().await.unwrap();

    let bf = sqlx::query(GENESIS).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis backfilled (dry run): {bf}");
    sqlx::query(SHADOW_DDL).execute(&mut *tx).await.unwrap();
    let r = sqlx::query(&projection::replay_select("shadow_sessions")).execute(&mut *tx).await.unwrap().rows_affected();
    let live: i64 = sqlx::query_scalar("select count(*) from sessions").fetch_one(&mut *tx).await.unwrap();
    println!("replayed: {r}  |  live rows: {live}");
    let m: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from sessions except select {DIFF_COLS} from shadow_sessions) d")).fetch_one(&mut *tx).await.unwrap();
    let e: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from shadow_sessions except select {DIFF_COLS} from sessions) d")).fetch_one(&mut *tx).await.unwrap();
    println!("missing: {m}, extra: {e}");
    println!("{}", if m==0 && e==0 { "✅ replay faithful" } else { "❌ diverged" });
    tx.rollback().await.unwrap();
}
