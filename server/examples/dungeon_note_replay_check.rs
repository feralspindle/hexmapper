//! Replay-diff verification for the dungeon_element_note projection (Phase 8). Dry
//! run: backfills genesis events (created + conditional edited), replays the fold
//! into a shadow table via the real `dungeon_projection::replay_select`, diffs
//! against the live table, then rolls back.

use hexmap_server::domains::notes::dungeon_projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS_CREATED: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dungeon_element_note', dn.id, dn.session_id, 1, 'dungeon_element_note.created',
  jsonb_build_object('element_id', dn.element_id, 'element_type', dn.element_type, 'body', dn.body),
  jsonb_build_object('user_id', dn.user_id, 'display_name', dn.display_name, 'genesis', true),
  dn.created_at
from dungeon_element_notes dn
where not exists (select 1 from events e where e.aggregate_type = 'dungeon_element_note' and e.aggregate_id = dn.id)
"#;

const GENESIS_EDITED: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dungeon_element_note', dn.id, dn.session_id, 2, 'dungeon_element_note.edited',
  jsonb_build_object('body', dn.body),
  jsonb_build_object('user_id', dn.user_id, 'genesis', true),
  dn.updated_at
from dungeon_element_notes dn
where dn.updated_at is distinct from dn.created_at
  and not exists (select 1 from events e where e.aggregate_type = 'dungeon_element_note' and e.aggregate_id = dn.id and e.event_type = 'dungeon_element_note.edited')
"#;

const SHADOW_DDL: &str = r#"
create temp table shadow_dungeon_element_notes (
  id uuid, element_id uuid, element_type text, session_id uuid, user_id uuid,
  display_name text, body text, created_at timestamptz, updated_at timestamptz
) on commit drop
"#;

const DIFF_COLS: &str = "id, element_id, element_type, session_id, user_id, display_name, body, created_at, updated_at";

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
    let replayed = sqlx::query(&dungeon_projection::replay_select("shadow_dungeon_element_notes")).execute(&mut *tx).await.expect("replay").rows_affected();
    let live: i64 = sqlx::query_scalar("select count(*) from dungeon_element_notes").fetch_one(&mut *tx).await.unwrap();
    println!("replayed: {replayed}  |  live rows: {live}");

    let missing: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from dungeon_element_notes except select {DIFF_COLS} from shadow_dungeon_element_notes) d"
    )).fetch_one(&mut *tx).await.unwrap();
    let extra: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {DIFF_COLS} from shadow_dungeon_element_notes except select {DIFF_COLS} from dungeon_element_notes) d"
    )).fetch_one(&mut *tx).await.unwrap();
    println!("missing: {missing}, extra: {extra}");

    if missing == 0 && extra == 0 {
        println!("\n✅ replay is faithful — the event log fully reconstructs dungeon_element_notes");
    } else {
        println!("\n❌ replay diverged");
    }

    tx.rollback().await.expect("rollback");
    println!("(transaction rolled back — nothing written)");
}
