//! Replay-diff verification for characters + character_sheet_log (Phase 8). Dry run.

use hexmap_server::domains::character::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const G_CHAR: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'character', c.id, c.session_id, 1, 'character.created', to_jsonb(c),
  jsonb_build_object('user_id', c.user_id, 'genesis', true), c.created_at
from characters c
where not exists (select 1 from events e where e.aggregate_type = 'character' and e.aggregate_id = c.id)
"#;
const G_LOG: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'character_sheet_log', l.id, l.session_id, 1, 'character_sheet_log.recorded', to_jsonb(l),
  jsonb_build_object('user_id', l.user_id, 'genesis', true), l.created_at
from character_sheet_log l
where not exists (select 1 from events e where e.aggregate_type = 'character_sheet_log' and e.aggregate_id = l.id)
"#;

const C_DDL: &str = "create temp table shadow_chars (like characters including defaults) on commit drop";
const L_DDL: &str = "create temp table shadow_log (like character_sheet_log including defaults) on commit drop";
const C_COLS: &str = "id, session_id, user_id, data, created_at, updated_at";
const L_COLS: &str = "id, session_id, user_id, display_name, what, created_at";

async fn diff(tx: &mut sqlx::PgConnection, live: &str, shadow: &str, cols: &str) -> (i64, i64) {
    let m: i64 = sqlx::query_scalar(&format!("select count(*) from (select {cols} from {live} except select {cols} from {shadow}) d")).fetch_one(&mut *tx).await.unwrap();
    let e: i64 = sqlx::query_scalar(&format!("select count(*) from (select {cols} from {shadow} except select {cols} from {live}) d")).fetch_one(&mut *tx).await.unwrap();
    (m, e)
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let pool = PgPoolOptions::new().max_connections(1).connect(&env::var("DATABASE_URL").unwrap()).await.expect("connect");
    let mut conn = pool.acquire().await.unwrap();
    let mut tx = conn.begin().await.unwrap();

    let gc = sqlx::query(G_CHAR).execute(&mut *tx).await.unwrap().rows_affected();
    let gl = sqlx::query(G_LOG).execute(&mut *tx).await.unwrap().rows_affected();
    println!("genesis backfilled (dry run): {gc} characters, {gl} sheet-log");

    sqlx::query(C_DDL).execute(&mut *tx).await.unwrap();
    sqlx::query(L_DDL).execute(&mut *tx).await.unwrap();
    let rc = sqlx::query(&projection::replay_select("shadow_chars")).execute(&mut *tx).await.unwrap().rows_affected();
    let rl = sqlx::query(&projection::replay_sheet_log("shadow_log")).execute(&mut *tx).await.unwrap().rows_affected();
    let lc: i64 = sqlx::query_scalar("select count(*) from characters").fetch_one(&mut *tx).await.unwrap();
    let ll: i64 = sqlx::query_scalar("select count(*) from character_sheet_log").fetch_one(&mut *tx).await.unwrap();
    println!("replayed: {rc} characters (live {lc}), {rl} sheet-log (live {ll})");

    let (cm, ce) = diff(&mut tx, "characters", "shadow_chars", C_COLS).await;
    let (lm, le) = diff(&mut tx, "character_sheet_log", "shadow_log", L_COLS).await;
    println!("characters diff — missing: {cm}, extra: {ce}");
    println!("sheet-log diff — missing: {lm}, extra: {le}");
    println!("{}", if cm==0 && ce==0 && lm==0 && le==0 { "✅ replay faithful (both)" } else { "❌ diverged" });

    tx.rollback().await.unwrap();
}
