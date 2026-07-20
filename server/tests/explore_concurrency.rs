//! regression test for #55: concurrent generation must be canonical. two (here
//! eight) players entering the same unexplored hex at once produce exactly one
//! generated cell - the advisory lock + re-check in explore_in_tx makes the
//! first generation win and every other caller receives the already-generated
//! row, not a conflicting reroll.
//!
//! gated on `DATABASE_URL` like the other integration tests, skipped when no
//! db is configured, run against an ephemeral postgres in ci. it (re)creates
//! a minimal schema, so point it only at a throwaway db.

use std::collections::HashSet;
use std::sync::Arc;

use axum::extract::State;
use axum::Json;
use hexmap_server::auth::AuthUser;
use hexmap_server::domains::hex::handlers::{explore_hex, ExploreHexRequest};
use hexmap_server::state::AppState;
use jsonwebtoken::jwk::JwkSet;
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::sync::Barrier;
use uuid::Uuid;

const EXPLORERS: usize = 8;

const SCHEMA: &str = r#"
drop table if exists events;
drop table if exists session_oracle_tables;
drop table if exists oracle_table_rows;
drop table if exists oracle_tables;
drop table if exists hex_cells;
drop table if exists maps;
drop table if exists session_members;
drop table if exists sessions;

create table sessions (
    id        uuid primary key,
    owner_id  uuid not null,
    play_mode text not null default 'gm_less'
);

create table session_members (
    session_id uuid not null,
    user_id    uuid not null,
    primary key (session_id, user_id)
);

create table maps (
    id               uuid primary key,
    session_id       uuid not null,
    fog_reveal_all   boolean not null default false,
    exploration_mode boolean not null default true
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

create table oracle_tables (
    id          uuid primary key,
    created_by  uuid not null,
    name        text not null,
    description text not null default '',
    mode        text not null default 'weighted',
    tag         text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table oracle_table_rows (
    id          uuid primary key default gen_random_uuid(),
    table_id    uuid not null,
    weight      int not null default 1,
    range_min   int,
    range_max   int,
    result      text not null,
    notes       text not null default '',
    position    int not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table session_oracle_tables (
    id         uuid primary key default gen_random_uuid(),
    session_id uuid not null,
    table_id   uuid not null references oracle_tables(id) on delete cascade,
    added_by   uuid not null,
    created_at timestamptz not null default now(),
    unique (session_id, table_id)
);

create table events (
    id             bigint generated always as identity primary key,
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
    // every explorer needs to hold a connection at once or they serialize at
    // the pool and never actually contend on the hex
    let pool = PgPoolOptions::new()
        .max_connections(EXPLORERS as u32 + 2)
        .connect(&url)
        .await
        .expect("connect to DATABASE_URL");
    sqlx::raw_sql(SCHEMA)
        .execute(&pool)
        .await
        .expect("create test schema");
    Some(pool)
}

fn auth(user_id: Uuid) -> AuthUser {
    AuthUser {
        user_id,
        display_name: "Tester".into(),
        intent: None,
        request_id: "test-request".into(),
        client_id: None,
        app_version: None,
        trace_id: None,
        route: "TEST /explore".into(),
    }
}

#[tokio::test]
async fn concurrent_explores_generate_the_hex_exactly_once() {
    let Some(pool) = setup().await else {
        eprintln!("skipping explore_concurrency test: DATABASE_URL not set");
        return;
    };

    let owner = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    let map_id = Uuid::new_v4();
    sqlx::query("insert into sessions (id, owner_id, play_mode) values ($1, $2, 'gm_less')")
        .bind(session_id)
        .bind(owner)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("insert into maps (id, session_id, exploration_mode) values ($1, $2, true)")
        .bind(map_id)
        .bind(session_id)
        .execute(&pool)
        .await
        .unwrap();

    // a terrain table with distinct results so two generations would disagree
    let table_id = Uuid::new_v4();
    sqlx::query(
        "insert into oracle_tables (id, created_by, name, tag) values ($1, $2, 'Terrain', 'hex.terrain')",
    )
    .bind(table_id)
    .bind(owner)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "insert into session_oracle_tables (session_id, table_id, added_by) values ($1, $2, $3)",
    )
    .bind(session_id)
    .bind(table_id)
    .bind(owner)
    .execute(&pool)
    .await
    .unwrap();
    for terrain in ["plains", "forest", "mountain", "swamp", "desert", "snow"] {
        sqlx::query("insert into oracle_table_rows (table_id, result) values ($1, $2)")
            .bind(table_id)
            .bind(terrain)
            .execute(&pool)
            .await
            .unwrap();
    }

    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);
    let barrier = Arc::new(Barrier::new(EXPLORERS));
    let mut handles = Vec::new();
    for _ in 0..EXPLORERS {
        let state = state.clone();
        let barrier = barrier.clone();
        handles.push(tokio::spawn(async move {
            barrier.wait().await;
            explore_hex(
                State(state),
                auth(owner),
                Json(ExploreHexRequest {
                    session_id,
                    map_id,
                    q: 0,
                    r: 0,
                }),
            )
            .await
        }));
    }

    let mut terrains: HashSet<String> = HashSet::new();
    let mut labels: HashSet<String> = HashSet::new();
    for handle in handles {
        let Json(result) = handle.await.unwrap().expect("explore succeeds");
        let cell = result.get("cell").cloned().unwrap_or(Value::Null);
        assert!(cell.is_object(), "every explorer gets the cell back");
        terrains.insert(
            cell.get("terrain_type")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        );
        labels.insert(
            cell.get("label")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        );
    }

    // canonical: every caller saw the same generated content
    assert_eq!(terrains.len(), 1, "one terrain for everyone: {terrains:?}");
    assert_eq!(labels.len(), 1, "one label for everyone: {labels:?}");

    // and the database holds exactly one row, generated once
    let rows: i64 =
        sqlx::query_scalar("select count(*) from hex_cells where map_id = $1 and q = 0 and r = 0")
            .bind(map_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(rows, 1);

    let upserts: i64 = sqlx::query_scalar(
        "select count(*) from events where aggregate_type = 'hex_cell' and event_type = 'hex_cell.upserted'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(upserts, 1, "losers must not re-upsert the cell");
}
