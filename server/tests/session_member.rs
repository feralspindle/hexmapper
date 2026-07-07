//! integration test for `member_projection::leave`: a member removes only their
//! own row, one `session_member.left` event is recorded, and a replay from the
//! event log drops that member while keeping the rest.
//!
//! gated on `DATABASE_URL` like the other integration tests, skipped when no db is
//! configured, run against an ephemeral postgres in ci. it (re)creates a minimal
//! schema, so point it only at a throwaway db.

use hexmap_server::domains::session::member_projection;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

const SCHEMA: &str = r#"
drop table if exists events;
drop table if exists session_members;
drop table if exists sessions;

create table sessions (
    id        uuid primary key,
    owner_id  uuid not null default gen_random_uuid(),
    play_mode text not null default 'gm'
);

create table session_members (
    session_id          uuid not null,
    user_id             uuid not null,
    joined_at           timestamptz not null default now(),
    last_seen_at        timestamptz,
    active_character_id uuid,
    display_name        text,
    primary key (session_id, user_id)
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

async fn join(pool: &PgPool, session_id: Uuid, user_id: Uuid) {
    let mut tx = pool.begin().await.unwrap();
    member_projection::join(&mut tx, session_id, user_id, &json!({ "user_id": user_id }))
        .await
        .expect("join");
    tx.commit().await.unwrap();
}

#[tokio::test]
async fn leave_removes_only_the_caller_and_replays_from_events() {
    let Some(pool) = setup().await else {
        eprintln!("skipping session_member test: DATABASE_URL not set");
        return;
    };

    let session_id = Uuid::new_v4();
    let me = Uuid::new_v4();
    let other = Uuid::new_v4();

    sqlx::query("insert into sessions (id) values ($1)")
        .bind(session_id)
        .execute(&pool)
        .await
        .unwrap();
    join(&pool, session_id, me).await;
    join(&pool, session_id, other).await;

    // the caller leaves
    let mut tx = pool.begin().await.unwrap();
    member_projection::leave(&mut tx, session_id, me, &json!({ "user_id": me }))
        .await
        .expect("leave");
    tx.commit().await.unwrap();

    // only the caller's row is gone
    let remaining: Vec<Uuid> =
        sqlx::query_scalar("select user_id from session_members where session_id = $1")
            .bind(session_id)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(remaining, vec![other]);

    // one session_member.left event recorded for the caller
    let left_events: i64 = sqlx::query_scalar(
        "select count(*) from events \
         where aggregate_type = 'session_member' and event_type = 'session_member.left' \
           and aggregate_id = md5($1::text || $2::text)::uuid",
    )
    .bind(session_id)
    .bind(me)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(left_events, 1);

    // replaying from the log drops the member who left, keeps the other
    sqlx::raw_sql("create table members_replay (like session_members);")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::raw_sql(&member_projection::replay_select("members_replay"))
        .execute(&pool)
        .await
        .unwrap();
    let replayed: Vec<Uuid> = sqlx::query_scalar("select user_id from members_replay")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(replayed, vec![other]);
}
