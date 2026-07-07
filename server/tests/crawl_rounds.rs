//! integration tests for the crawling round tracker (#46): advancing bumps the
//! round, burns rounds-mode lights (announcing expiry once), and the encounter
//! check eventually fires and rolls the crawl.encounter table into the oracle
//! history.
//!
//! gated on `DATABASE_URL` like the other integration tests, skipped when no
//! db is configured, run against an ephemeral postgres in ci. it (re)creates
//! a minimal schema, so point it only at a throwaway db.

use axum::extract::{Path, State};
use axum::Json;
use hexmap_server::auth::AuthUser;
use hexmap_server::domains::session::handlers::{crawl_round, CrawlRequest};
use hexmap_server::state::AppState;
use jsonwebtoken::jwk::JwkSet;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

const SCHEMA: &str = r#"
create schema if not exists auth;
drop table if exists events;
drop table if exists chat_messages;
drop table if exists oracle_rolls;
drop table if exists oracle_table_rows;
drop table if exists oracle_tables;
drop table if exists light_sources;
drop table if exists session_members;
drop table if exists sessions;
drop table if exists auth.users;

create table auth.users (
    id                 uuid primary key,
    email              text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
);

create table sessions (
    id                uuid primary key,
    name              text not null default 'test',
    owner_id          uuid not null,
    play_mode         text not null default 'gm_less',
    crawl_round       int not null default 0,
    crawl_check_every int not null default 3,
    updated_at        timestamptz not null default now()
);

create table session_members (
    session_id uuid not null,
    user_id    uuid not null,
    primary key (session_id, user_id)
);

create table light_sources (
    id                    uuid primary key,
    session_id            uuid not null,
    created_by            uuid not null,
    name                  text not null,
    kind                  text not null default 'torch',
    mode                  text not null default 'rounds',
    duration_ms           bigint not null default 3600000,
    elapsed_ms            bigint not null default 0,
    running               boolean not null default false,
    started_at            timestamptz,
    duration_rounds       int not null default 10,
    rounds_elapsed        int not null default 0,
    expired               boolean not null default false,
    attached_character_id uuid,
    attached_q            int,
    attached_r            int,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create table oracle_tables (
    id          uuid primary key,
    session_id  uuid not null,
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
    subtable_id uuid,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table oracle_rolls (
    id           uuid primary key,
    session_id   uuid not null,
    user_id      uuid not null,
    display_name text not null default '',
    kind         text not null,
    question     text,
    table_id     uuid,
    table_name   text,
    result       jsonb not null,
    created_at   timestamptz not null default now()
);

create table chat_messages (
    id           uuid primary key,
    session_id   uuid not null,
    user_id      uuid,
    display_name text not null default '',
    body         text not null,
    created_at   timestamptz not null default now()
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

fn auth(user_id: Uuid) -> AuthUser {
    AuthUser {
        user_id,
        display_name: "Tester".into(),
        intent: None,
        request_id: "test-request".into(),
        client_id: None,
        app_version: None,
        trace_id: None,
        route: "TEST /crawl".into(),
    }
}

async fn fixture(pool: &PgPool, check_every: i32) -> (AppState, Uuid, Uuid) {
    let owner = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    sqlx::query("insert into auth.users (id, email) values ($1, 'crawl@test')")
        .bind(owner)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("insert into sessions (id, owner_id, crawl_check_every) values ($1, $2, $3)")
        .bind(session_id)
        .bind(owner)
        .bind(check_every)
        .execute(pool)
        .await
        .unwrap();
    (
        AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]),
        owner,
        session_id,
    )
}

async fn advance(state: &AppState, owner: Uuid, session_id: Uuid) -> serde_json::Value {
    let Json(result) = crawl_round(
        State(state.clone()),
        auth(owner),
        Path(session_id),
        Json(CrawlRequest {
            action: "advance".into(),
        }),
    )
    .await
    .expect("advance");
    result
}

#[tokio::test]
async fn advance_bumps_round_and_burns_lights_once() {
    let Some(pool) = setup().await else {
        eprintln!("skipping crawl_rounds test: DATABASE_URL not set");
        return;
    };
    // check off so the encounter die never fires here
    let (state, owner, session_id) = fixture(&pool, 0).await;

    // torch with 2 rounds left, plus a real_time lantern the tick must skip
    sqlx::query(
        "insert into light_sources (id, session_id, created_by, name, mode, duration_rounds, rounds_elapsed) values ($1, $2, $3, 'Torch', 'rounds', 2, 0)",
    )
    .bind(Uuid::new_v4())
    .bind(session_id)
    .bind(owner)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "insert into light_sources (id, session_id, created_by, name, mode) values ($1, $2, $3, 'Lantern', 'real_time')",
    )
    .bind(Uuid::new_v4())
    .bind(session_id)
    .bind(owner)
    .execute(&pool)
    .await
    .unwrap();

    let first = advance(&state, owner, session_id).await;
    assert_eq!(first["session"]["crawl_round"], 1);

    let second = advance(&state, owner, session_id).await;
    assert_eq!(second["session"]["crawl_round"], 2);

    // torch died on the second advance, exactly one announcement
    let (expired, announcements): (bool, i64) = (
        sqlx::query_scalar("select expired from light_sources where name = 'Torch'")
            .fetch_one(&pool)
            .await
            .unwrap(),
        sqlx::query_scalar("select count(*) from chat_messages where body like '%gutters out%'")
            .fetch_one(&pool)
            .await
            .unwrap(),
    );
    assert!(expired);
    assert_eq!(announcements, 1);

    // the real_time lantern is untouched
    let lantern_rounds: i32 =
        sqlx::query_scalar("select rounds_elapsed from light_sources where name = 'Lantern'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(lantern_rounds, 0);

    // a third advance has nothing left to burn and must not re-announce
    advance(&state, owner, session_id).await;
    let announcements: i64 =
        sqlx::query_scalar("select count(*) from chat_messages where body like '%gutters out%'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(announcements, 1);
}

#[tokio::test]
async fn encounter_check_eventually_fires_and_rolls_the_tagged_table() {
    let Some(pool) = setup().await else {
        eprintln!("skipping crawl_rounds test: DATABASE_URL not set");
        return;
    };
    let (state, owner, session_id) = fixture(&pool, 1).await;

    let table_id = Uuid::new_v4();
    sqlx::query(
        "insert into oracle_tables (id, session_id, created_by, name, tag) values ($1, $2, $3, 'Wandering', 'crawl.encounter')",
    )
    .bind(table_id)
    .bind(session_id)
    .bind(owner)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("insert into oracle_table_rows (table_id, result) values ($1, '2 ghouls')")
        .bind(table_id)
        .execute(&pool)
        .await
        .unwrap();

    // d6 hits a 1 in well under 200 tries or something is broken
    let mut hit = false;
    for _ in 0..200 {
        let result = advance(&state, owner, session_id).await;
        if result["encounter"]["hit"] == serde_json::json!(true) {
            hit = true;
            assert_eq!(result["encounter"]["result"], "2 ghouls");
            break;
        }
    }
    assert!(hit, "no encounter in 200 checked rounds");

    // the hit landed in oracle history and chat
    let rolls: i64 = sqlx::query_scalar(
        "select count(*) from oracle_rolls where session_id = $1 and table_name = 'Wandering'",
    )
    .bind(session_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(rolls >= 1);

    let chat: i64 = sqlx::query_scalar(
        "select count(*) from chat_messages where session_id = $1 and body like '%encounter!%'",
    )
    .bind(session_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(chat >= 1);
}
