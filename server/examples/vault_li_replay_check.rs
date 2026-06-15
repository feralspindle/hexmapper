//! Replay-diff verification for vault loot / items / bank_ledger (Phase 8). Dry run.

use hexmap_server::domains::vault::{item_projection, ledger_projection, loot_projection};
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const G_LOOT: &str = "insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at) select 'party_vault_loot', l.id, l.session_id, 1, 'party_vault_loot.created', to_jsonb(l), jsonb_build_object('user_id', null, 'genesis', true), l.created_at from party_vault_loot l where not exists (select 1 from events e where e.aggregate_type='party_vault_loot' and e.aggregate_id=l.id)";
const G_ITEM: &str = "insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at) select 'party_vault_item', i.id, i.session_id, 1, 'party_vault_item.created', to_jsonb(i), jsonb_build_object('user_id', null, 'genesis', true), i.created_at from party_vault_items i where not exists (select 1 from events e where e.aggregate_type='party_vault_item' and e.aggregate_id=i.id)";
const G_LEDGER: &str = "insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at) select 'party_bank_ledger', b.id, b.session_id, 1, 'party_bank_ledger.recorded', to_jsonb(b), jsonb_build_object('user_id', null, 'genesis', true), b.created_at from party_bank_ledger b where not exists (select 1 from events e where e.aggregate_type='party_bank_ledger' and e.aggregate_id=b.id)";

const LOOT_COLS: &str = "id, session_id, name, quantity, notes, added_by_name, source_client, created_at, loot_type, currency";
const ITEM_COLS: &str = "id, session_id, container, name, quantity, notes, added_by_name, source_client, created_at, container_id, slots, item_type, currency";
const LEDGER_COLS: &str = "id, session_id, description, character_name, display_name, gold_change, silver_change, copper_change, created_at";

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

    for g in [G_LOOT, G_ITEM, G_LEDGER] { sqlx::query(g).execute(&mut *tx).await.unwrap(); }
    sqlx::query("create temp table s_loot (like party_vault_loot including defaults) on commit drop").execute(&mut *tx).await.unwrap();
    sqlx::query("create temp table s_item (like party_vault_items including defaults) on commit drop").execute(&mut *tx).await.unwrap();
    sqlx::query("create temp table s_ledger (like party_bank_ledger including defaults) on commit drop").execute(&mut *tx).await.unwrap();
    sqlx::query(&loot_projection::replay_select("s_loot")).execute(&mut *tx).await.unwrap();
    sqlx::query(&item_projection::replay_select("s_item")).execute(&mut *tx).await.unwrap();
    sqlx::query(&ledger_projection::replay_select("s_ledger")).execute(&mut *tx).await.unwrap();

    let (lm, le) = diff(&mut tx, "party_vault_loot", "s_loot", LOOT_COLS).await;
    let (im, ie) = diff(&mut tx, "party_vault_items", "s_item", ITEM_COLS).await;
    let (dm, de) = diff(&mut tx, "party_bank_ledger", "s_ledger", LEDGER_COLS).await;
    println!("loot diff   — missing: {lm}, extra: {le}");
    println!("items diff  — missing: {im}, extra: {ie}");
    println!("ledger diff — missing: {dm}, extra: {de}");
    let ok = lm==0 && le==0 && im==0 && ie==0 && dm==0 && de==0;
    println!("{}", if ok { "✅ replay faithful (all 3)" } else { "❌ diverged" });

    tx.rollback().await.unwrap();
}
