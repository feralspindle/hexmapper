//! integration tests for the overland travel procedure (#51): moves burn
//! day fractions by terrain pace, a day boundary advances the calendar with
//! month wrap, the weather table lands on the fresh day, and difficult
//! terrain eventually rolls a lost result.
//!
//! gated on `DATABASE_URL` like the other integration tests, skipped when no
//! db is configured, run against an ephemeral postgres in ci. it (re)creates
//! a minimal schema, so point it only at a throwaway db.

use axum::extract::{Path, State};
use axum::Json;
use hexmap_server::auth::AuthUser;
use hexmap_server::domains::session::handlers::{travel, TravelRequest};
use hexmap_server::state::AppState;
use jsonwebtoken::jwk::JwkSet;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::sync::Mutex;
use uuid::Uuid;

// both tests rebuild the same schema, serialize them so setup can't race itself
static DB_LOCK: Mutex<()> = Mutex::const_new(());

const SCHEMA: &str = r#"
drop table if exists events;
drop table if exists chat_messages;
drop table if exists party_calendar_days;
drop table if exists party_calendar_settings;
drop table if exists oracle_table_rows;
drop table if exists oracle_tables;
drop table if exists session_members;
drop table if exists sessions;

create table sessions (
    id           uuid primary key,
    owner_id     uuid not null,
    play_mode    text not null default 'gm_less',
    travel_state jsonb not null default '{
        "enabled": false,
        "fraction": 0,
        "rates": {"plains": 3, "forest": 2, "mountain": 1, "water": 2, "desert": 2, "swamp": 1, "city": 3, "dungeon": 2, "snow": 1, "volcanic": 1},
        "difficult": ["forest", "mountain", "swamp", "snow", "volcanic"]
    }'::jsonb,
    updated_at   timestamptz not null default now()
);

create table session_members (
    session_id uuid not null,
    user_id    uuid not null,
    primary key (session_id, user_id)
);

create table party_calendar_settings (
    id             uuid primary key default gen_random_uuid(),
    session_id     uuid not null unique,
    month_names    jsonb not null default '["One", "Two"]',
    days_per_month jsonb not null default '[2, 3]',
    weekday_names  jsonb not null default '["A", "B"]',
    epoch_weekday  int not null default 0,
    year_prefix    text not null default '',
    year_suffix    text not null default '',
    current_year   int not null default 1,
    current_month  int not null default 1,
    current_day    int not null default 1,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create table party_calendar_days (
    id         uuid primary key default gen_random_uuid(),
    session_id uuid not null,
    year       int not null,
    month      int not null,
    day        int not null,
    weather    text,
    notes      text not null default '',
    updated_at timestamptz not null default now(),
    unique (session_id, year, month, day)
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
        route: "TEST /travel".into(),
    }
}

async fn fixture(pool: &PgPool) -> (AppState, Uuid, Uuid) {
    let owner = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    sqlx::query("insert into sessions (id, owner_id) values ($1, $2)")
        .bind(session_id)
        .bind(owner)
        .execute(pool)
        .await
        .unwrap();
    // two months of 2 and 3 days, starting on the last day of month one
    sqlx::query(
        "insert into party_calendar_settings (session_id, current_year, current_month, current_day) values ($1, 1, 1, 2)",
    )
    .bind(session_id)
    .execute(pool)
    .await
    .unwrap();
    // a one-row weather table so the roll is deterministic
    let table_id = Uuid::new_v4();
    sqlx::query(
        "insert into oracle_tables (id, created_by, name, tag) values ($1, $2, 'Weather', 'weather')",
    )
    .bind(table_id)
    .bind(owner)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("insert into oracle_table_rows (table_id, result) values ($1, 'driving rain')")
        .bind(table_id)
        .execute(pool)
        .await
        .unwrap();

    (
        AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]),
        owner,
        session_id,
    )
}

async fn op(state: &AppState, owner: Uuid, session_id: Uuid, req: TravelRequest) -> Value {
    let Json(result) = travel(State(state.clone()), auth(owner), Path(session_id), Json(req))
        .await
        .expect("travel op");
    result
}

fn move_req(terrain: &str) -> TravelRequest {
    TravelRequest {
        op: "move".into(),
        terrain: Some(terrain.into()),
        patch: None,
    }
}

#[tokio::test]
async fn two_plains_moves_advance_a_day_with_weather_and_month_wrap() {
    let _db = DB_LOCK.lock().await;
    let Some(pool) = setup().await else {
        eprintln!("skipping travel test: DATABASE_URL not set");
        return;
    };
    let (state, owner, session_id) = fixture(&pool).await;

    op(
        &state,
        owner,
        session_id,
        TravelRequest {
            op: "config".into(),
            terrain: None,
            patch: Some(json!({ "enabled": true, "rates": { "plains": 2.0 } })),
        },
    )
    .await;

    let first = op(&state, owner, session_id, move_req("plains")).await;
    assert_eq!(first["days_advanced"], 0);
    assert_eq!(first["travel_state"]["fraction"], 0.5);

    let second = op(&state, owner, session_id, move_req("plains")).await;
    assert_eq!(second["days_advanced"], 1);
    // started on 1-1-2, month one has 2 days -> wraps to 1-2-1
    assert_eq!(second["weather"]["month"], 2);
    assert_eq!(second["weather"]["day"], 1);
    assert_eq!(second["weather"]["weather"], "driving rain");

    let (month, day): (i32, i32) = sqlx::query_as(
        "select current_month, current_day from party_calendar_settings where session_id = $1",
    )
    .bind(session_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!((month, day), (2, 1));

    let weather: Option<String> = sqlx::query_scalar(
        "select weather from party_calendar_days where session_id = $1 and year = 1 and month = 2 and day = 1",
    )
    .bind(session_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(weather.as_deref(), Some("driving rain"));

    let announcements: i64 = sqlx::query_scalar(
        "select count(*) from chat_messages where session_id = $1 and body like '%driving rain%'",
    )
    .bind(session_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(announcements, 1);
}

#[tokio::test]
async fn difficult_terrain_eventually_gets_the_party_lost() {
    let _db = DB_LOCK.lock().await;
    let Some(pool) = setup().await else {
        eprintln!("skipping travel test: DATABASE_URL not set");
        return;
    };
    let (state, owner, session_id) = fixture(&pool).await;

    op(
        &state,
        owner,
        session_id,
        TravelRequest {
            op: "config".into(),
            terrain: None,
            patch: Some(json!({ "enabled": true })),
        },
    )
    .await;

    // d6 == 1 within 200 swamp moves or the check never fires
    let mut lost = false;
    for _ in 0..200 {
        let result = op(&state, owner, session_id, move_req("swamp")).await;
        if result["lost"] == json!(true) {
            lost = true;
            break;
        }
    }
    assert!(lost, "no lost result in 200 difficult-terrain moves");

    let announcements: i64 = sqlx::query_scalar(
        "select count(*) from chat_messages where session_id = $1 and body like '%loses its way%'",
    )
    .bind(session_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(announcements >= 1);

    // plains moves never roll navigation
    let result = op(&state, owner, session_id, move_req("plains")).await;
    assert_eq!(result["lost"], json!(false));
}
