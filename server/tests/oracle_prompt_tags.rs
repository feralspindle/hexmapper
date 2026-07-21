//! integration tests for prompt.* table tags: an event prompt roll checks
//! each slot for a session table tagged prompt.<slot> and rolls it, falling
//! back to the built-in lists when there's no such table, the table isn't
//! added to the session, or the table can't produce a row. two tagged
//! tables on one session resolve to the most recently edited one.
//!
//! gated on `DATABASE_URL` like the other integration tests, skipped when no
//! db is configured, run against an ephemeral postgres in ci. it (re)creates
//! a minimal schema (including a stub auth.users for display-name lookup), so
//! point it only at a throwaway db.

use axum::extract::{Path, State};
use axum::Json;
use hexmap_server::auth::AuthUser;
use hexmap_server::domains::oracle::handlers::{
    attach_table, roll_oracle, AttachTableRequest, RollOracleRequest,
};
use hexmap_server::state::AppState;
use jsonwebtoken::jwk::JwkSet;
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::sync::Mutex;
use uuid::Uuid;

// the tests rebuild the same schema, serialize them so setup can't race itself
static DB_LOCK: Mutex<()> = Mutex::const_new(());

const SCHEMA: &str = r#"
create schema if not exists auth;
drop table if exists events;
drop table if exists oracle_rolls;
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

const BUILTIN_ACTIONS: &[&str] = &[
    "Reveal",
    "Threaten",
    "Divide",
    "Delay",
    "Escalate",
    "Transform",
    "Bargain",
    "Pursue",
    "Conceal",
    "Return",
];

const PROMPT_KEYS: &[&str] = &["action", "theme", "subject", "location", "complication"];

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
        route: "TEST /oracle".into(),
    }
}

async fn seed_user_and_session(pool: &PgPool, email: &str) -> (Uuid, Uuid) {
    let owner = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    sqlx::query("insert into auth.users (id, email) values ($1, $2)")
        .bind(owner)
        .bind(email)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("insert into sessions (id, owner_id) values ($1, $2)")
        .bind(session_id)
        .bind(owner)
        .execute(pool)
        .await
        .unwrap();
    (owner, session_id)
}

async fn seed_tagged_table(pool: &PgPool, owner: Uuid, name: &str, tag: &str) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query("insert into oracle_tables (id, created_by, name, tag) values ($1, $2, $3, $4)")
        .bind(id)
        .bind(owner)
        .bind(name)
        .bind(tag)
        .execute(pool)
        .await
        .unwrap();
    id
}

async fn seed_row(pool: &PgPool, table_id: Uuid, result: &str) {
    sqlx::query("insert into oracle_table_rows (id, table_id, result) values ($1, $2, $3)")
        .bind(Uuid::new_v4())
        .bind(table_id)
        .bind(result)
        .execute(pool)
        .await
        .unwrap();
}

async fn attach(state: &AppState, owner: Uuid, session_id: Uuid, table_id: Uuid) {
    let _ = attach_table(
        State(state.clone()),
        auth(owner),
        Path(table_id),
        Json(AttachTableRequest { session_id }),
    )
    .await
    .expect("attach succeeds");
}

async fn roll_prompt(state: &AppState, owner: Uuid, session_id: Uuid) -> Value {
    let Json(roll) = roll_oracle(
        State(state.clone()),
        auth(owner),
        Json(RollOracleRequest {
            session_id,
            kind: "event_prompt".into(),
            question: None,
            odds: None,
            table_id: None,
        }),
    )
    .await
    .expect("event prompt roll succeeds");
    roll.result
}

fn assert_all_slots_filled(result: &Value) {
    for key in PROMPT_KEYS {
        let text = result[key].as_str().unwrap_or_default();
        assert!(!text.is_empty(), "slot {key} should not be empty");
    }
}

#[tokio::test]
async fn tagged_session_table_overrides_its_slot() {
    let _db = DB_LOCK.lock().await;
    let Some(pool) = setup().await else {
        eprintln!("skipping oracle_prompt_tags test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);
    let (owner, session_id) = seed_user_and_session(&pool, "prompt@test").await;

    let table = seed_tagged_table(&pool, owner, "My Actions", "prompt.action").await;
    seed_row(&pool, table, "the ceiling breathes").await;
    attach(&state, owner, session_id, table).await;

    let result = roll_prompt(&state, owner, session_id).await;

    assert_eq!(result["action"], "the ceiling breathes");
    assert_all_slots_filled(&result);
    // the other slots still come from the built-in lists
    assert!(result["theme"].as_str().is_some());
}

#[tokio::test]
async fn library_table_not_in_session_falls_back() {
    let _db = DB_LOCK.lock().await;
    let Some(pool) = setup().await else {
        eprintln!("skipping oracle_prompt_tags test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);
    let (owner, session_id) = seed_user_and_session(&pool, "fallback@test").await;

    // tagged and rowed, but never added to the session
    let table = seed_tagged_table(&pool, owner, "My Actions", "prompt.action").await;
    seed_row(&pool, table, "the ceiling breathes").await;

    let result = roll_prompt(&state, owner, session_id).await;

    let action = result["action"].as_str().unwrap();
    assert!(
        BUILTIN_ACTIONS.contains(&action),
        "unattached table should not roll, got {action}"
    );
    assert_all_slots_filled(&result);
}

#[tokio::test]
async fn empty_tagged_table_falls_back() {
    let _db = DB_LOCK.lock().await;
    let Some(pool) = setup().await else {
        eprintln!("skipping oracle_prompt_tags test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);
    let (owner, session_id) = seed_user_and_session(&pool, "empty@test").await;

    let table = seed_tagged_table(&pool, owner, "No Rows Yet", "prompt.action").await;
    attach(&state, owner, session_id, table).await;

    let result = roll_prompt(&state, owner, session_id).await;

    let action = result["action"].as_str().unwrap();
    assert!(
        BUILTIN_ACTIONS.contains(&action),
        "empty table should fall back to the built-in list, got {action}"
    );
    assert_all_slots_filled(&result);
}

#[tokio::test]
async fn newest_edited_tagged_table_wins() {
    let _db = DB_LOCK.lock().await;
    let Some(pool) = setup().await else {
        eprintln!("skipping oracle_prompt_tags test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);
    let (owner, session_id) = seed_user_and_session(&pool, "newest@test").await;

    let older = seed_tagged_table(&pool, owner, "Old Actions", "prompt.action").await;
    seed_row(&pool, older, "stale entry").await;
    attach(&state, owner, session_id, older).await;

    let newer = seed_tagged_table(&pool, owner, "New Actions", "prompt.action").await;
    seed_row(&pool, newer, "fresh entry").await;
    attach(&state, owner, session_id, newer).await;

    sqlx::query("update oracle_tables set updated_at = now() - interval '1 day' where id = $1")
        .bind(older)
        .execute(&pool)
        .await
        .unwrap();

    let result = roll_prompt(&state, owner, session_id).await;

    assert_eq!(result["action"], "fresh entry");
}
