//! Replay-diff verification for the hex_note projection (Phase 8). Dry run:
//! backfills genesis events (created + conditional edited), replays the fold
//! (created + latest edit, deletes excluded) into a shadow table via the real
//! `projection::replay_select`, diffs against the live table, then rolls back.

use hexmap_server::domains::notes::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS_CREATED: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'hex_note', hn.id, hn.session_id, 1, 'hex_note.created',
  jsonb_build_object('hex_cell_id', hn.hex_cell_id, 'body', hn.body),
  jsonb_build_object('user_id', hn.user_id, 'display_name', hn.display_name, 'genesis', true),
  hn.created_at
from hex_notes hn
where not exists (select 1 from events e where e.aggregate_type = 'hex_note' and e.aggregate_id = hn.id)
"#;

const GENESIS_EDITED: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'hex_note', hn.id, hn.session_id, 2, 'hex_note.edited',
  jsonb_build_object('body', hn.body),
  jsonb_build_object('user_id', hn.user_id, 'genesis', true),
  hn.updated_at
from hex_notes hn
where hn.updated_at is distinct from hn.created_at
  and not exists (select 1 from events e where e.aggregate_type = 'hex_note' and e.aggregate_id = hn.id and e.event_type = 'hex_note.edited')
"#;

const SHADOW_DDL: &str = r#"
create temp table shadow_hex_notes (
  id uuid, hex_cell_id uuid, session_id uuid, user_id uuid,
  display_name text, body text, created_at timestamptz, updated_at timestamptz
) on commit drop
"#;

const DIFF_COLS: &str = "id, hex_cell_id, session_id, user_id, display_name, body, created_at, updated_at";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new().max_connections(1).connect(&database_url).await.expect("connect");
    let mut conn = pool.acquire().await.expect("acquire");
    let mut tx = conn.begin().await.expect("begin");

    let c = sqlx::query(GENESIS_CREATED).execute(&mut *tx).await.expect("created").rows_affected();
    let e = sqlx::query(GENESIS_EDITED).execute(&mut *tx).await.expect("edited").rows_affected();
    println!("genesis backfilled (dry run): {c} created, {e} edited");

    sqlx::query(SHADOW_DDL).execute(&mut *tx).await.expect("ddl");
    let replayed = sqlx::query(&projection::replay_select("shadow_hex_notes")).execute(&mut *tx).await.expect("replay").rows_affected();
    let live: i64 = sqlx::query_scalar("select count(*) from hex_notes").fetch_one(&mut *tx).await.unwrap();
    println!("replayed: {replayed}  |  live hex_notes rows: {live}");

    let missing: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from hex_notes except select {DIFF_COLS} from shadow_hex_notes) d"
    )).fetch_one(&mut *tx).await.unwrap();
    let extra: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from shadow_hex_notes except select {DIFF_COLS} from hex_notes) d"
    )).fetch_one(&mut *tx).await.unwrap();
    println!("missing: {missing}, extra: {extra}");

    if missing == 0 && extra == 0 {
        println!("\n✅ replay is faithful — the event log fully reconstructs hex_notes (created/edited/deleted fold)");
    } else {
        println!("\n❌ replay diverged");
    }

    tx.rollback().await.expect("rollback");
    println!("(transaction rolled back — nothing written)");
}
