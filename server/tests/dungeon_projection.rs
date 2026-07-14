//! Integration tests for the dungeon room/corridor/fog projections against a
//! real Postgres — the dungeon counterpart of `hex_projection.rs`.
//!
//! Covers the write paths (create/update/delete with rounding and defaults),
//! the undo "resurrect by id" upsert, fog reveal/hide idempotence, and that the
//! append-only event log can rebuild each read model via `replay_select`.
//!
//! Gated on `DATABASE_URL`: skipped when unset. It (re)creates throwaway
//! tables, so point it ONLY at a disposable database.

use hexmap_server::domains::dungeon::{corridor_projection, fog_projection, room_projection, token_projection};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

const SCHEMA: &str = r#"
drop table if exists events cascade;
drop table if exists dungeon_rooms cascade;
drop table if exists dungeon_corridors cascade;
drop table if exists dungeon_fog_cells cascade;
drop table if exists dungeon_tokens cascade;
drop table if exists characters cascade;
drop table if exists shadow_rooms cascade;
drop table if exists shadow_corridors cascade;
drop table if exists shadow_fog cascade;
drop table if exists shadow_tokens cascade;

create table dungeon_rooms (
    id            uuid primary key,
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
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    items         jsonb not null default '[]'::jsonb,
    doors         jsonb not null default '[]'::jsonb,
    shape         text not null default 'rect',
    points        jsonb not null default '[]'::jsonb
);

create table dungeon_corridors (
    id            uuid primary key,
    dungeon_id    uuid not null,
    session_id    uuid not null,
    x1            int not null,
    y1            int not null,
    x2            int not null,
    y2            int not null,
    label         text,
    width         int not null default 1,
    source_client text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    points        jsonb
);

create table dungeon_fog_cells (
    id            uuid primary key default gen_random_uuid(),
    dungeon_id    uuid not null,
    cell_x        int not null,
    cell_y        int not null,
    source_client text,
    created_at    timestamptz not null default now(),
    unique (dungeon_id, cell_x, cell_y)
);

create table characters (
    id uuid primary key default gen_random_uuid()
);

