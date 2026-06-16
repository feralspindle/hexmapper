//! Audits a Supabase project for event-sourcing migration completeness.
//! Read-only. Run against any project via DATABASE_URL:
//!   DATABASE_URL="<connection>" cargo run --example migration_audit

use sqlx::postgres::PgPoolOptions;
use sqlx::Row;
use std::env;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let host = url.split('@').nth(1).unwrap_or("?").split('/').next().unwrap_or("?");
    println!("auditing: {host}\n");
    let p = PgPoolOptions::new().max_connections(1).connect(&url).await.expect("connect");

    // events table present at all?
    let has_events: bool = sqlx::query_scalar("select to_regclass('public.events') is not null")
        .fetch_one(&p).await.unwrap();
    if !has_events {
        println!("❌ no `events` table — this project has NOT been migrated. Apply the event-sourcing set first.");
        return;
    }

    println!("=== event log by aggregate (genesis vs live) ===");
    for r in sqlx::query(
        "select aggregate_type,
           count(*) total,
           count(*) filter (where metadata->>'genesis'='true') genesis,
           count(*) filter (where metadata->>'genesis' is distinct from 'true') live,
           count(distinct aggregate_id) aggregates
         from events group by aggregate_type order by aggregate_type").fetch_all(&p).await.unwrap() {
        let at: String = r.get("aggregate_type");
        let (t, g, l, a): (i64, i64, i64, i64) = (r.get("total"), r.get("genesis"), r.get("live"), r.get("aggregates"));
        println!("  {at:<24} events={t:<6} genesis={g:<5} live={l:<5} aggregates={a}");
    }
    let evt_total: i64 = sqlx::query_scalar("select count(*) from events").fetch_one(&p).await.unwrap();
    println!("  TOTAL events: {evt_total}");

    println!("\n=== projection coverage (rows with no event = un-backfilled) ===");
    let checks: &[(&str, &str, &str)] = &[
        ("dice_roll", "dice_rolls", "t.id"), ("dice_roll_annotation", "dice_roll_annotations", "t.id"),
        ("chat_message", "chat_messages", "t.id"), ("dice_macro", "dice_macros", "t.id"),
        ("user_preferences", "user_preferences", "t.user_id"), ("reference_photo", "reference_photos", "t.id"),
        ("photo_broadcast", "photo_broadcasts", "t.id"), ("dungeon_activity", "dungeon_activity", "t.id"),
        ("hex_note", "hex_notes", "t.id"), ("dungeon_element_note", "dungeon_element_notes", "t.id"),
        ("party_quest", "party_quests", "t.id"), ("party_session_note", "party_session_notes", "t.id"),
        ("party_calendar_settings", "party_calendar_settings", "t.id"), ("party_calendar_day", "party_calendar_days", "t.id"),
        ("party_vault_container", "party_vault_containers", "t.id"), ("party_vault_loot", "party_vault_loot", "t.id"),
        ("party_vault_item", "party_vault_items", "t.id"), ("party_bank_ledger", "party_bank_ledger", "t.id"),
        ("character", "characters", "t.id"), ("character_sheet_log", "character_sheet_log", "t.id"),
        ("map", "maps", "t.id"), ("hex_cell", "hex_cells", "t.id"), ("session", "sessions", "t.id"),
        ("session_member", "session_members", "md5(t.session_id::text||t.user_id::text)::uuid"),
        ("dungeon", "dungeons", "t.id"), ("dungeon_room", "dungeon_rooms", "t.id"),
        ("dungeon_corridor", "dungeon_corridors", "t.id"), ("dungeon_fog_cell", "dungeon_fog_cells", "t.id"),
    ];
    let mut all_ok = true;
    for (agg, table, key) in checks {
        let rows: i64 = sqlx::query_scalar(&format!("select count(*) from {table}")).fetch_one(&p).await.unwrap();
        let missing: i64 = sqlx::query_scalar(&format!(
            "select count(*) from {table} t where not exists (select 1 from events e where e.aggregate_type='{agg}' and e.aggregate_id={key})"
        )).fetch_one(&p).await.unwrap();
        if missing > 0 { all_ok = false; }
        println!("  {table:<26} rows={rows:<6} no_event={missing}  {}", if missing == 0 { "✓" } else { "✗ GAP" });
    }
    println!("\n{}", if all_ok { "✅ every projection row is represented in the event log" } else { "❌ gaps — genesis backfill incomplete" });

    println!("\n=== replica identity (FULL needed for UPDATE/DELETE realtime under RLS) ===");
    for r in sqlx::query(
        "select relname, case relreplident when 'f' then 'full' when 'd' then 'default' else 'other' end ri
         from pg_class where relkind='r' and relnamespace='public'::regnamespace
           and relname in ('hex_cells','maps','sessions','dungeons','dungeon_rooms','dungeon_corridors','dungeon_fog_cells','hex_notes','dungeon_element_notes','session_members','characters')
         order by relname").fetch_all(&p).await.unwrap() {
        let (n, ri): (String, String) = (r.get("relname"), r.get("ri"));
        println!("  {n:<22} {ri}{}", if ri != "full" { "   ⚠ expected full" } else { "" });
    }

    let locked: i64 = sqlx::query_scalar("select count(*) from pg_policies where policyname like 'es_lock_%'").fetch_one(&p).await.unwrap();
    println!("\nRLS write-lock: {} es_lock policies -> {}", locked,
        if locked == 0 { "NOT locked (parallel run; old site writes allowed) ✓ for now" } else { "LOCKED (client writes blocked)" });
}
