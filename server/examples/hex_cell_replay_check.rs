//! Replay-diff verification for hex_cells (Phase 8). Dry run; diffs ALL columns.

use hexmap_server::domains::hex::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'hex_cell', h.id, h.session_id, 1, 'hex_cell.upserted', to_jsonb(h),
  jsonb_build_object('user_id', null, 'genesis', true), h.created_at
from hex_cells h
where not exists (select 1 from events e where e.aggregate_type = 'hex_cell' and e.aggregate_id = h.id)
"#;
const SHADOW_DDL: &str = "create temp table shadow_hex (like hex_cells including defaults) on commit drop";
const DIFF_COLS: &str = "id, session_id, q, r, label, notes, terrain_type, color, has_dungeon, source_client, created_at, updated_at, revealed, map_id, marker_color, marker_label, gm_markers";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let pool = PgPoolOptions::new().max_connections(1).connect(&env::var("DATABASE_URL").unwrap()).await.expect("connect");
    let mut conn = pool.acquire().await.unwrap();
    let mut tx = conn.begin().await.unwrap();

    let bf = sqlx::query(GENESIS).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis backfilled (dry run): {bf}");
    sqlx::query(SHADOW_DDL).execute(&mut *tx).await.unwrap();
    let r = sqlx::query(&projection::replay_select("shadow_hex")).execute(&mut *tx).await.unwrap().rows_affected();
    let live: i64 = sqlx::query_scalar("select count(*) from hex_cells").fetch_one(&mut *tx).await.unwrap();
    println!("replayed: {r}  |  live rows: {live}");
    let m: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from hex_cells except select {DIFF_COLS} from shadow_hex) d")).fetch_one(&mut *tx).await.unwrap();
    let e: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from shadow_hex except select {DIFF_COLS} from hex_cells) d")).fetch_one(&mut *tx).await.unwrap();
    println!("missing: {m}, extra: {e}");
    println!("{}", if m==0 && e==0 { "✅ replay faithful" } else { "❌ diverged" });
    tx.rollback().await.unwrap();
}
