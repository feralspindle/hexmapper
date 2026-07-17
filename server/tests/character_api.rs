//! Handler-level authorization matrix for the character endpoints against a
//! real Postgres, calling the axum handlers directly with a constructed
//! AuthUser. The sheet PATCH must stay owner/gm-only while the narrow
//! adjust-currency and grant-gear paths stay member-allowed (#187) — this is
//! the server half of the contract the vault flows depend on (the frontend
//! half lives in src/stores/vaultCharacterContract.test.js).
//!
//! Gated on `DATABASE_URL` exactly like `hex_projection.rs`: skipped when
//! unset, and it (re)creates throwaway tables — point it ONLY at a disposable
//! database.

use axum::extract::{Path, State};
use axum::Json;
use hexmap_server::auth::AuthUser;
use hexmap_server::domains::character::handlers;
use hexmap_server::error::AppError;
use hexmap_server::state::AppState;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

const SCHEMA: &str = r#"
drop table if exists events;
drop table if exists characters;
drop table if exists session_members;
drop table if exists sessions;

create table sessions (
    id       uuid primary key,
    name     text not null default '',
    owner_id uuid not null
);

create table session_members (
    session_id uuid not null,
    user_id    uuid not null
);

create table characters (
    id         uuid primary key,
    session_id uuid,
    user_id    uuid not null,
    data       jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
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

fn auth(user_id: Uuid) -> AuthUser {
    AuthUser {
        user_id,
        display_name: "Tester".to_string(),
        intent: None,
        request_id: "test-req".to_string(),
        client_id: None,
        app_version: None,
        trace_id: None,
        route: "TEST /characters".to_string(),
    }
}

async fn patch(state: &AppState, as_user: Uuid, id: Uuid, data: Value) -> Result<Value, AppError> {
    handlers::update_character_data(
        State(state.clone()),
        auth(as_user),
        Path(id),
        Json(handlers::UpdateDataRequest { data }),
    )
    .await
    .map(|Json(row)| row)
}

async fn adjust(
    state: &AppState,
    as_user: Uuid,
    id: Uuid,
    currency: &str,
    delta: i64,
) -> Result<Value, AppError> {
    handlers::adjust_character_currency(
        State(state.clone()),
        auth(as_user),
        Path(id),
        Json(handlers::AdjustCurrencyRequest {
            currency: currency.to_string(),
            delta,
        }),
    )
    .await
    .map(|Json(row)| row)
}

async fn grant(
    state: &AppState,
    as_user: Uuid,
    id: Uuid,
    name: &str,
    gear_type: &str,
) -> Result<Value, AppError> {
    handlers::grant_character_gear(
        State(state.clone()),
        auth(as_user),
        Path(id),
        Json(handlers::GrantGearRequest {
            name: name.to_string(),
            slots: 1,
            quantity: 1,
            gear_type: gear_type.to_string(),
        }),
    )
    .await
    .map(|Json(row)| row)
}

// One test per file, like hex_projection.rs: tests in a binary run on parallel
// threads, and they would race on the shared throwaway schema.
#[tokio::test]
async fn character_write_authorization_matrix() {
    let Some(url) = std::env::var("DATABASE_URL").ok() else {
        eprintln!("DATABASE_URL not set; skipping");
        return;
    };
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect to DATABASE_URL");
    sqlx::raw_sql(SCHEMA)
        .execute(&pool)
        .await
        .expect("create test schema");

    let jwks = serde_json::from_value(json!({ "keys": [] })).expect("empty jwks");
    let state = AppState::new(pool.clone(), jwks, vec![]);

    let gm = Uuid::new_v4();
    let owner = Uuid::new_v4();
    let member = Uuid::new_v4();
    let outsider = Uuid::new_v4();
    let session = Uuid::new_v4();
    let character = Uuid::new_v4();

    sqlx::query("insert into sessions (id, owner_id) values ($1, $2)")
        .bind(session)
        .bind(gm)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("insert into session_members (session_id, user_id) values ($1, $2), ($1, $3)")
        .bind(session)
        .bind(owner)
        .bind(member)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("insert into characters (id, session_id, user_id, data) values ($1, $2, $3, $4)")
        .bind(character)
        .bind(session)
        .bind(owner)
        .bind(json!({"name": "Rook", "gold": 5}))
        .execute(&pool)
        .await
        .unwrap();

    // full-blob sheet PATCH: owner and gm only
    assert!(patch(&state, owner, character, json!({"name": "Rook", "gold": 5})).await.is_ok());
    assert!(patch(&state, gm, character, json!({"name": "Rook", "gold": 5})).await.is_ok());
    assert!(matches!(
        patch(&state, member, character, json!({"name": "Vandalized"})).await,
        Err(AppError::Forbidden)
    ));
    assert!(matches!(
        patch(&state, outsider, character, json!({"name": "Vandalized"})).await,
        Err(AppError::Forbidden)
    ));

    // adjust-currency: any session member, never an outsider, bounded input
    let row = adjust(&state, member, character, "gold", 3).await.unwrap();
    assert_eq!(row["data"]["gold"], json!(8));
    assert!(matches!(
        adjust(&state, outsider, character, "gold", 3).await,
        Err(AppError::Forbidden)
    ));
    assert!(matches!(
        adjust(&state, member, character, "currentHp", -9).await,
        Err(AppError::BadRequest(_))
    ));
    assert!(matches!(
        adjust(&state, member, character, "gold", 10_000_000).await,
        Err(AppError::BadRequest(_))
    ));

    // grant-gear: any session member, never an outsider, bounded input
    let row = grant(&state, member, character, "Rope", "sundry").await.unwrap();
    assert_eq!(row["data"]["gear"].as_array().unwrap().len(), 1);
    assert!(matches!(
        grant(&state, outsider, character, "Rope", "sundry").await,
        Err(AppError::Forbidden)
    ));
    assert!(matches!(
        grant(&state, member, character, "Rope", "artifact").await,
        Err(AppError::BadRequest(_))
    ));
    assert!(matches!(
        grant(&state, member, character, "   ", "sundry").await,
        Err(AppError::BadRequest(_))
    ));

    // the vandal attempts above changed nothing
    let name: Value = sqlx::query_scalar("select data->'name' from characters where id = $1")
        .bind(character)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(name, json!("Rook"));

    // a sessionless character is owner-only on every path
    let solo = Uuid::new_v4();
    sqlx::query("insert into characters (id, session_id, user_id) values ($1, null, $2)")
        .bind(solo)
        .bind(owner)
        .execute(&pool)
        .await
        .unwrap();
    assert!(patch(&state, owner, solo, json!({"name": "Solo"})).await.is_ok());
    assert!(matches!(
        patch(&state, gm, solo, json!({"name": "Nope"})).await,
        Err(AppError::Forbidden)
    ));
    assert!(matches!(
        adjust(&state, member, solo, "gold", 1).await,
        Err(AppError::Forbidden)
    ));
    assert!(adjust(&state, owner, solo, "gold", 1).await.is_ok());
}
