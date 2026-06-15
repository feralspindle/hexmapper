//! Replay-diff verification for the chat projection (Phase 8). Dry run: backfills
//! genesis events, replays the event log into a shadow table via the real
//! `projection::replay_select`, diffs against the live table, then rolls back.
//! display_name is excluded (trigger-filled, not carried in the event).

use hexmap_server::domains::chat::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS_BACKFILL: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'chat_message', cm.id, cm.session_id, 1, 'chat_message.sent',
  jsonb_build_object('body', cm.body),
  jsonb_build_object('user_id', cm.user_id, 'genesis', true),
  cm.created_at
from chat_messages cm
where not exists (
  select 1 from events e
  where e.aggregate_type = 'chat_message' and e.aggregate_id = cm.id
)
"#;

const SHADOW_DDL: &str = r#"
create temp table shadow_chat_messages (
  id         uuid,
  session_id uuid,
  user_id    uuid,
  body       text,
  created_at timestamptz
) on commit drop
"#;

const DIFF_COLS: &str = "id, session_id, user_id, body, created_at";

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

    let replayed = sqlx::query(&projection::replay_select("shadow_chat_messages"))
        .execute(&mut *tx).await.expect("replay").rows_affected();
    println!("rows replayed from event log into shadow: {replayed}");

    let live_count: i64 = sqlx::query_scalar("select count(*) from chat_messages").fetch_one(&mut *tx).await.unwrap();
    println!("live chat_messages rows: {live_count}");

    let missing: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from chat_messages except select {DIFF_COLS} from shadow_chat_messages) d"
    )).fetch_one(&mut *tx).await.unwrap();
    let extra: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from shadow_chat_messages except select {DIFF_COLS} from chat_messages) d"
    )).fetch_one(&mut *tx).await.unwrap();

    println!("live rows not reproduced by replay: {missing}");
    println!("replayed rows not matching a live row: {extra}");

    if missing == 0 && extra == 0 {
        println!("\n✅ replay is faithful — the event log fully reconstructs the chat_messages projection");
    } else {
        println!("\n❌ replay diverged — projection is NOT a faithful fold of the events");
    }

    tx.rollback().await.expect("rollback");
    println!("(transaction rolled back — nothing written)");
}
