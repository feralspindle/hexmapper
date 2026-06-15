//! Replay-diff verification for the `session_member` aggregate (Phase 8). Dry run
//! in a rolled-back tx: backfill genesis, replay into a shadow table, diff ALL cols.

use hexmap_server::domains::session::member_projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'session_member', md5(sm.session_id::text || sm.user_id::text)::uuid, sm.session_id, 1,
       'session_member.joined', to_jsonb(sm), jsonb_build_object('genesis', true), sm.joined_at
from session_members sm
where not exists (
  select 1 from events e where e.aggregate_type = 'session_member'
    and e.aggregate_id = md5(sm.session_id::text || sm.user_id::text)::uuid
)
"#;
const DIFF_COLS: &str = "session_id, user_id, joined_at, last_seen_at, active_character_id, display_name";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let pool = PgPoolOptions::new().max_connections(1).connect(&env::var("DATABASE_URL").unwrap()).await.expect("connect");
    let mut conn = pool.acquire().await.unwrap();
    let mut tx = conn.begin().await.unwrap();

    let bf = sqlx::query(GENESIS).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis backfilled (dry run): {bf}");
    sqlx::query("create temp table shadow_session_members (like session_members including defaults) on commit drop").execute(&mut *tx).await.unwrap();
    let r = sqlx::query(&member_projection::replay_select("shadow_session_members")).execute(&mut *tx).await.unwrap().rows_affected();
    let live: i64 = sqlx::query_scalar("select count(*) from session_members").fetch_one(&mut *tx).await.unwrap();
    let m: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from session_members except select {DIFF_COLS} from shadow_session_members) d")).fetch_one(&mut *tx).await.unwrap();
    let e: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from shadow_session_members except select {DIFF_COLS} from session_members) d")).fetch_one(&mut *tx).await.unwrap();
    println!("replayed={r}  live={live}  missing={m}  extra={e}");
    println!("{}", if m == 0 && e == 0 { "✅ replay faithful" } else { "❌ diverged" });
    tx.rollback().await.unwrap();
}
