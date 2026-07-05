//! Integration tests for the authz helpers against a real Postgres.
//!
//! These queries mirror the RLS policies (`is_session_member`, `is_session_gm`,
//! owner checks) that gate every write endpoint, so a drift between the SQL here
//! and the schema is a security regression, not a style problem.
//!
//! Gated on `DATABASE_URL` exactly like `hex_projection.rs`: skipped when unset,
//! and it (re)creates throwaway tables — point it ONLY at a disposable database.

use hexmap_server::authz;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

const SCHEMA: &str = r#"
drop table if exists session_members cascade;
drop table if exists characters cascade;
drop table if exists dice_macros cascade;
drop table if exists dungeons cascade;
drop table if exists hex_notes cascade;
drop table if exists maps cascade;
drop table if exists sessions cascade;

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
    user_id    uuid not null,
    session_id uuid
);

create table dice_macros (
    id      uuid primary key,
    user_id uuid not null
);

create table dungeons (
    id         uuid primary key,
    session_id uuid not null
);

create table hex_notes (
    id         uuid primary key,
    user_id    uuid not null,
    session_id uuid not null
);

create table maps (
    id         uuid primary key,
    session_id uuid not null
);

create schema if not exists auth;
drop table if exists auth.users cascade;
create table auth.users (
    id                 uuid primary key,
    email              text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
);
"#;

struct Fixture {
    pool: PgPool,
    gm: Uuid,
    player: Uuid,
    outsider: Uuid,
    session: Uuid,
    foreign_session: Uuid,
}

async fn setup() -> Option<Fixture> {
    let url = std::env::var("DATABASE_URL").ok()?;
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect to DATABASE_URL");
    sqlx::raw_sql(SCHEMA).execute(&pool).await.expect("create test schema");

    let fixture = Fixture {
        pool,
        gm: Uuid::new_v4(),
        player: Uuid::new_v4(),
        outsider: Uuid::new_v4(),
        session: Uuid::new_v4(),
        foreign_session: Uuid::new_v4(),
    };

    sqlx::query("insert into sessions (id, owner_id) values ($1, $2), ($3, $4)")
        .bind(fixture.session)
        .bind(fixture.gm)
        .bind(fixture.foreign_session)
        .bind(Uuid::new_v4())
        .execute(&fixture.pool)
        .await
        .unwrap();
    sqlx::query("insert into session_members (session_id, user_id) values ($1, $2)")
        .bind(fixture.session)
        .bind(fixture.player)
        .execute(&fixture.pool)
        .await
        .unwrap();

    Some(fixture)
}

