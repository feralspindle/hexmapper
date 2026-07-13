//! Integration test for the hex-cell projection against a real Postgres.
//!
//! Verifies the read-model write path (`upsert`), the GM-vs-player redaction in
//! `list`, the `is_revealed` edit gate, and that the append-only event log can
//! rebuild the read model via `replay_select`.
//!
//! Gated on `DATABASE_URL`: with no DB configured (e.g. a plain `cargo test`
//! locally) the test is skipped rather than failed. CI provides an ephemeral
//! Postgres service. It (re)creates a minimal `events` + `maps` + `hex_cells`
//! schema, so point it ONLY at a throwaway database.

use hexmap_server::domains::hex::projection;
use hexmap_server::domains::notes::projection as notes_projection;
use hexmap_server::events::NewEvent;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

const SCHEMA: &str = r#"
drop table if exists events;
drop table if exists hex_notes;
drop table if exists hex_cells;
drop table if exists maps;
drop table if exists sessions;

create table sessions (
    id        uuid primary key,
    play_mode text not null default 'gm'
);

create table maps (
    id               uuid primary key,
    session_id       uuid not null,
    fog_reveal_all   boolean not null default false,
    exploration_mode boolean not null default false
);

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
    explored      boolean not null default true,
    unique (map_id, q, r)
);

