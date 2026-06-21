//! Integration test for the hex-cell projection against a real Postgres.
//!
//! Verifies the read-model write path (`upsert`), the GM-vs-player redaction in
//! `list`, the `is_revealed` edit gate, and that the append-only event log can
//! rebuild the read model via `replay_select`.
//!
//! Gated on `DATABASE_URL`: with no DB configured (e.g. a plain `cargo test`
//! locally) the test is skipped rather than failed. CI provides an ephemeral
//! Postgres service. It (re)creates a minimal `events` + `hex_cells` schema, so
//! point it ONLY at a throwaway database.

use hexmap_server::domains::hex::projection;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

const SCHEMA: &str = r#"
drop table if exists events;
drop table if exists hex_cells;

create table hex_cells (
    id            uuid primary key default gen_random_uuid(),
    session_id    uuid not null,
    map_id        uuid,
    q             int not null,
    r             int not null,
    label         text,
    notes         text,
    terrain_type  text,
    color         text,
    has_dungeon   boolean not null default false,
    source_client text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    revealed      boolean not null default false,
    marker_color  text,
    marker_label  text,
    gm_markers    text,
    unique (map_id, q, r)
);

create table events (
    id             bigserial primary key,
    aggregate_type text not null,
    aggregate_id   uuid not null,
    session_id     uuid,
    sequence       bigint not null,
    event_type     text not null,
    payload        jsonb not null,
    metadata       jsonb not null default '{}'::jsonb,
    created_at     timestamptz not null default now(),
    unique (aggregate_type, aggregate_id, sequence)
);
"#;

async fn setup() -> Option<PgPool> {
    let url = std::env::var("DATABASE_URL").ok()?;
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect to DATABASE_URL");
    sqlx::raw_sql(SCHEMA)
        .execute(&pool)
        .await
        .expect("create test schema");
    Some(pool)
}

async fn upsert(pool: &PgPool, session_id: Uuid, body: Value) -> Value {
    let mut tx = pool.begin().await.unwrap();
    let meta = json!({ "user_id": Uuid::new_v4(), "display_name": "Tester" });
    let row = projection::upsert(&mut tx, session_id, &body, &meta)
        .await
        .expect("upsert");
    tx.commit().await.unwrap();
    row
}

#[tokio::test]
async fn projection_redacts_for_players_and_replays_from_events() {
    let Some(pool) = setup().await else {
        eprintln!("skipping hex_projection test: DATABASE_URL not set");
        return;
    };

    let session_id = Uuid::new_v4();
    let map_id = Uuid::new_v4();

    let revealed = upsert(
        &pool,
        session_id,
        json!({
            "map_id": map_id, "q": 0, "r": 0,
            "terrain_type": "water", "revealed": true,
            "label": "Bree", "gm_markers": "[{\"kind\":\"trap\"}]",
            "source_client": "client-abc"
        }),
    )
    .await;
    assert_eq!(revealed["terrain_type"], "water");

    let _hidden = upsert(
        &pool,
        session_id,
        json!({
            "map_id": map_id, "q": 1, "r": 0,
            "terrain_type": "forest", "revealed": false,
            "gm_markers": "[{\"kind\":\"secret\"}]"
        }),
    )
    .await;

    // GM sees both cells with full data.
    let gm_view = projection::list(&pool, session_id, Some(map_id), true)
        .await
        .unwrap();
    let gm_cells = gm_view.as_array().unwrap();
    assert_eq!(gm_cells.len(), 2);
    assert!(gm_cells.iter().any(|c| c.get("gm_markers").is_some()));
    assert!(gm_cells.iter().any(|c| c.get("source_client").is_some()));

    // Players see only the revealed cell, with server-only fields stripped.
    let player_view = projection::list(&pool, session_id, Some(map_id), false)
        .await
        .unwrap();
    let player_cells = player_view.as_array().unwrap();
    assert_eq!(player_cells.len(), 1);
    assert_eq!(player_cells[0]["q"], 0);
    assert!(player_cells[0].get("gm_markers").is_none());
    assert!(player_cells[0].get("source_client").is_none());

    // is_revealed is the player edit gate.
    assert!(projection::is_revealed(&pool, map_id, 0, 0).await.unwrap());
    assert!(!projection::is_revealed(&pool, map_id, 1, 0).await.unwrap());
    assert!(!projection::is_revealed(&pool, map_id, 9, 9).await.unwrap());

    // Each upsert recorded an event.
    let event_count: i64 =
        sqlx::query_scalar("select count(*) from events where event_type = 'hex_cell.upserted'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(event_count, 2);

    // Replaying the event log into a shadow table reconstructs the read model.
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("create temp table shadow_hex (like hex_cells including defaults) on commit drop")
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query(&projection::replay_select("shadow_hex"))
        .execute(&mut *tx)
        .await
        .unwrap();
    let replayed: i64 = sqlx::query_scalar("select count(*) from shadow_hex")
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    let live: i64 = sqlx::query_scalar("select count(*) from hex_cells")
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    assert_eq!(replayed, live);
    assert_eq!(replayed, 2);
    tx.commit().await.unwrap();
}
