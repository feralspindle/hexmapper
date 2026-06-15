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

/// Returns (user_id, session_id) for a hex_note, or None if it does not exist.
/// Used to enforce the `owner or session GM` update/delete policy.
pub async fn hex_note_owner_session(pool: &PgPool, note_id: Uuid) -> Result<Option<(Uuid, Uuid)>, AppError> {
    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        "select user_id, session_id from hex_notes where id = $1",
    )
    .bind(note_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

/// Returns (user_id, session_id) for a dungeon_element_note, or None if it does not
/// exist. Enforces the same `owner or session GM` update/delete policy.
pub async fn dungeon_element_note_owner_session(pool: &PgPool, note_id: Uuid) -> Result<Option<(Uuid, Uuid)>, AppError> {
    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        "select user_id, session_id from dungeon_element_notes where id = $1",
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

/// Returns the session_id for a row in `table` by id, or None if it does not exist.
/// For session-scoped collection tables whose write policy is simply "session member"
/// (party_quests, party_session_notes, etc.). `table` is a trusted internal constant.
pub async fn row_session_id(pool: &PgPool, table: &str, id: Uuid) -> Result<Option<Uuid>, AppError> {
    let session_id: Option<Uuid> = sqlx::query_scalar(&format!("select session_id from {table} where id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;

    Ok(session_id)
}
