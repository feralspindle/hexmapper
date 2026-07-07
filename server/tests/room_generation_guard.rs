//! integration tests for the generated-room placement guard (#50/#55): a
//! create with reject_overlapping set 409s when the rect collides with an
//! existing room, while hand-drawn creates (no flag) can still overlap freely.
//!
//! gated on `DATABASE_URL` like the other integration tests, skipped when no
//! db is configured, run against an ephemeral postgres in ci. it (re)creates
//! a minimal schema, so point it only at a throwaway db.

use axum::extract::State;
use axum::Json;
use hexmap_server::auth::AuthUser;
use hexmap_server::domains::dungeon::handlers::create_room;
use hexmap_server::error::AppError;
use hexmap_server::state::AppState;
use jsonwebtoken::jwk::JwkSet;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

const SCHEMA: &str = r#"
drop table if exists events;
drop table if exists dungeon_rooms;
drop table if exists dungeons;
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

create table dungeons (
    id         uuid primary key,
    session_id uuid not null,
    name       text not null default 'test'
);

create table dungeon_rooms (
    id            uuid primary key default gen_random_uuid(),
    dungeon_id    uuid not null,
    session_id    uuid not null,
    origin_x      int not null,
    origin_y      int not null,
    width         int not null,
    height        int not null,
    label         text,
    notes         text,
    color         text,
    source_client text,
    items         jsonb not null default '[]'::jsonb,
    doors         jsonb not null default '[]'::jsonb,
    shape         text not null default 'rect',
    points        jsonb not null default '[]'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
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
        .max_connections(4)
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
        route: "TEST /rooms".into(),
    }
}

async fn fixture(pool: &PgPool) -> (AppState, Uuid, Uuid) {
    let owner = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    let dungeon_id = Uuid::new_v4();
    sqlx::query("insert into sessions (id, owner_id) values ($1, $2)")
        .bind(session_id)
        .bind(owner)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("insert into dungeons (id, session_id) values ($1, $2)")
        .bind(dungeon_id)
        .bind(session_id)
        .execute(pool)
        .await
        .unwrap();
    (
        AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]),
        owner,
        dungeon_id,
    )
}

fn room_body(dungeon_id: Uuid, x: i32, y: i32, w: i32, h: i32, guarded: bool) -> serde_json::Value {
    json!({
        "dungeon_id": dungeon_id,
        "origin_x": x, "origin_y": y, "width": w, "height": h,
        "shape": "rect",
        "reject_overlapping": guarded,
    })
}

#[tokio::test]
async fn guarded_create_rejects_overlap_and_freehand_does_not() {
    let Some(pool) = setup().await else {
        eprintln!("skipping room_generation_guard test: DATABASE_URL not set");
        return;
    };
    let (state, owner, dungeon_id) = fixture(&pool).await;

    // first generated room lands
    create_room(
        State(state.clone()),
        auth(owner),
        Json(room_body(dungeon_id, 10, 10, 3, 3, true)),
    )
    .await
    .expect("first guarded create");

    // a second guarded create on overlapping cells is refused
    let clash = create_room(
        State(state.clone()),
        auth(owner),
        Json(room_body(dungeon_id, 11, 11, 3, 3, true)),
    )
    .await;
    assert!(
        matches!(clash, Err(AppError::Conflict)),
        "guarded overlap must 409, got {clash:?}"
    );

    // flush neighbour (no overlap) is fine
    create_room(
        State(state.clone()),
        auth(owner),
        Json(room_body(dungeon_id, 13, 10, 2, 2, true)),
    )
    .await
    .expect("adjacent guarded create");

    // freehand drawing keeps its old semantics - overlap allowed
    create_room(
        State(state.clone()),
        auth(owner),
        Json(room_body(dungeon_id, 10, 10, 4, 4, false)),
    )
    .await
    .expect("freehand overlap stays legal");

    let count: i64 = sqlx::query_scalar("select count(*) from dungeon_rooms where dungeon_id = $1")
        .bind(dungeon_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 3);
}