#[tokio::test]
async fn authz_helpers_mirror_the_rls_ownership_rules() {
    let Some(f) = setup().await else {
        eprintln!("skipping authz test: DATABASE_URL not set");
        return;
    };

    // Session membership: owner and member yes, outsider no.
    assert!(authz::is_session_member(&f.pool, f.gm, f.session).await.unwrap());
    assert!(authz::is_session_member(&f.pool, f.player, f.session).await.unwrap());
    assert!(!authz::is_session_member(&f.pool, f.outsider, f.session).await.unwrap());
    assert!(!authz::is_session_member(&f.pool, f.player, f.foreign_session).await.unwrap());

    // GM check is ownership only, never mere membership.
    assert!(authz::is_session_gm(&f.pool, f.gm, f.session).await.unwrap());
    assert!(!authz::is_session_gm(&f.pool, f.player, f.session).await.unwrap());

    // Batched revalidation drops unauthorized sessions and flags GM roles.
    let requested = vec![f.session, f.foreign_session, Uuid::new_v4()];
    let player_roles = authz::authorized_session_roles(&f.pool, f.player, &requested).await.unwrap();
    assert_eq!(player_roles, vec![(f.session, false)]);

    let gm_roles = authz::authorized_session_roles(&f.pool, f.gm, &requested).await.unwrap();
    assert_eq!(gm_roles, vec![(f.session, true)]);

    let none = authz::authorized_session_roles(&f.pool, f.player, &[]).await.unwrap();
    assert!(none.is_empty());

    // Character and macro ownership.
    let character_id = Uuid::new_v4();
    sqlx::query("insert into characters (id, user_id, session_id) values ($1, $2, $3)")
        .bind(character_id)
        .bind(f.player)
        .bind(f.session)
        .execute(&f.pool)
        .await
        .unwrap();
    assert!(authz::owns_character(&f.pool, f.player, character_id).await.unwrap());
    assert!(!authz::owns_character(&f.pool, f.gm, character_id).await.unwrap());
    assert_eq!(
        authz::character_owner_session(&f.pool, character_id).await.unwrap(),
        Some((f.player, Some(f.session)))
    );

    let macro_id = Uuid::new_v4();
    sqlx::query("insert into dice_macros (id, user_id) values ($1, $2)")
        .bind(macro_id)
        .bind(f.player)
        .execute(&f.pool)
        .await
        .unwrap();
    assert!(authz::owns_macro(&f.pool, f.player, macro_id).await.unwrap());
    assert!(!authz::owns_macro(&f.pool, f.outsider, macro_id).await.unwrap());

    // Resource -> session resolution used by the write guards.
    let dungeon_id = Uuid::new_v4();
    sqlx::query("insert into dungeons (id, session_id) values ($1, $2)")
        .bind(dungeon_id)
        .bind(f.session)
        .execute(&f.pool)
        .await
        .unwrap();
    assert_eq!(authz::dungeon_session_id(&f.pool, dungeon_id).await.unwrap(), Some(f.session));
    assert_eq!(authz::dungeon_session_id(&f.pool, Uuid::new_v4()).await.unwrap(), None);

    let map_id = Uuid::new_v4();
    sqlx::query("insert into maps (id, session_id) values ($1, $2)")
        .bind(map_id)
        .bind(f.session)
        .execute(&f.pool)
        .await
        .unwrap();
    assert_eq!(
        authz::row_session_id(&f.pool, authz::SessionTable::Maps, map_id).await.unwrap(),
        Some(f.session)
    );

    let note_id = Uuid::new_v4();
    sqlx::query("insert into hex_notes (id, user_id, session_id) values ($1, $2, $3)")
        .bind(note_id)
        .bind(f.player)
        .bind(f.session)
        .execute(&f.pool)
        .await
        .unwrap();
    assert_eq!(
        authz::hex_note_owner_session(&f.pool, note_id).await.unwrap(),
        Some((f.player, f.session))
    );
    assert_eq!(authz::hex_note_owner_session(&f.pool, Uuid::new_v4()).await.unwrap(), None);

    // Display names resolve with the same fallbacks as the fill_display_name()
    // SQL trigger. Kept in this test: a second #[tokio::test] would re-run
    // setup() concurrently and race the schema drop.
    let cases = [
        (r#"{"full_name": "Full Name", "name": "ignored"}"#, None::<&str>, "Full Name"),
        (r#"{"global_name": "Discord Global"}"#, None, "Discord Global"),
        (r#"{"user_name": "handle"}"#, None, "handle"),
        (r#"{}"#, Some("fallback@example.test"), "fallback@example.test"),
        (r#"{}"#, None, "Adventurer"),
    ];

    for (meta, email, expected) in cases {
        let user_id = Uuid::new_v4();
        sqlx::query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)")
            .bind(user_id)
            .bind(email)
            .bind(meta)
            .execute(&f.pool)
            .await
            .unwrap();
        assert_eq!(authz::resolve_display_name(&f.pool, user_id).await.unwrap(), expected);
    }

    assert_eq!(
        authz::resolve_display_name(&f.pool, Uuid::new_v4()).await.unwrap(),
        "Adventurer"
    );
}
