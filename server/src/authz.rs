use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

/// Mirrors the `is_session_member` SQL function: true if the user owns the
/// session or is listed in session_members.
pub async fn is_session_member(pool: &PgPool, user_id: Uuid, session_id: Uuid) -> Result<bool, AppError> {
    let is_member: bool = sqlx::query_scalar(
        r#"
        select exists (
            select 1 from sessions where id = $1 and owner_id = $2
            union all
            select 1 from session_members where session_id = $1 and user_id = $2
        )
        "#,
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(is_member)
}

/// Returns the currently authorized subscriptions and whether the user owns each
/// session. A single query keeps heartbeat revalidation bounded per connection.
pub async fn authorized_session_roles(
    pool: &PgPool,
    user_id: Uuid,
    session_ids: &[Uuid],
) -> Result<Vec<(Uuid, bool)>, AppError> {
    if session_ids.is_empty() {
        return Ok(Vec::new());
    }

    let roles = sqlx::query_as::<_, (Uuid, bool)>(
        r#"
        select requested.session_id,
               exists (
                   select 1 from sessions s
                   where s.id = requested.session_id and s.owner_id = $1
               ) as is_gm
        from unnest($2::uuid[]) as requested(session_id)
        where exists (
            select 1 from sessions s
            where s.id = requested.session_id and s.owner_id = $1
        )
        or exists (
            select 1 from session_members sm
            where sm.session_id = requested.session_id and sm.user_id = $1
        )
        "#,
    )
    .bind(user_id)
    .bind(session_ids)
    .fetch_all(pool)
    .await?;

    Ok(roles)
}

/// Mirrors the ownership check in roll_dice: the character must belong to the caller.
pub async fn owns_character(pool: &PgPool, user_id: Uuid, character_id: Uuid) -> Result<bool, AppError> {
    let owns: bool = sqlx::query_scalar(
        "select exists (select 1 from characters where id = $1 and user_id = $2)",
    )
    .bind(character_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(owns)
}

/// Mirrors the `dice_macros: delete own` RLS policy: the macro must belong to the caller.
pub async fn owns_macro(pool: &PgPool, user_id: Uuid, macro_id: Uuid) -> Result<bool, AppError> {
    let owns: bool = sqlx::query_scalar(
        "select exists (select 1 from dice_macros where id = $1 and user_id = $2)",
    )
    .bind(macro_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(owns)
}

/// Mirrors the `is_session_gm` SQL function: true if the user owns the session.
pub async fn is_session_gm(pool: &PgPool, user_id: Uuid, session_id: Uuid) -> Result<bool, AppError> {
    let is_gm: bool = sqlx::query_scalar(
        "select exists (select 1 from sessions where id = $1 and owner_id = $2)",
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(is_gm)
}

/// Returns the session_id a dungeon belongs to, or None if the dungeon does not exist.
pub async fn dungeon_session_id(pool: &PgPool, dungeon_id: Uuid) -> Result<Option<Uuid>, AppError> {
    let session_id: Option<Uuid> = sqlx::query_scalar(
        "select session_id from dungeons where id = $1",
    )
    .bind(dungeon_id)
    .fetch_optional(pool)
    .await?;

    Ok(session_id)
}

/// Resolves the display name for a user the same way the `fill_display_name()` SQL
/// trigger does (coalescing auth.users metadata), for storing in events so replay is
/// self-contained.
pub async fn resolve_display_name(pool: &PgPool, user_id: Uuid) -> Result<String, AppError> {
    let name: Option<String> = sqlx::query_scalar(
        r#"
        select coalesce(
            raw_user_meta_data->>'full_name',
            raw_user_meta_data->>'global_name',
            raw_user_meta_data->>'name',
            raw_user_meta_data->>'user_name',
            email,
            'Adventurer'
        )
        from auth.users
        where id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(name.unwrap_or_else(|| "Adventurer".to_string()))
}

/// Returns (user_id, session_id, hex_cell_id) for a hex_note, or None if it does not
/// exist. Used to enforce the `owner or session GM` update/delete policy; the parent
/// id rides along so event payloads can carry it for client-side filtering.
pub async fn hex_note_owner_session(pool: &PgPool, note_id: Uuid) -> Result<Option<(Uuid, Uuid, Uuid)>, AppError> {
    let row: Option<(Uuid, Uuid, Uuid)> = sqlx::query_as(
        "select user_id, session_id, hex_cell_id from hex_notes where id = $1",
    )
    .bind(note_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

/// Returns (user_id, session_id, element_id) for a dungeon_element_note, or None if
/// it does not exist. Enforces the same `owner or session GM` update/delete policy.
pub async fn dungeon_element_note_owner_session(pool: &PgPool, note_id: Uuid) -> Result<Option<(Uuid, Uuid, Uuid)>, AppError> {
    let row: Option<(Uuid, Uuid, Uuid)> = sqlx::query_as(
        "select user_id, session_id, element_id from dungeon_element_notes where id = $1",
    )
    .bind(note_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

/// Returns (user_id, session_id) for a character, or None if it does not exist.
/// session_id is nullable (a character may not belong to a session).
pub async fn character_owner_session(pool: &PgPool, id: Uuid) -> Result<Option<(Uuid, Option<Uuid>)>, AppError> {
    let row: Option<(Uuid, Option<Uuid>)> = sqlx::query_as(
        "select user_id, session_id from characters where id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

/// Returns (character_owner_user_id, session_id, dungeon_id) for a dungeon_token, or
/// None if it does not exist. Enforces the `character owner or session GM` move/delete
/// policy; the dungeon id rides along for the fog placement check.
pub async fn dungeon_token_owner_session(pool: &PgPool, token_id: Uuid) -> Result<Option<(Uuid, Uuid, Uuid)>, AppError> {
    let row: Option<(Uuid, Uuid, Uuid)> = sqlx::query_as(
        r#"
        select c.user_id, t.session_id, t.dungeon_id
        from dungeon_tokens t
        join characters c on c.id = t.character_id
        where t.id = $1
        "#,
    )
    .bind(token_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

/// Returns (author_user_id, session_id) for a party_session_note, or None if it does
/// not exist. Enforces the `author or session GM` update/delete policy. author_user_id
/// is stored as text.
pub async fn party_session_note_author_session(pool: &PgPool, note_id: Uuid) -> Result<Option<(Option<String>, Uuid)>, AppError> {
    let row: Option<(Option<String>, Uuid)> = sqlx::query_as(
        "select author_user_id, session_id from party_session_notes where id = $1",
    )
    .bind(note_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

/// Tables that `row_session_id` is permitted to query. All callers pass a variant
/// directly, so any attempt to introduce a dynamic/user-controlled table name is a
/// compile error rather than a runtime SQL injection risk.
#[derive(Clone, Copy)]
pub enum SessionTable {
    Maps,
    PartyQuests,
    PartyVaultContainers,
    PartyVaultLoot,
    PartyVaultItems,
    DungeonRooms,
    DungeonCorridors,
}

impl SessionTable {
    fn as_str(self) -> &'static str {
        match self {
            Self::Maps                  => "maps",
            Self::PartyQuests           => "party_quests",
            Self::PartyVaultContainers  => "party_vault_containers",
            Self::PartyVaultLoot        => "party_vault_loot",
            Self::PartyVaultItems       => "party_vault_items",
            Self::DungeonRooms          => "dungeon_rooms",
            Self::DungeonCorridors      => "dungeon_corridors",
        }
    }
}

/// Returns the session_id for a row by id, or None if it does not exist.
/// Accepts only `SessionTable` variants — table names are never user-controlled.
pub async fn row_session_id(pool: &PgPool, table: SessionTable, id: Uuid) -> Result<Option<Uuid>, AppError> {
    let session_id: Option<Uuid> =
        sqlx::query_scalar(&format!("select session_id from {} where id = $1", table.as_str()))
            .bind(id)
            .fetch_optional(pool)
            .await?;

    Ok(session_id)
}
