//! Integration test for the character projection's narrow member-write paths
//! (`adjust_currency`, `grant_gear`) against a real Postgres: the in-place
//! single-field edits, currency's floor at zero, gear's server-side
//! instanceId, and the `data_updated` snapshots they append so replay stays
//! consistent.
//!
//! Gated on `DATABASE_URL` exactly like `hex_projection.rs`: skipped when
//! unset, and it (re)creates throwaway tables — point it ONLY at a disposable
//! database.

use hexmap_server::domains::character::projection;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

const SCHEMA: &str = r#"
drop table if exists events;
drop table if exists characters;

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

async fn create_character(pool: &PgPool, data: Value) -> Uuid {
    let id = Uuid::new_v4();
    let mut tx = pool.begin().await.unwrap();
    projection::create(
        &mut tx,
        id,
        Some(Uuid::new_v4()),
        Uuid::new_v4(),
        &data,
        &json!({}),
    )
    .await
    .expect("create character");
    tx.commit().await.unwrap();
    id
}

async fn adjust(pool: &PgPool, id: Uuid, currency: &str, delta: i64) -> Value {
    let mut tx = pool.begin().await.unwrap();
    let row = projection::adjust_currency(&mut tx, id, currency, delta, &json!({}))
        .await
        .expect("adjust currency");
    tx.commit().await.unwrap();
    row
}

async fn grant(pool: &PgPool, id: Uuid, item: Value) -> Value {
    let mut tx = pool.begin().await.unwrap();
    let row = projection::grant_gear(&mut tx, id, &item, &json!({}))
        .await
        .expect("grant gear");
    tx.commit().await.unwrap();
    row
}

// One test per file, like hex_projection.rs: tests in a binary run on parallel
// threads, and they would race on the shared throwaway schema.
#[tokio::test]
async fn narrow_member_writes_touch_one_field_and_snapshot() {
    let Some(pool) = setup().await else {
        eprintln!("DATABASE_URL not set; skipping");
        return;
    };
    let id = create_character(&pool, json!({"name": "Rook", "gold": 5, "currentHp": 7})).await;

    let row = adjust(&pool, id, "gold", 3).await;
    assert_eq!(row["data"]["gold"], json!(8));
    assert_eq!(row["data"]["currentHp"], json!(7));
    assert_eq!(row["data"]["name"], json!("Rook"));

    let row = adjust(&pool, id, "gold", -100).await;
    assert_eq!(row["data"]["gold"], json!(0));

    // a currency the sheet has never touched starts from zero
    let row = adjust(&pool, id, "silver", 4).await;
    assert_eq!(row["data"]["silver"], json!(4));

    let (event_type, payload): (String, Value) = sqlx::query_as(
        "select event_type, payload from events
         where aggregate_type = 'character' and aggregate_id = $1
         order by sequence desc limit 1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(event_type, "character.data_updated");
    assert_eq!(payload["data"]["silver"], json!(4));
    assert_eq!(payload["data"]["gold"], json!(0));

    // grant_gear appends one item (with a server-generated instanceId) even
    // when the sheet has no gear array yet, and leaves the rest alone
    let item = json!({"name": "Rope", "slots": 1, "quantity": 2, "type": "sundry", "disabled": false});
    let row = grant(&pool, id, item.clone()).await;
    let gear = row["data"]["gear"].as_array().unwrap();
    assert_eq!(gear.len(), 1);
    assert_eq!(gear[0]["name"], json!("Rope"));
    assert_eq!(gear[0]["quantity"], json!(2));
    assert!(gear[0]["instanceId"].as_str().unwrap().len() >= 32);
    assert_eq!(row["data"]["name"], json!("Rook"));

    let row = grant(&pool, id, item).await;
    let gear = row["data"]["gear"].as_array().unwrap();
    assert_eq!(gear.len(), 2);
    assert_ne!(gear[0]["instanceId"], gear[1]["instanceId"]);

    let (event_type, payload): (String, Value) = sqlx::query_as(
        "select event_type, payload from events
         where aggregate_type = 'character' and aggregate_id = $1
         order by sequence desc limit 1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(event_type, "character.data_updated");
    assert_eq!(payload["data"]["gear"].as_array().unwrap().len(), 2);
}
