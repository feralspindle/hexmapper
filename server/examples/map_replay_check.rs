//! Replay-diff verification for maps (Phase 8). Dry run; diffs ALL columns.

use hexmap_server::domains::map::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'map', m.id, m.session_id, 1, 'map.created', to_jsonb(m),
  jsonb_build_object('user_id', null, 'genesis', true), m.created_at
from maps m
where not exists (select 1 from events e where e.aggregate_type = 'map' and e.aggregate_id = m.id)
"#;
const SHADOW_DDL: &str = "create temp table shadow_maps (like maps including defaults) on commit drop";
const DIFF_COLS: &str = "id, session_id, name, map_type, map_image_path, map_hex_width, map_hex_height, map_image_rotation, map_grid_rotation, map_image_offset_x, map_image_offset_y, map_grid_offset_x, map_grid_offset_y, map_offset_locked, created_at, fog_reveal_all, map_scale, map_scale_unit, map_image_scale, parent_map_id, parent_hex_id, party_hex_q, party_hex_r";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let pool = PgPoolOptions::new().max_connections(1).connect(&env::var("DATABASE_URL").unwrap()).await.expect("connect");
    let mut conn = pool.acquire().await.unwrap();
    let mut tx = conn.begin().await.unwrap();

    let bf = sqlx::query(GENESIS).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis backfilled (dry run): {bf}");
    sqlx::query(SHADOW_DDL).execute(&mut *tx).await.unwrap();
    let r = sqlx::query(&projection::replay_select("shadow_maps")).execute(&mut *tx).await.unwrap().rows_affected();
    let live: i64 = sqlx::query_scalar("select count(*) from maps").fetch_one(&mut *tx).await.unwrap();
    println!("replayed: {r}  |  live rows: {live}");
    let m: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from maps except select {DIFF_COLS} from shadow_maps) d")).fetch_one(&mut *tx).await.unwrap();
    let e: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from shadow_maps except select {DIFF_COLS} from maps) d")).fetch_one(&mut *tx).await.unwrap();
    println!("missing: {m}, extra: {e}");
    println!("{}", if m==0 && e==0 { "✅ replay faithful" } else { "❌ diverged" });
    tx.rollback().await.unwrap();
}
