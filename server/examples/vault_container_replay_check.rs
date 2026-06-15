//! Replay-diff verification for party_vault_containers (Phase 8). Dry run.

use hexmap_server::domains::vault::container_projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'party_vault_container', c.id, c.session_id, 1, 'party_vault_container.created', to_jsonb(c),
  jsonb_build_object('user_id', null, 'genesis', true), c.created_at
from party_vault_containers c
where not exists (select 1 from events e where e.aggregate_type = 'party_vault_container' and e.aggregate_id = c.id)
"#;
const SHADOW_DDL: &str = "create temp table shadow_vc (like party_vault_containers including defaults) on commit drop";
const DIFF_COLS: &str = "id, session_id, name, gear_slots, source_client, created_at";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let pool = PgPoolOptions::new().max_connections(1).connect(&env::var("DATABASE_URL").unwrap()).await.expect("connect");
    let mut conn = pool.acquire().await.unwrap();
    let mut tx = conn.begin().await.unwrap();

    let bf = sqlx::query(GENESIS).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis backfilled (dry run): {bf}");
    sqlx::query(SHADOW_DDL).execute(&mut *tx).await.expect("ddl");
    let r = sqlx::query(&container_projection::replay_select("shadow_vc")).execute(&mut *tx).await.expect("replay").rows_affected();
    let live: i64 = sqlx::query_scalar("select count(*) from party_vault_containers").fetch_one(&mut *tx).await.unwrap();
    println!("replayed: {r}  |  live rows: {live}");
    let m: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from party_vault_containers except select {DIFF_COLS} from shadow_vc) d")).fetch_one(&mut *tx).await.unwrap();
    let e: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from shadow_vc except select {DIFF_COLS} from party_vault_containers) d")).fetch_one(&mut *tx).await.unwrap();
    println!("missing: {m}, extra: {e}");
    println!("{}", if m==0 && e==0 { "✅ replay faithful" } else { "❌ diverged" });
    tx.rollback().await.unwrap();
}
