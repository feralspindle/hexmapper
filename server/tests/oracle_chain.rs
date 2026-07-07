//! integration tests for chained oracle tables (#47): a roll walks subtable
//! references and records the chain as one grouped result, an a->b->a cycle
//! truncates instead of hanging, and cross-session chains are rejected at
//! write time.
//!
//! gated on `DATABASE_URL` like the other integration tests, skipped when no
//! db is configured, run against an ephemeral postgres in ci. it (re)creates
//! a minimal schema (including a stub auth.users for display-name lookup), so
//! point it only at a throwaway db.

use axum::extract::{Path, State};
use axum::Json;
use hexmap_server::auth::AuthUser;
use hexmap_server::domains::oracle::handlers::{
    create_row, roll_oracle, CreateRowRequest, RollOracleRequest,
};
use hexmap_server::state::AppState;
use jsonwebtoken::jwk::JwkSet;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

const SCHEMA: &str = r#"
create schema if not exists auth;
drop table if exists events;
drop table if exists oracle_rolls;
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

async fn seed_table(pool: &PgPool, session_id: Uuid, owner: Uuid, name: &str) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query("insert into oracle_tables (id, session_id, created_by, name) values ($1, $2, $3, $4)")
        .bind(id)
        .bind(session_id)
        .bind(owner)
        .bind(name)
        .execute(pool)
        .await
        .unwrap();
    id
}

async fn seed_row(pool: &PgPool, table_id: Uuid, result: &str, subtable_id: Option<Uuid>) {
    sqlx::query(
        "insert into oracle_table_rows (id, table_id, result, subtable_id) values ($1, $2, $3, $4)",
    )
    .bind(Uuid::new_v4())
    .bind(table_id)
    .bind(result)
    .bind(subtable_id)
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn chained_roll_records_the_whole_chain() {
    let Some(pool) = setup().await else {
        eprintln!("skipping oracle_chain test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);

    let owner = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    sqlx::query("insert into auth.users (id, email) values ($1, 'chain@test')")
        .bind(owner)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("insert into sessions (id, owner_id) values ($1, $2)")
        .bind(session_id)
        .bind(owner)
        .execute(&pool)
        .await
        .unwrap();

    // encounter -> monster -> reaction, one row each so the walk is deterministic
    let reaction = seed_table(&pool, session_id, owner, "Reaction").await;
    let monster = seed_table(&pool, session_id, owner, "Monster").await;
    let encounter = seed_table(&pool, session_id, owner, "Encounter").await;
    seed_row(&pool, reaction, "hostile", None).await;
    seed_row(&pool, monster, "{2d6} goblins", Some(reaction)).await;
    seed_row(&pool, encounter, "monsters ahead", Some(monster)).await;

    let Json(roll) = roll_oracle(
        State(state),
        auth(owner),
        Json(RollOracleRequest {
            session_id,
            kind: "table".into(),
            question: None,
            odds: None,
            table_id: Some(encounter),
        }),
    )
    .await
    .expect("chained roll succeeds");

    // head fields stay top level for old readers
    assert_eq!(roll.result["result"], "monsters ahead");
    assert_eq!(roll.result["table_name"], "Encounter");
    assert!(roll.result.get("chain_truncated").is_none());

    let chain = roll.result["chain"].as_array().expect("chain recorded");
    assert_eq!(chain.len(), 3);
    assert_eq!(chain[0]["table_name"], "Encounter");
    assert_eq!(chain[1]["table_name"], "Monster");
    assert_eq!(chain[2]["table_name"], "Reaction");
    assert_eq!(chain[2]["result"], "hostile");

    // the {2d6} cell resolved to a number and recorded the expression
    let monster_text = chain[1]["result"].as_str().unwrap();
    assert!(monster_text.ends_with(" goblins"));
    let count: i64 = monster_text.trim_end_matches(" goblins").parse().unwrap();
    assert!((2..=12).contains(&count));
    assert_eq!(chain[1]["dice"][0]["expr"], "2d6");
}

#[tokio::test]
async fn cyclic_chain_truncates_instead_of_hanging() {
    let Some(pool) = setup().await else {
        eprintln!("skipping oracle_chain test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);

    let owner = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    sqlx::query("insert into auth.users (id, email) values ($1, 'cycle@test')")
        .bind(owner)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("insert into sessions (id, owner_id) values ($1, $2)")
        .bind(session_id)
        .bind(owner)
        .execute(&pool)
        .await
        .unwrap();

    let a = seed_table(&pool, session_id, owner, "A").await;
    let b = seed_table(&pool, session_id, owner, "B").await;
    seed_row(&pool, a, "to b", Some(b)).await;
    seed_row(&pool, b, "back to a", Some(a)).await;

    let Json(roll) = roll_oracle(
        State(state),
        auth(owner),
        Json(RollOracleRequest {
            session_id,
            kind: "table".into(),
            question: None,
            odds: None,
            table_id: Some(a),
        }),
    )
    .await
    .expect("cyclic roll still succeeds");

    assert_eq!(roll.result["chain_truncated"], json!(true));
    let chain = roll.result["chain"].as_array().expect("chain recorded");
    assert_eq!(chain.len(), 2, "each table rolled exactly once");
}

#[tokio::test]
async fn cross_session_chain_is_rejected_at_write() {
    let Some(pool) = setup().await else {
        eprintln!("skipping oracle_chain test: DATABASE_URL not set");
        return;
    };
    let state = AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]);

    let owner = Uuid::new_v4();
    let other_owner = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    let other_session = Uuid::new_v4();
    for (id, email) in [(owner, "mine@test"), (other_owner, "theirs@test")] {
        sqlx::query("insert into auth.users (id, email) values ($1, $2)")
            .bind(id)
            .bind(email)
            .execute(&pool)
            .await
            .unwrap();
    }
    for (sid, oid) in [(session_id, owner), (other_session, other_owner)] {
        sqlx::query("insert into sessions (id, owner_id) values ($1, $2)")
            .bind(sid)
            .bind(oid)
            .execute(&pool)
            .await
            .unwrap();
    }

    let mine = seed_table(&pool, session_id, owner, "Mine").await;
    let theirs = seed_table(&pool, other_session, other_owner, "Theirs").await;

    let result = create_row(
        State(state),
        auth(owner),
        Path(mine),
        Json(CreateRowRequest {
            weight: 1,
            range_min: None,
            range_max: None,
            result: "leak attempt".into(),
            notes: String::new(),
            position: 0,
            subtable_id: Some(theirs),
        }),
    )
    .await;

    assert!(result.is_err(), "chaining into another session must fail");
}
