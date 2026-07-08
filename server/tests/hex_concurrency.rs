//! Concurrency regression test for the hex write path.
//!
//! `retry_tx!` is what turns a lost event-sequence race into a retry instead of a
//! 500: two commits to the same aggregate both read the same `max(sequence)`, and
//! the `events_aggregate_type_aggregate_id_sequence_key` unique constraint rejects
//! the second. The handler wraps `projection::upsert` in `retry_tx!` exactly so
//! that burst resolves cleanly. This test drives that same path under contention.
//!
//! `examples/concurrency_check.rs` proves the guard on a synthetic aggregate; this
//! proves it on the real hex projection (`on conflict (map_id,q,r)` upsert + event
//! append), which is the path a handler actually runs.
//!
//! Gated on `DATABASE_URL` like `hex_projection.rs`: a plain `cargo test` with no DB
//! skips rather than fails. It (re)creates a throwaway schema, so point it ONLY at a
//! scratch database. CI provides an ephemeral Postgres service.

use std::sync::Arc;

use hexmap_server::domains::hex::projection;
use hexmap_server::error::AppError;
use hexmap_server::events::retry::is_sequence_conflict;
use hexmap_server::retry_tx;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::sync::Barrier;
use uuid::Uuid;

const SCHEMA: &str = r#"
drop table if exists events;
drop table if exists hex_cells;
drop table if exists maps;
drop table if exists sessions;

create table sessions (
    id        uuid primary key,
    play_mode text not null default 'gm'
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

// Enough writers to force real sequence contention on one aggregate, kept under the
// Supabase session-pooler client cap. MAX_ATTEMPTS (8) covers this contention with
// headroom, so with the retry in place every writer commits.
const WRITERS: usize = 8;

async fn setup() -> Option<PgPool> {
    let url = std::env::var("DATABASE_URL").ok()?;
    // The pool must let every writer hold a connection at once, or they serialize at
    // the pool and never contend on the constraint.
    let pool = PgPoolOptions::new()
        .max_connections(WRITERS as u32 + 1)
        .connect(&url)
        .await
        .expect("connect to DATABASE_URL");
    sqlx::raw_sql(SCHEMA)
        .execute(&pool)
        .await
        .expect("create test schema");
    Some(pool)
}

fn cell_body(map_id: Uuid, terrain: &str) -> Value {
    json!({ "map_id": map_id, "q": 0, "r": 0, "terrain_type": terrain, "revealed": true })
}

// Mirrors the handler write path: projection::upsert under retry_tx!.
async fn upsert_retrying(pool: &PgPool, session_id: Uuid, body: Value) -> Value {
    let meta = json!({ "user_id": Uuid::new_v4(), "display_name": "racer" });
    retry_tx!(pool, |tx| {
        projection::upsert(&mut tx, session_id, &body, &meta).await
    })
    .expect("upsert should retry past sequence conflicts, not error")
}

#[tokio::test]
async fn concurrent_upserts_to_one_cell_serialize_without_errors() {
    let Some(pool) = setup().await else {
        eprintln!("skipping hex_concurrency test: DATABASE_URL not set");
        return;
    };

    let session_id = Uuid::new_v4();
    let map_id = Uuid::new_v4();

    // Seed the cell so every racer takes the on-conflict update + event-append path
    // against an existing aggregate (sequence 1).
    upsert_retrying(&pool, session_id, cell_body(map_id, "seed")).await;
    let aggregate_id: Uuid =
        sqlx::query_scalar("select id from hex_cells where map_id = $1 and q = 0 and r = 0")
            .bind(map_id)
            .fetch_one(&pool)
            .await
            .unwrap();

    // Fire all writers at once; a barrier tightens the race so they contend on the
    // same max(sequence) instead of trickling in one at a time.
    let barrier = Arc::new(Barrier::new(WRITERS));
    let mut tasks = Vec::new();
    for n in 0..WRITERS {
        let pool = pool.clone();
        let barrier = barrier.clone();
        tasks.push(tokio::spawn(async move {
            barrier.wait().await;
            upsert_retrying(&pool, session_id, cell_body(map_id, &format!("t{n}"))).await;
        }));
    }
    for t in tasks {
        t.await.expect("writer task should not panic or error");
    }

    // One seed event + one per writer, and the sequence log is gapless and unique.
    let sequences: Vec<i64> = sqlx::query_scalar(
        "select sequence from events where aggregate_type = 'hex_cell' and aggregate_id = $1 order by sequence",
    )
    .bind(aggregate_id)
    .fetch_all(&pool)
    .await
    .unwrap();
    let expected: Vec<i64> = (1..=(WRITERS as i64 + 1)).collect();
    assert_eq!(
        sequences, expected,
        "concurrent appends must produce a gapless, unique sequence log"
    );

    // The read model matches the last write: the surviving hex_cells row equals the
    // payload of the highest-sequence event.
    let (tip_seq, tip_terrain): (i64, Option<String>) = sqlx::query_as(
        "select sequence, payload->>'terrain_type' from events where aggregate_type = 'hex_cell' and aggregate_id = $1 order by sequence desc limit 1",
    )
    .bind(aggregate_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(tip_seq, WRITERS as i64 + 1);
    let live_terrain: Option<String> =
        sqlx::query_scalar("select terrain_type from hex_cells where id = $1")
            .bind(aggregate_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        live_terrain, tip_terrain,
        "read model must reflect the last committed write"
    );

    // Exactly one live row: the burst never forked the aggregate into duplicates.
    let cell_count: i64 =
        sqlx::query_scalar("select count(*) from hex_cells where map_id = $1 and q = 0 and r = 0")
            .bind(map_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cell_count, 1);
}

// Proves the contention above is real, not a race the pool quietly serialized: the
// same burst without retry_tx! loses at least one writer to a sequence conflict. This
// is the failure the retry absorbs — if it ever passes cleanly, the test above is no
// longer exercising the retry and needs a harder burst.
#[tokio::test]
async fn concurrent_upserts_without_retry_hit_sequence_conflicts() {
    let Some(pool) = setup().await else {
        eprintln!("skipping hex_concurrency test: DATABASE_URL not set");
        return;
    };

    let session_id = Uuid::new_v4();
    let map_id = Uuid::new_v4();
    upsert_retrying(&pool, session_id, cell_body(map_id, "seed")).await;

    let barrier = Arc::new(Barrier::new(WRITERS));
    let mut tasks = Vec::new();
    for n in 0..WRITERS {
        let pool = pool.clone();
        let barrier = barrier.clone();
        tasks.push(tokio::spawn(async move {
            let body = cell_body(map_id, &format!("n{n}"));
            let meta = json!({ "user_id": Uuid::new_v4(), "display_name": "racer" });
            barrier.wait().await;
            // A single non-retrying transaction: exactly what retry_tx! wraps once.
            // The 23505 surfaces from the append query, or defensively from commit.
            let mut tx = pool.begin().await.unwrap();
            match projection::upsert(&mut tx, session_id, &body, &meta).await {
                Ok(_) => match tx.commit().await {
                    Ok(()) => false,
                    Err(e) => is_sequence_conflict(&AppError::from(e)),
                },
                Err(e) => is_sequence_conflict(&e),
            }
        }));
    }

    let mut conflicts = 0;
    for t in tasks {
        if t.await.expect("task join") {
            conflicts += 1;
        }
    }
    assert!(
        conflicts > 0,
        "an unretried concurrent burst must lose at least one writer to a sequence conflict"
    );
}