create table dungeon_tokens (
    id            uuid primary key default gen_random_uuid(),
    dungeon_id    uuid not null,
    session_id    uuid not null,
    character_id  uuid not null references characters(id) on delete cascade,
    x             int not null,
    y             int not null,
    source_client text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (dungeon_id, character_id)
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

create table shadow_rooms     (like dungeon_rooms including defaults);
create table shadow_corridors (like dungeon_corridors including defaults);
create table shadow_fog       (like dungeon_fog_cells including defaults);
create table shadow_tokens    (like dungeon_tokens including defaults);
"#;

async fn setup() -> Option<PgPool> {
    let url = std::env::var("DATABASE_URL").ok()?;
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect to DATABASE_URL");
    sqlx::raw_sql(SCHEMA).execute(&pool).await.expect("create test schema");
    Some(pool)
}

fn meta() -> Value {
    json!({ "user_id": Uuid::new_v4(), "display_name": "Tester" })
}

async fn event_log(pool: &PgPool, aggregate_type: &str, aggregate_id: Uuid) -> Vec<(i64, String)> {
    sqlx::query_as(
        "select sequence, event_type from events where aggregate_type = $1 and aggregate_id = $2 order by sequence",
    )
    .bind(aggregate_type)
    .bind(aggregate_id)
    .fetch_all(pool)
    .await
    .unwrap()
}

async fn count(pool: &PgPool, sql: &str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

#[tokio::test]
async fn dungeon_projections_round_trip_and_replay_from_events() {
    let Some(pool) = setup().await else {
        eprintln!("skipping dungeon_projection test: DATABASE_URL not set");
        return;
    };

    let session_id = Uuid::new_v4();
    let dungeon_id = Uuid::new_v4();

    // --- rooms: create rounds fractional drag coords and fills defaults -----
    let mut tx = pool.begin().await.unwrap();
    let room = room_projection::create(
        &mut tx,
        dungeon_id,
        session_id,
        &json!({ "origin_x": 2.6, "origin_y": 3.4, "width": 4.5, "height": 2.0, "label": "Vault", "source_client": "client-a" }),
        &meta(),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let room_id: Uuid = room["id"].as_str().unwrap().parse().unwrap();
    assert_eq!(room["origin_x"], 3);
    assert_eq!(room["origin_y"], 3);
    assert_eq!(room["width"], 5);
    assert_eq!(room["height"], 2);
    assert_eq!(room["shape"], "rect");
    assert_eq!(room["items"], json!([]));
    assert_eq!(room["doors"], json!([]));

    // --- rooms: partial update touches only patched fields ------------------
    let mut tx = pool.begin().await.unwrap();
    room_projection::update(&mut tx, room_id, &json!({ "label": "Treasury" }), &meta())
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let (label, width): (String, i32) =
        sqlx::query_as("select label, width from dungeon_rooms where id = $1")
            .bind(room_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(label, "Treasury");
    assert_eq!(width, 5);

    // --- rooms: delete then undo-resurrect with the original id -------------
    let mut tx = pool.begin().await.unwrap();
    room_projection::delete(&mut tx, room_id, &meta()).await.unwrap();
    tx.commit().await.unwrap();
    assert_eq!(count(&pool, "select count(*) from dungeon_rooms").await, 0);

    let mut tx = pool.begin().await.unwrap();
    let resurrected = room_projection::create(
        &mut tx,
        dungeon_id,
        session_id,
        &json!({ "id": room_id, "origin_x": 3, "origin_y": 3, "width": 5, "height": 2, "label": "Treasury" }),
        &meta(),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(resurrected["id"].as_str().unwrap(), room_id.to_string());

    let log = event_log(&pool, "dungeon_room", room_id).await;
    assert_eq!(
        log.iter().map(|(seq, ty)| (*seq, ty.as_str())).collect::<Vec<_>>(),
        vec![
            (1, "dungeon_room.created"),
            (2, "dungeon_room.updated"),
            (3, "dungeon_room.deleted"),
            (4, "dungeon_room.created"),
        ],
    );

    // A second room that stays deleted must not reappear on replay.
    let mut tx = pool.begin().await.unwrap();
    let doomed = room_projection::create(
        &mut tx,
        dungeon_id,
        session_id,
        &json!({ "origin_x": 9, "origin_y": 9, "width": 2, "height": 2 }),
        &meta(),
    )
    .await
    .unwrap();
    let doomed_id: Uuid = doomed["id"].as_str().unwrap().parse().unwrap();
    room_projection::delete(&mut tx, doomed_id, &meta()).await.unwrap();
    tx.commit().await.unwrap();

    // --- corridors: create defaults width to 1 and keeps the point chain ----
    let mut tx = pool.begin().await.unwrap();
    let corridor = corridor_projection::create(
        &mut tx,
        dungeon_id,
        session_id,
        &json!({ "x1": 0, "y1": 0, "x2": 4.4, "y2": 6.6, "points": [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 4, "y": 7}] }),
        &meta(),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let corridor_id: Uuid = corridor["id"].as_str().unwrap().parse().unwrap();
    assert_eq!(corridor["width"], 1);
    assert_eq!(corridor["x2"], 4);
    assert_eq!(corridor["y2"], 7);
    assert_eq!(corridor["points"].as_array().unwrap().len(), 3);

    let mut tx = pool.begin().await.unwrap();
    corridor_projection::update(&mut tx, corridor_id, &json!({ "label": "east passage" }), &meta())
        .await
        .unwrap();
    corridor_projection::delete(&mut tx, corridor_id, &meta()).await.unwrap();
    let corridor_back = corridor_projection::create(
        &mut tx,
        dungeon_id,
        session_id,
        &json!({ "id": corridor_id, "x1": 0, "y1": 0, "x2": 4, "y2": 7, "label": "east passage" }),
        &meta(),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(corridor_back["id"].as_str().unwrap(), corridor_id.to_string());
    assert_eq!(event_log(&pool, "dungeon_corridor", corridor_id).await.len(), 4);

    // --- fog: reveal is an idempotent upsert per coordinate -----------------
    let fog_body = json!({ "dungeon_id": dungeon_id, "cell_x": 1, "cell_y": 2, "source_client": "client-a" });
    let mut tx = pool.begin().await.unwrap();
    fog_projection::reveal_one(&mut tx, session_id, &fog_body, &meta()).await.unwrap();
    fog_projection::reveal_one(&mut tx, session_id, &fog_body, &meta()).await.unwrap();
    tx.commit().await.unwrap();
    assert_eq!(count(&pool, "select count(*) from dungeon_fog_cells").await, 1);

    // Bulk reveal only inserts (and only counts) cells that were still hidden.
    let mut tx = pool.begin().await.unwrap();
    let revealed = fog_projection::reveal_bulk(
        &mut tx,
        session_id,
        &json!({ "dungeon_id": dungeon_id, "cells": [
            { "cell_x": 1, "cell_y": 2 },
            { "cell_x": 5, "cell_y": 5 },
            { "cell_x": 6, "cell_y": 5 },
        ]}),
        &meta(),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(revealed, 2);
    assert_eq!(count(&pool, "select count(*) from dungeon_fog_cells").await, 3);

    let mut tx = pool.begin().await.unwrap();
    fog_projection::hide_one(&mut tx, session_id, &json!({ "dungeon_id": dungeon_id, "cell_x": 1, "cell_y": 2 }), &meta())
        .await
        .unwrap();
    let hidden = fog_projection::hide_bulk(
        &mut tx,
        session_id,
        &json!({ "dungeon_id": dungeon_id, "cells": [
            { "cell_x": 5, "cell_y": 5 },
            { "cell_x": 99, "cell_y": 99 },
        ]}),
        &meta(),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(hidden, 1);
    assert_eq!(count(&pool, "select count(*) from dungeon_fog_cells").await, 1);

    // --- tokens: create rounds coords, re-placing the same character moves --
    let character_id = Uuid::new_v4();
    let dead_character_id = Uuid::new_v4();
    sqlx::query("insert into characters (id) values ($1), ($2)")
        .bind(character_id)
        .bind(dead_character_id)
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let token = token_projection::create(
        &mut tx,
        dungeon_id,
        session_id,
        &json!({ "character_id": character_id, "x": 2.6, "y": 3.4, "source_client": "client-a" }),
        &meta(),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let token_id: Uuid = token["id"].as_str().unwrap().parse().unwrap();
    assert_eq!(token["x"], 3);
    assert_eq!(token["y"], 3);

    let mut tx = pool.begin().await.unwrap();
    let replaced = token_projection::create(
        &mut tx,
        dungeon_id,
        session_id,
        &json!({ "character_id": character_id, "x": 7, "y": 8 }),
        &meta(),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(replaced["id"].as_str().unwrap(), token_id.to_string());
    assert_eq!(replaced["x"], 7);
    assert_eq!(count(&pool, "select count(*) from dungeon_tokens").await, 1);

    let mut tx = pool.begin().await.unwrap();
    token_projection::update(&mut tx, token_id, &json!({ "x": 1.2, "y": 0.9 }), &meta())
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let (tx_pos, ty_pos): (i32, i32) =
        sqlx::query_as("select x, y from dungeon_tokens where id = $1")
            .bind(token_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((tx_pos, ty_pos), (1, 1));

    assert_eq!(
        event_log(&pool, "dungeon_token", token_id)
            .await
            .iter()
            .map(|(seq, ty)| (*seq, ty.as_str()))
            .collect::<Vec<_>>(),
        vec![
            (1, "dungeon_token.created"),
            (2, "dungeon_token.created"),
            (3, "dungeon_token.updated"),
        ],
    );

    // A token whose character gets deleted cascades away without a deleted
    // event; replay must not resurrect it.
    let mut tx = pool.begin().await.unwrap();
    token_projection::create(
        &mut tx,
        dungeon_id,
        session_id,
        &json!({ "character_id": dead_character_id, "x": 0, "y": 0 }),
        &meta(),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    sqlx::query("delete from characters where id = $1")
        .bind(dead_character_id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(count(&pool, "select count(*) from dungeon_tokens").await, 1);

    // A deleted token stays deleted on replay.
    let mut tx = pool.begin().await.unwrap();
    let doomed_token = token_projection::create(
        &mut tx,
        Uuid::new_v4(),
        session_id,
        &json!({ "character_id": character_id, "x": 4, "y": 4 }),
        &meta(),
    )
    .await
    .unwrap();
    let doomed_token_id: Uuid = doomed_token["id"].as_str().unwrap().parse().unwrap();
    token_projection::delete(&mut tx, doomed_token_id, &meta()).await.unwrap();
    tx.commit().await.unwrap();

    // --- replay: every read model rebuilds from the event log alone ---------
    sqlx::query(&room_projection::replay_select("shadow_rooms"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(&corridor_projection::replay_select("shadow_corridors"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(&fog_projection::replay_select("shadow_fog"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(&token_projection::replay_select("shadow_tokens"))
        .execute(&pool)
        .await
        .unwrap();

    let shadow_tokens: Vec<(Uuid, i32, i32)> =
        sqlx::query_as("select id, x, y from shadow_tokens").fetch_all(&pool).await.unwrap();
    assert_eq!(shadow_tokens, vec![(token_id, 1, 1)]);

    let shadow_rooms: Vec<(Uuid, String)> =
        sqlx::query_as("select id, label from shadow_rooms").fetch_all(&pool).await.unwrap();
    assert_eq!(shadow_rooms, vec![(room_id, "Treasury".to_string())]);

    let shadow_corridors: Vec<(Uuid, i32)> =
        sqlx::query_as("select id, x2 from shadow_corridors").fetch_all(&pool).await.unwrap();
    assert_eq!(shadow_corridors, vec![(corridor_id, 4)]);

    let live_fog: Vec<(i32, i32)> =
        sqlx::query_as("select cell_x, cell_y from dungeon_fog_cells order by cell_x, cell_y")
            .fetch_all(&pool)
            .await
            .unwrap();
    let shadow_fog: Vec<(i32, i32)> =
        sqlx::query_as("select cell_x, cell_y from shadow_fog order by cell_x, cell_y")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(live_fog, vec![(6, 5)]);
    assert_eq!(shadow_fog, live_fog);

    // --- clear_all wipes the read model and replay agrees -------------------
    let mut tx = pool.begin().await.unwrap();
    let cleared = fog_projection::clear_all(&mut tx, dungeon_id, session_id, &meta()).await.unwrap();
    tx.commit().await.unwrap();
    assert_eq!(cleared, 1);

    sqlx::query("delete from shadow_fog").execute(&pool).await.unwrap();
    sqlx::query(&fog_projection::replay_select("shadow_fog"))
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(count(&pool, "select count(*) from shadow_fog").await, 0);
}