create table hex_notes (
    id           uuid primary key,
    hex_cell_id  uuid not null,
    session_id   uuid not null,
    user_id      uuid not null,
    display_name text not null,
    body         text not null,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
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

async fn add_note(pool: &PgPool, session_id: Uuid, hex_cell_id: Uuid, body: &str) {
    let mut tx = pool.begin().await.unwrap();
    notes_projection::append_and_project(
        &mut tx,
        &NewEvent {
            aggregate_type: "hex_note",
            aggregate_id: Uuid::new_v4(),
            session_id: Some(session_id),
            event_type: "hex_note.created",
            payload: json!({ "hex_cell_id": hex_cell_id, "body": body }),
            metadata: json!({ "user_id": Uuid::new_v4(), "display_name": "Tester" }),
        },
    )
    .await
    .expect("append note");
    tx.commit().await.unwrap();
}

#[tokio::test]
async fn projection_redacts_for_players_and_replays_from_events() {
    let Some(pool) = setup().await else {
        eprintln!("skipping hex_projection test: DATABASE_URL not set");
        return;
    };

    let session_id = Uuid::new_v4();
    let map_id = Uuid::new_v4();

    sqlx::query("insert into sessions (id, play_mode) values ($1, 'gm_less')")
        .bind(session_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("insert into maps (id, session_id, fog_reveal_all) values ($1, $2, false)")
        .bind(map_id)
        .bind(session_id)
        .execute(&pool)
        .await
        .unwrap();

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

    let hidden = upsert(
        &pool,
        session_id,
        json!({
            "map_id": map_id, "q": 1, "r": 0,
            "terrain_type": "forest", "revealed": false,
            "gm_markers": "[{\"kind\":\"secret\"}]"
        }),
    )
    .await;

    let revealed_id = Uuid::parse_str(revealed["id"].as_str().unwrap()).unwrap();
    let hidden_id = Uuid::parse_str(hidden["id"].as_str().unwrap()).unwrap();
    add_note(&pool, session_id, revealed_id, "ford is passable in summer").await;
    add_note(&pool, session_id, revealed_id, "innkeeper owes the party").await;
    add_note(&pool, session_id, hidden_id, "ambush site").await;

    // GM sees both cells with full data, including note counts.
    let gm_view = projection::list(&pool, session_id, Some(map_id), true)
        .await
        .unwrap();
    let gm_cells = gm_view.as_array().unwrap();
    assert_eq!(gm_cells.len(), 2);
    assert!(gm_cells.iter().any(|c| c.get("gm_markers").is_some()));
    assert!(gm_cells.iter().any(|c| c.get("source_client").is_some()));
    assert_eq!(gm_cells.iter().find(|c| c["q"] == 0).unwrap()["note_count"], 2);
    assert_eq!(gm_cells.iter().find(|c| c["q"] == 1).unwrap()["note_count"], 1);

    // Players see only the revealed cell, with server-only fields stripped
    // but the player-visible note count kept.
    let player_view = projection::list(&pool, session_id, Some(map_id), false)
        .await
        .unwrap();
    let player_cells = player_view.as_array().unwrap();
    assert_eq!(player_cells.len(), 1);
    assert_eq!(player_cells[0]["q"], 0);
    assert!(player_cells[0].get("gm_markers").is_none());
    assert!(player_cells[0].get("source_client").is_none());
    assert_eq!(player_cells[0]["note_count"], 2);

    // is_revealed is the player edit gate before reveal-all is enabled.
    assert!(projection::is_revealed(&pool, map_id, 0, 0).await.unwrap());
    assert!(!projection::is_revealed(&pool, map_id, 1, 0).await.unwrap());
    assert!(!projection::is_revealed(&pool, map_id, 9, 9).await.unwrap());

    // Reveal-all makes missing cells visible by default, so hidden rows are sent
    // as minimal sentinels that override the map default without leaking content.
    sqlx::query("update maps set fog_reveal_all = true where id = $1")
        .bind(map_id)
        .execute(&pool)
        .await
        .unwrap();
    let reveal_all_player_view = projection::list(&pool, session_id, Some(map_id), false)
        .await
        .unwrap();
    let reveal_all_player_cells = reveal_all_player_view.as_array().unwrap();
    assert_eq!(reveal_all_player_cells.len(), 2);
    let hidden_sentinel = reveal_all_player_cells
        .iter()
        .find(|c| c["q"] == 1)
        .expect("hidden cell sentinel");
    assert_eq!(hidden_sentinel["revealed"], false);
    assert!(hidden_sentinel.get("terrain_type").is_none());
    assert!(hidden_sentinel.get("gm_markers").is_none());
    assert!(hidden_sentinel.get("source_client").is_none());
    assert!(hidden_sentinel.get("note_count").is_none());

    // The edit gate follows the same rule: explicit hidden cells stay hidden,
    // but missing cells inherit reveal-all visibility.
    assert!(projection::is_revealed(&pool, map_id, 0, 0).await.unwrap());
    assert!(!projection::is_revealed(&pool, map_id, 1, 0).await.unwrap());
    assert!(projection::is_revealed(&pool, map_id, 9, 9).await.unwrap());

    // A cell created under reveal-all with no explicit revealed flag (a player
    // picking terrain on an empty hex) inherits the map default instead of
    // becoming a hidden override that fogs itself (issue #107).
    let created_under_reveal_all = upsert(
        &pool,
        session_id,
        json!({ "map_id": map_id, "q": 3, "r": 0, "terrain_type": "plains" }),
    )
    .await;
    assert_eq!(created_under_reveal_all["revealed"], true);
    assert!(projection::is_revealed(&pool, map_id, 3, 0).await.unwrap());

    // ...while an update without the flag leaves an explicit hidden override alone.
    let hidden_update = upsert(
        &pool,
        session_id,
        json!({ "map_id": map_id, "q": 1, "r": 0, "label": "still hidden" }),
    )
    .await;
    assert_eq!(hidden_update["revealed"], false);

    // Unexplored cells are fogged for everyone, GM included: both views get a
    // minimal sentinel, and the cell is never player-editable.
    let _unexplored = upsert(
        &pool,
        session_id,
        json!({
            "map_id": map_id, "q": 2, "r": 0,
            "terrain_type": "swamp", "label": "Witch's hut",
            "revealed": false, "explored": false
        }),
    )
    .await;
    for include_gm_data in [true, false] {
        let view = projection::list(&pool, session_id, Some(map_id), include_gm_data)
            .await
            .unwrap();
        let sentinel = view
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["q"] == 2)
            .expect("unexplored sentinel")
            .clone();
        assert_eq!(sentinel["explored"], false);
        assert_eq!(sentinel["revealed"], false);
        assert!(sentinel.get("terrain_type").is_none());
        assert!(sentinel.get("label").is_none());
        assert!(sentinel.get("note_count").is_none());
    }
    assert!(!projection::is_revealed(&pool, map_id, 2, 0).await.unwrap());

    // Exploration mode removes the reveal-all default for missing cells: they
    // are unexplored, not blank-but-editable. That only applies in gm_less
    // play — a stale exploration flag in a GM-led session is inert, so a
    // play-mode switch can't lock members out of editing.
    sqlx::query("update maps set exploration_mode = true where id = $1")
        .bind(map_id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(!projection::is_revealed(&pool, map_id, 9, 9).await.unwrap());
    sqlx::query("update sessions set play_mode = 'gm' where id = $1")
        .bind(session_id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(projection::is_revealed(&pool, map_id, 9, 9).await.unwrap());
    sqlx::query("update sessions set play_mode = 'gm_less' where id = $1")
        .bind(session_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("update maps set exploration_mode = false where id = $1")
        .bind(map_id)
        .execute(&pool)
        .await
        .unwrap();

    // revealAll clears exploration fog so the escape hatch works in solo play.
    let mut tx = pool.begin().await.unwrap();
    projection::set_revealed(&mut tx, map_id, true, &json!({}))
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let cleared: bool =
        sqlx::query_scalar("select explored from hex_cells where map_id = $1 and q = 2 and r = 0")
            .bind(map_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(cleared);
    let mut tx = pool.begin().await.unwrap();
    projection::set_revealed(&mut tx, map_id, false, &json!({}))
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    projection::upsert(
        &mut tx,
        session_id,
        &json!({ "map_id": map_id, "q": 0, "r": 0, "revealed": true }),
        &json!({}),
    )
    .await
    .unwrap();
    projection::upsert(
        &mut tx,
        session_id,
        &json!({ "map_id": map_id, "q": 2, "r": 0, "revealed": false, "explored": false }),
        &json!({}),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    // Exactly one hex_cell.upserted event per write: 7 direct upserts
    // (q0, q1, q3, the q1 hidden-override update, q2, then the q0/q2 restores)
    // plus 6 from the two bulk set_revealed passes (reveal touches q1+q2;
    // hide touches all four).
    let event_count: i64 =
        sqlx::query_scalar("select count(*) from events where event_type = 'hex_cell.upserted'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(event_count, 13);

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
    assert_eq!(replayed, 4);
    let replayed_unexplored: bool =
        sqlx::query_scalar("select explored from shadow_hex where q = 2 and r = 0")
            .fetch_one(&mut *tx)
            .await
            .unwrap();
    assert!(
        !replayed_unexplored,
        "explored=false must survive event replay"
    );
    tx.commit().await.unwrap();
}
