//! Replay-diff verification for the calendar domain (Phase 8). Dry run: genesis
//! snapshots for settings + days, replay latest snapshot per aggregate into shadow
//! tables via the real `projection::replay_*`, diff ALL columns, then roll back.

use hexmap_server::domains::calendar::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const G_SETTINGS: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'party_calendar_settings', s.id, s.session_id, 1, 'party_calendar_settings.updated', to_jsonb(s),
  jsonb_build_object('user_id', null, 'genesis', true), s.updated_at
from party_calendar_settings s
where not exists (select 1 from events e where e.aggregate_type = 'party_calendar_settings' and e.aggregate_id = s.id)
"#;
const G_DAYS: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'party_calendar_day', d.id, d.session_id, 1, 'party_calendar_day.upserted', to_jsonb(d),
  jsonb_build_object('user_id', null, 'genesis', true), d.updated_at
from party_calendar_days d
where not exists (select 1 from events e where e.aggregate_type = 'party_calendar_day' and e.aggregate_id = d.id)
"#;

const S_DDL: &str = "create temp table shadow_pcs (like party_calendar_settings including defaults) on commit drop";
const D_DDL: &str = "create temp table shadow_pcd (like party_calendar_days including defaults) on commit drop";
const S_COLS: &str = "id, session_id, month_names, days_per_month, weekday_names, epoch_weekday, year_prefix, year_suffix, current_year, current_month, current_day, updated_at";
const D_COLS: &str = "id, session_id, year, month, day, weather, notes, updated_at";

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

    let gs = sqlx::query(G_SETTINGS).execute(&mut *tx).await.unwrap().rows_affected();
    let gd = sqlx::query(G_DAYS).execute(&mut *tx).await.unwrap().rows_affected();
    println!("genesis backfilled (dry run): {gs} settings, {gd} days");

    sqlx::query(S_DDL).execute(&mut *tx).await.unwrap();
    sqlx::query(D_DDL).execute(&mut *tx).await.unwrap();
    let rs = sqlx::query(&projection::replay_settings("shadow_pcs")).execute(&mut *tx).await.unwrap().rows_affected();
    let rd = sqlx::query(&projection::replay_days("shadow_pcd")).execute(&mut *tx).await.unwrap().rows_affected();
    println!("replayed: {rs} settings, {rd} days");

    let (sm, se) = diff(&mut tx, "party_calendar_settings", "shadow_pcs", S_COLS).await;
    let (dm, de) = diff(&mut tx, "party_calendar_days", "shadow_pcd", D_COLS).await;
    println!("settings diff — missing: {sm}, extra: {se}");
    println!("days diff — missing: {dm}, extra: {de}");
    println!("{}", if sm==0 && se==0 && dm==0 && de==0 { "✅ replay faithful (both tables)" } else { "❌ diverged" });

    tx.rollback().await.unwrap();
}
