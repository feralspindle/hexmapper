//! integration tests for light source timers (#45): rounds ticking hits zero
//! and announces in chat exactly once, and a premature expire report for a
//! real-time source is rejected by the server's own clock.
//!
//! gated on `DATABASE_URL` like the other integration tests, skipped when no
//! db is configured, run against an ephemeral postgres in ci. it (re)creates
//! a minimal schema, so point it only at a throwaway db.

use axum::extract::{Path, State};
use axum::Json;
use hexmap_server::auth::AuthUser;
use hexmap_server::domains::light::handlers::{
    control_light, create_light, expire_light, tick_light, ControlRequest, CreateLightRequest,
    TickRequest,
};
use hexmap_server::state::AppState;
use jsonwebtoken::jwk::JwkSet;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

const SCHEMA: &str = r#"
create schema if not exists auth;
drop table if exists events;
drop table if exists chat_messages;
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
    id        uuid primary key,
    owner_id  uuid not null,
    play_mode text not null default 'gm_less'
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
    mode                  text not null default 'real_time',
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
        route: "TEST /light".into(),
    }
}

async fn fixture(pool: &PgPool) -> (AppState, Uuid, Uuid) {
    let owner = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    sqlx::query("insert into auth.users (id, email) values ($1, 'light@test')")
        .bind(owner)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("insert into sessions (id, owner_id) values ($1, $2)")
        .bind(session_id)
        .bind(owner)
        .execute(pool)
        .await
        .unwrap();
    (
        AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]),
        owner,
        session_id,
    )
}

fn torch_request(session_id: Uuid, mode: &str, duration_rounds: i32) -> CreateLightRequest {
    CreateLightRequest {
        session_id,
        name: "Torch".into(),
        kind: "torch".into(),
        mode: mode.into(),
        duration_ms: Some(3_600_000),
        duration_rounds: Some(duration_rounds),
        attached_character_id: None,
        attached_q: None,
        attached_r: None,
    }
}

#[tokio::test]
async fn rounds_tick_to_zero_expires_and_announces_once() {
    let Some(pool) = setup().await else {
        eprintln!("skipping light_sources test: DATABASE_URL not set");
        return;
    };
    let (state, owner, session_id) = fixture(&pool).await;

    let Json(light) = create_light(
        State(state.clone()),
        auth(owner),
        Json(torch_request(session_id, "rounds", 2)),
    )
    .await
    .expect("create");

    let Json(after_one) = tick_light(
        State(state.clone()),
        auth(owner),
        Path(light.id),
        Json(TickRequest { rounds: 1 }),
    )
    .await
    .expect("tick 1");
    assert!(!after_one.expired);

    let Json(after_two) = tick_light(
        State(state.clone()),
        auth(owner),
        Path(light.id),
        Json(TickRequest { rounds: 1 }),
    )
    .await
    .expect("tick 2");
    assert!(after_two.expired);

    // ticking a dead torch is a no-op, no second announcement
    let Json(after_three) = tick_light(
        State(state.clone()),
        auth(owner),
        Path(light.id),
        Json(TickRequest { rounds: 1 }),
    )
    .await
    .expect("tick 3");
    assert!(after_three.expired);
    assert_eq!(after_three.rounds_elapsed, 2);

    let announcements: i64 =
        sqlx::query_scalar("select count(*) from chat_messages where session_id = $1")
            .bind(session_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(announcements, 1, "gutters-out message posts exactly once");
}

#[tokio::test]
async fn premature_expire_report_is_rejected() {
    let Some(pool) = setup().await else {
        eprintln!("skipping light_sources test: DATABASE_URL not set");
        return;
    };
    let (state, owner, session_id) = fixture(&pool).await;

    let Json(light) = create_light(
        State(state.clone()),
        auth(owner),
        Json(torch_request(session_id, "real_time", 10)),
    )
    .await
    .expect("create");

    // start it, then immediately claim it expired - the server's own anchors
    // say there's ~an hour left
    control_light(
        State(state.clone()),
        auth(owner),
        Path(light.id),
        Json(ControlRequest {
            action: "start".into(),
        }),
    )
    .await
    .expect("start");

    let result = expire_light(State(state.clone()), auth(owner), Path(light.id)).await;
    assert!(result.is_err(), "server must not trust a premature report");

    let announcements: i64 =
        sqlx::query_scalar("select count(*) from chat_messages where session_id = $1")
            .bind(session_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(announcements, 0);
}
