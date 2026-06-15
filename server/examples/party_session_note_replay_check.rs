//! Replay-diff verification for the party_session_note projection (Phase 8). Dry
//! run: genesis snapshot per row, replay latest snapshot per aggregate (deletes
//! excluded) into a shadow table, diff ALL columns, then roll back.

use hexmap_server::domains::notebook::session_note_projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'party_session_note', n.id, n.session_id, 1, 'party_session_note.created', to_jsonb(n),
  jsonb_build_object('user_id', null, 'genesis', true), n.created_at
from party_session_notes n
where not exists (select 1 from events e where e.aggregate_type = 'party_session_note' and e.aggregate_id = n.id)
"#;

const SHADOW_DDL: &str = "create temp table shadow_psn (like party_session_notes including defaults) on commit drop";
const DIFF_COLS: &str = "id, session_id, title, content, author_name, author_user_id, is_gm_author, source_client, created_at, updated_at";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let pool = PgPoolOptions::new().max_connections(1).connect(&env::var("DATABASE_URL").unwrap()).await.expect("connect");
    let mut conn = pool.acquire().await.unwrap();
    let mut tx = conn.begin().await.unwrap();

    let bf = sqlx::query(GENESIS).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis backfilled (dry run): {bf}");
    sqlx::query(SHADOW_DDL).execute(&mut *tx).await.expect("ddl");
    let r = sqlx::query(&session_note_projection::replay_select("shadow_psn")).execute(&mut *tx).await.expect("replay").rows_affected();
    let live: i64 = sqlx::query_scalar("select count(*) from party_session_notes").fetch_one(&mut *tx).await.unwrap();
    println!("replayed: {r}  |  live rows: {live}");

    let missing: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from party_session_notes except select {DIFF_COLS} from shadow_psn) d")).fetch_one(&mut *tx).await.unwrap();
    let extra: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from shadow_psn except select {DIFF_COLS} from party_session_notes) d")).fetch_one(&mut *tx).await.unwrap();
    println!("missing: {missing}, extra: {extra}");
    println!("{}", if missing == 0 && extra == 0 { "✅ replay faithful" } else { "❌ diverged" });

    tx.rollback().await.unwrap();
}
