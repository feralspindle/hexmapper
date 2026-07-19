//! Replay-diff verification for stat_blocks. Dry run.

use hexmap_server::domains::statblock::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const DDL: &str = "create temp table shadow_stat_blocks (like stat_blocks including defaults) on commit drop";
const COLS: &str = "id, session_id, created_by, kind, data, created_at, updated_at";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let pool = PgPoolOptions::new().max_connections(1).connect(&env::var("DATABASE_URL").unwrap()).await.expect("connect");
    let mut conn = pool.acquire().await.unwrap();
    let mut tx = conn.begin().await.unwrap();

    sqlx::query(DDL).execute(&mut *tx).await.unwrap();
    let replayed = sqlx::query(&projection::replay_select("shadow_stat_blocks")).execute(&mut *tx).await.unwrap().rows_affected();
    let live: i64 = sqlx::query_scalar("select count(*) from stat_blocks").fetch_one(&mut *tx).await.unwrap();
    println!("replayed: {replayed} stat blocks (live {live})");

    let missing: i64 = sqlx::query_scalar(&format!("select count(*) from (select {COLS} from stat_blocks except select {COLS} from shadow_stat_blocks) d")).fetch_one(&mut *tx).await.unwrap();
    let extra: i64 = sqlx::query_scalar(&format!("select count(*) from (select {COLS} from shadow_stat_blocks except select {COLS} from stat_blocks) d")).fetch_one(&mut *tx).await.unwrap();
    println!("stat_blocks diff — missing: {missing}, extra: {extra}");
    println!("{}", if missing == 0 && extra == 0 { "✅ replay faithful" } else { "❌ diverged" });

    tx.rollback().await.unwrap();
}
