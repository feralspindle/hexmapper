//! Regression tests for cross-session map_id misuse in the hex write handlers
//! (issue #4). Every hex endpoint authorizes the caller against the request's
//! `session_id` but mutates by `map_id`; `ensure_map_in_session` must reject a
//! `map_id` that belongs to a different session (403) or no session (404),
//! for GMs and members alike, before any mutation happens.
//!
//! Gated on `DATABASE_URL` like the other integration tests: skipped when no
//! DB is configured, run against an ephemeral Postgres in CI. It (re)creates
//! a minimal schema, so point it ONLY at a throwaway database.

use axum::extract::{Json, Query, State};
use hexmap_server::auth::AuthUser;
use hexmap_server::domains::hex::handlers::{
    bulk_reveal, clear_hex, delete_hex, explore_hex, list_hexes, upsert_hex, BulkRevealRequest,
    ClearHexRequest, DeleteHexRequest, ExploreHexRequest, ListHexRequest,
};
use hexmap_server::error::AppError;
use hexmap_server::state::AppState;
use jsonwebtoken::jwk::JwkSet;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

const SCHEMA: &str = r#"
drop table if exists events;
drop table if exists hex_cells;
drop table if exists maps;
drop table if exists session_members;
drop table if exists sessions;

create table sessions (
    id        uuid primary key,
    owner_id  uuid not null,
    play_mode text not null default 'gm'
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

fn auth(user_id: Uuid) -> AuthUser {
    AuthUser {
        user_id,
        display_name: "Tester".into(),
        intent: None,
        request_id: "test-request".into(),
        client_id: None,
        app_version: None,
        trace_id: None,
        route: "TEST /hex".into(),
    }
}

fn upsert_body(session_id: Uuid, map_id: Uuid) -> serde_json::Value {
    json!({
        "session_id": session_id,
        "map_id": map_id,
        "q": 0,
        "r": 0,
        "terrain_type": "forest",
        "revealed": true
    })
}

struct Fixture {
    state: AppState,
    gm_a: Uuid,
    member_a: Uuid,
    session_a: Uuid,
    map_a: Uuid,
    session_b: Uuid,
    map_b: Uuid,
}

/// Two sessions with one map each. `gm_a` owns session A; `member_a` is a
/// non-GM member of A. Neither has any relationship to session B, whose map
/// holds a single hidden canary cell that must survive every attack below.
async fn fixture(pool: &PgPool) -> Fixture {
    let f = Fixture {
        state: AppState::new(pool.clone(), JwkSet { keys: vec![] }, vec![]),
        gm_a: Uuid::new_v4(),
        member_a: Uuid::new_v4(),
        session_a: Uuid::new_v4(),
        map_a: Uuid::new_v4(),
        session_b: Uuid::new_v4(),
        map_b: Uuid::new_v4(),
    };

    for (session, owner) in [(f.session_a, f.gm_a), (f.session_b, Uuid::new_v4())] {
        sqlx::query("insert into sessions (id, owner_id, play_mode) values ($1, $2, 'gm')")
            .bind(session)
            .bind(owner)
            .execute(pool)
            .await
            .unwrap();
    }
    sqlx::query("insert into session_members (session_id, user_id) values ($1, $2)")
        .bind(f.session_a)
        .bind(f.member_a)
        .execute(pool)
        .await
        .unwrap();
    for (map, session) in [(f.map_a, f.session_a), (f.map_b, f.session_b)] {
        sqlx::query("insert into maps (id, session_id) values ($1, $2)")
            .bind(map)
            .bind(session)
            .execute(pool)
            .await
            .unwrap();
    }
    sqlx::query(
        "insert into hex_cells (session_id, map_id, q, r, terrain_type, revealed)
         values ($1, $2, 0, 0, 'swamp', false)",
    )
    .bind(f.session_b)
    .bind(f.map_b)
    .execute(pool)
    .await
    .unwrap();

    f
}

/// The canary cell in session B: exactly one row, still hidden, still swamp.
async fn assert_map_b_untouched(pool: &PgPool, map_b: Uuid) {
    let (count, revealed, terrain): (i64, bool, String) = sqlx::query_as(
        "select count(*), bool_and(revealed), min(terrain_type) from hex_cells where map_id = $1",
    )
    .bind(map_b)
    .fetch_one(pool)
    .await
    .unwrap();
    assert_eq!(count, 1, "foreign map must not gain or lose cells");
    assert!(!revealed, "foreign map's hidden cell must stay hidden");
    assert_eq!(terrain, "swamp", "foreign map's cell must be unmodified");
}

#[tokio::test]
async fn hex_writes_cannot_target_a_map_outside_the_authorized_session() {
    let Some(pool) = setup().await else {
        eprintln!("skipping hex_map_session_guard test: DATABASE_URL not set");
        return;
    };
    let f = fixture(&pool).await;

    // GM of session A attacks session B's map through every write endpoint.
    let err = upsert_hex(
        State(f.state.clone()),
        auth(f.gm_a),
        Json(upsert_body(f.session_a, f.map_b)),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, AppError::Forbidden), "upsert: {err:?}");

    let err = delete_hex(
        State(f.state.clone()),
        auth(f.gm_a),
        Json(DeleteHexRequest {
            session_id: f.session_a,
            map_id: f.map_b,
            q: 0,
            r: 0,
        }),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, AppError::Forbidden), "delete: {err:?}");

    let err = bulk_reveal(
        State(f.state.clone()),
        auth(f.gm_a),
        Json(BulkRevealRequest {
            session_id: f.session_a,
            map_id: f.map_b,
            revealed: true,
        }),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, AppError::Forbidden), "bulk_reveal: {err:?}");

    let err = clear_hex(
        State(f.state.clone()),
        auth(f.gm_a),
        Json(ClearHexRequest {
            session_id: f.session_a,
            map_id: f.map_b,
        }),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, AppError::Forbidden), "clear: {err:?}");

    let err = explore_hex(
        State(f.state.clone()),
        auth(f.gm_a),
        Json(ExploreHexRequest {
            session_id: f.session_a,
            map_id: f.map_b,
            q: 0,
            r: 0,
        }),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, AppError::Forbidden), "explore: {err:?}");

    let err = list_hexes(
        State(f.state.clone()),
        auth(f.gm_a),
        Query(ListHexRequest {
            session_id: f.session_a,
            map_id: Some(f.map_b),
        }),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, AppError::Forbidden), "list: {err:?}");

    // A plain member of session A is rejected by the same guard.
    let err = upsert_hex(
        State(f.state.clone()),
        auth(f.member_a),
        Json(upsert_body(f.session_a, f.map_b)),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, AppError::Forbidden), "member upsert: {err:?}");

    let err = explore_hex(
        State(f.state.clone()),
        auth(f.member_a),
        Json(ExploreHexRequest {
            session_id: f.session_a,
            map_id: f.map_b,
            q: 0,
            r: 0,
        }),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, AppError::Forbidden), "member explore: {err:?}");

    // A map_id that exists nowhere is a controlled 404, not a mutation.
    let err = upsert_hex(
        State(f.state.clone()),
        auth(f.gm_a),
        Json(upsert_body(f.session_a, Uuid::new_v4())),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, AppError::NotFound), "missing map: {err:?}");

    let err = explore_hex(
        State(f.state.clone()),
        auth(f.gm_a),
        Json(ExploreHexRequest {
            session_id: f.session_a,
            map_id: Uuid::new_v4(),
            q: 0,
            r: 0,
        }),
    )
    .await
    .unwrap_err();
    assert!(
        matches!(err, AppError::NotFound),
        "explore missing map: {err:?}"
    );

    // Nothing above reached session B's data.
    assert_map_b_untouched(&pool, f.map_b).await;
    let foreign_events: i64 =
        sqlx::query_scalar("select count(*) from events where session_id = $1")
            .bind(f.session_b)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(foreign_events, 0, "no events may be recorded for session B");

    // Control: the same calls against session A's own map succeed, proving
    // the rejections come from the map/session mismatch and nothing else.
    let Json(row) = upsert_hex(
        State(f.state.clone()),
        auth(f.gm_a),
        Json(upsert_body(f.session_a, f.map_a)),
    )
    .await
    .expect("same-session upsert succeeds");
    assert_eq!(row["terrain_type"], "forest");

    bulk_reveal(
        State(f.state.clone()),
        auth(f.gm_a),
        Json(BulkRevealRequest {
            session_id: f.session_a,
            map_id: f.map_a,
            revealed: true,
        }),
    )
    .await
    .expect("same-session bulk reveal succeeds");

    delete_hex(
        State(f.state.clone()),
        auth(f.gm_a),
        Json(DeleteHexRequest {
            session_id: f.session_a,
            map_id: f.map_a,
            q: 0,
            r: 0,
        }),
    )
    .await
    .expect("same-session delete succeeds");

    clear_hex(
        State(f.state.clone()),
        auth(f.gm_a),
        Json(ClearHexRequest {
            session_id: f.session_a,
            map_id: f.map_a,
        }),
    )
    .await
    .expect("same-session clear succeeds");

    let Json(listed) = list_hexes(
        State(f.state.clone()),
        auth(f.gm_a),
        Query(ListHexRequest {
            session_id: f.session_a,
            map_id: Some(f.map_a),
        }),
    )
    .await
    .expect("same-session list succeeds");
    assert_eq!(listed.as_array().unwrap().len(), 0);

    assert_map_b_untouched(&pool, f.map_b).await;
}
