//! integration tests for the in-app json table import: the browser-authed
//! twin of POST /import/oracle-tables. bundles land in the caller's library,
//! attach to the session when one is given, chains resolve inside the bundle,
//! and name collisions are rejected unless the bundle says replace.
//!
//! gated on `DATABASE_URL` like the other integration tests, skipped when no
//! db is configured, run against an ephemeral postgres in ci. it (re)creates
//! a minimal schema, so point it only at a throwaway db.

use axum::extract::State;
use axum::Json;
use hexmap_server::auth::AuthUser;
use hexmap_server::domains::oracle::packs::{import_tables, ImportTablesRequest};
use hexmap_server::error::AppError;
use hexmap_server::state::AppState;
use jsonwebtoken::jwk::JwkSet;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::sync::Mutex;
use uuid::Uuid;

// the tests rebuild the same schema, serialize them so setup can't race itself
static DB_LOCK: Mutex<()> = Mutex::const_new(());

const SCHEMA: &str = r#"
create schema if not exists auth;
drop table if exists events;
drop table if exists session_oracle_tables;
drop table if exists oracle_table_rows;
drop table if exists oracle_tables;
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
    id          uuid primary key,
    table_id    uuid not null references oracle_tables(id) on delete cascade,
    weight      int not null default 1,
    range_min   int,
    range_max   int,
    result      text not null,
    notes       text not null default '',
    position    int not null default 0,
    subtable_id uuid references oracle_tables(id) on delete set null,
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
        route: "TEST /oracle-tables/import".into(),
    }
}

async fn seed_session(pool: &PgPool, owner: Uuid) -> Uuid {
    let session_id = Uuid::new_v4();
    sqlx::query("insert into auth.users (id, email) values ($1, 'import@test')")
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
    session_id
}

fn bundle(session_id: Option<Uuid>, replace: bool) -> ImportTablesRequest {
    serde_json::from_value(json!({
        "session_id": session_id,
        "replace": replace,
        "tables": [
            {
                "name": "Reaction",
                "description": "2d6 on first contact",
                "tag": "NPC.Reaction",
                "rows": [
                    { "result": "Hostile", "weight": 1, "notes": "roll morale" },
                    { "result": "Friendly", "weight": 2, "chain": "Mood" }
                ]
            },
            {
                "name": "Mood",
                "mode": "range",
                "rows": [
                    { "result": "Cheery", "range": [1, 3] },
                    { "result": "Grim", "range": [4, 6] }
                ]
            }
        ]
    }))
    .expect("bundle parses")
}

#[tokio::test]
async fn bundle_lands_in_library_and_session() {
    let _db = DB_LOCK.lock().await;
    let Some(pool) = setup().await else {
        eprintln!("skipping table_import test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);

    let owner = Uuid::new_v4();
    let session_id = seed_session(&pool, owner).await;

    let Json(result) = import_tables(
        State(state),
        auth(owner),
        Json(bundle(Some(session_id), false)),
    )
    .await
    .expect("import succeeds");

    assert_eq!(result["installed_tables"], 2);
    assert_eq!(result["installed_rows"], 4);
    assert_eq!(result["replaced_tables"], 0);

    let (created_by, tag): (Uuid, Option<String>) =
        sqlx::query_as("select created_by, tag from oracle_tables where name = 'Reaction'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(created_by, owner);
    assert_eq!(tag.as_deref(), Some("npc.reaction"));

    let attached: i64 =
        sqlx::query_scalar("select count(*) from session_oracle_tables where session_id = $1")
            .bind(session_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(attached, 2);

    let chained: Option<Uuid> = sqlx::query_scalar(
        "select subtable_id from oracle_table_rows where result = 'Friendly'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let mood: Uuid = sqlx::query_scalar("select id from oracle_tables where name = 'Mood'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(chained, Some(mood));
}

#[tokio::test]
async fn without_session_bundle_stays_library_only() {
    let _db = DB_LOCK.lock().await;
    let Some(pool) = setup().await else {
        eprintln!("skipping table_import test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);

    let owner = Uuid::new_v4();
    seed_session(&pool, owner).await;

    let Json(result) = import_tables(State(state), auth(owner), Json(bundle(None, false)))
        .await
        .expect("import succeeds");
    assert_eq!(result["installed_tables"], 2);

    let attached: i64 = sqlx::query_scalar("select count(*) from session_oracle_tables")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(attached, 0);
}

#[tokio::test]
async fn collisions_reject_unless_replace() {
    let _db = DB_LOCK.lock().await;
    let Some(pool) = setup().await else {
        eprintln!("skipping table_import test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);

    let owner = Uuid::new_v4();
    let session_id = seed_session(&pool, owner).await;

    let _ = import_tables(
        State(state.clone()),
        auth(owner),
        Json(bundle(Some(session_id), false)),
    )
    .await
    .expect("first import succeeds");
    let first_id: Uuid = sqlx::query_scalar("select id from oracle_tables where name = 'Reaction'")
        .fetch_one(&pool)
        .await
        .unwrap();

    let err = import_tables(
        State(state.clone()),
        auth(owner),
        Json(bundle(Some(session_id), false)),
    )
    .await
    .expect_err("second import collides");
    match err {
        AppError::BadRequest(message) => {
            assert!(message.contains("Reaction"), "names the colliding table: {message}");
        }
        other => panic!("expected BadRequest, got {other:?}"),
    }

    let Json(result) = import_tables(
        State(state),
        auth(owner),
        Json(bundle(Some(session_id), true)),
    )
    .await
    .expect("replace import succeeds");
    assert_eq!(result["replaced_tables"], 2);

    let ids: Vec<Uuid> = sqlx::query_scalar("select id from oracle_tables where name = 'Reaction'")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(ids.len(), 1, "old copy is gone");
    assert_ne!(ids[0], first_id);
}

#[tokio::test]
async fn non_members_cannot_attach_to_a_session() {
    let _db = DB_LOCK.lock().await;
    let Some(pool) = setup().await else {
        eprintln!("skipping table_import test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);

    let owner = Uuid::new_v4();
    let session_id = seed_session(&pool, owner).await;
    let stranger = Uuid::new_v4();

    let err = import_tables(
        State(state),
        auth(stranger),
        Json(bundle(Some(session_id), false)),
    )
    .await
    .expect_err("stranger is rejected");
    assert!(matches!(err, AppError::Forbidden));
}

#[tokio::test]
async fn broken_chains_are_rejected() {
    let _db = DB_LOCK.lock().await;
    let Some(pool) = setup().await else {
        eprintln!("skipping table_import test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);

    let owner = Uuid::new_v4();
    let session_id = seed_session(&pool, owner).await;

    let req: ImportTablesRequest = serde_json::from_value(json!({
        "session_id": session_id,
        "tables": [
            { "name": "Solo", "rows": [ { "result": "into the void", "chain": "Nowhere" } ] }
        ]
    }))
    .unwrap();
    let err = import_tables(State(state), auth(owner), Json(req))
        .await
        .expect_err("unresolved chain is rejected");
    match err {
        AppError::BadRequest(message) => {
            assert!(message.contains("Nowhere"), "names the missing key: {message}");
        }
        other => panic!("expected BadRequest, got {other:?}"),
    }

    let count: i64 = sqlx::query_scalar("select count(*) from oracle_tables")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0, "nothing installed");
}
