use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::dice::{handlers as dice_handlers, projection as dice_projection};
use crate::domains::siege::projection;
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

const NAME_MAX: usize = 80;
const NOTES_MAX: usize = 500;
const BONUS_RANGE: (i32, i32) = (-20, 20);
const CREW_RANGE: (i32, i32) = (0, 8);
const HP_MAX: i32 = 999;

#[derive(Debug, Deserialize)]
pub struct CreateWeaponRequest {
    pub session_id: Uuid,
    pub name: String,
    pub damage_notation: String,
    #[serde(default)]
    pub attack_bonus: i32,
    pub ammo: Option<i32>,
    pub max_ammo: Option<i32>,
    #[serde(default = "ten")]
    pub hp: i32,
    #[serde(default = "ten")]
    pub max_hp: i32,
    #[serde(default = "one")]
    pub crew_required: i32,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub sort_order: i32,
    pub source_client: Option<String>,
}

fn ten() -> i32 {
    10
}
fn one() -> i32 {
    1
}

#[derive(Debug, sqlx::FromRow)]
struct WeaponCore {
    name: String,
    damage_notation: String,
    attack_bonus: i32,
    is_loaded: bool,
    ammo: Option<i32>,
    crew_required: i32,
    crew_count: i32,
}

async fn load_weapon_core(
    pool: &sqlx::PgPool,
    id: Uuid,
) -> Result<Option<WeaponCore>, AppError> {
    sqlx::query_as(
        "select name, damage_notation, attack_bonus, is_loaded, ammo, crew_required, \
         coalesce(array_length(crewed_by, 1), 0) as crew_count \
         from siege_weapons where id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::from)
}

fn validate_common(
    name: &str,
    notation: &str,
    attack_bonus: i32,
    hp: i32,
    max_hp: i32,
    crew_required: i32,
) -> Result<(), AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("weapon name is empty".to_string()));
    }
    if name.chars().count() > NAME_MAX {
        return Err(AppError::BadRequest(format!("weapon name over {NAME_MAX} chars")));
    }
    dice_handlers::validate_notation(notation.trim())?;
    if !(BONUS_RANGE.0..=BONUS_RANGE.1).contains(&attack_bonus) {
        return Err(AppError::BadRequest(format!(
            "attack bonus must be {}..={}",
            BONUS_RANGE.0, BONUS_RANGE.1
        )));
    }
    if hp < 0 || max_hp < 1 || hp > max_hp || max_hp > HP_MAX {
        return Err(AppError::BadRequest("invalid hp / max_hp".to_string()));
    }
    if !(CREW_RANGE.0..=CREW_RANGE.1).contains(&crew_required) {
        return Err(AppError::BadRequest(format!(
            "crew required must be {}..={}",
            CREW_RANGE.0, CREW_RANGE.1
        )));
    }
    Ok(())
}

fn validate_ammo(ammo: Option<i32>, max_ammo: Option<i32>) -> Result<(), AppError> {
    if let Some(a) = ammo {
        if a < 0 {
            return Err(AppError::BadRequest("ammo cannot be negative".to_string()));
        }
    }
    if let Some(m) = max_ammo {
        if m < 0 {
            return Err(AppError::BadRequest("max ammo cannot be negative".to_string()));
        }
    }
    if let (Some(a), Some(m)) = (ammo, max_ammo) {
        if a > m {
            return Err(AppError::BadRequest("ammo cannot exceed max ammo".to_string()));
        }
    }
    Ok(())
}

pub async fn create_weapon(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateWeaponRequest>,
) -> Result<Json<Value>, AppError> {
    if !authz::is_session_gm(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    let name = req.name.trim();
    let notation = req.damage_notation.trim();
    let notes = req.notes.trim();
    if notes.chars().count() > NOTES_MAX {
        return Err(AppError::BadRequest(format!("notes over {NOTES_MAX} chars")));
    }
    validate_common(name, notation, req.attack_bonus, req.hp, req.max_hp, req.crew_required)?;
    validate_ammo(req.ammo, req.max_ammo)?;
    if req.ammo.is_some() && req.max_ammo.is_none() {
        return Err(AppError::BadRequest("tracked ammo needs a max".to_string()));
    }

    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::create(
            &mut tx,
            Uuid::new_v4(),
            req.session_id,
            name,
            notation,
            req.attack_bonus,
            req.ammo,
            req.max_ammo,
            req.hp,
            req.max_hp,
            req.crew_required,
            true,
            notes,
            req.sort_order,
            auth.user_id,
            &metadata,
        )
        .await
    })?;

    Ok(Json(row))
}

pub async fn update_weapon(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(patch): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let session_id = authz::row_session_id(state.pool(), authz::SessionTable::SiegeWeapons, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    if let Some(notation) = patch.get("damage_notation").and_then(Value::as_str) {
        dice_handlers::validate_notation(notation.trim())?;
    }
    if let Some(notes) = patch.get("notes").and_then(Value::as_str) {
        if notes.trim().chars().count() > NOTES_MAX {
            return Err(AppError::BadRequest(format!("notes over {NOTES_MAX} chars")));
        }
    }

    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::update(&mut tx, id, &patch, &metadata).await
    })?;

    Ok(Json(row))
}

pub async fn delete_weapon(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let session_id = authz::row_session_id(state.pool(), authz::SessionTable::SiegeWeapons, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !authz::is_session_gm(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    retry_tx!(state.pool(), |tx| {
        projection::delete(&mut tx, id, &metadata).await
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// fire: rolls attack (1d20+bonus) and damage (weapon notation) through the
/// dice domain, writes both rolls and the weapon update (unload + ammo) in one
/// transaction so ammo is never spent without rolls landing
pub async fn fire_weapon(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let weapon = load_weapon_core(state.pool(), id)
        .await?
        .ok_or(AppError::NotFound)?;
    let session_id = authz::row_session_id(state.pool(), authz::SessionTable::SiegeWeapons, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    if !weapon.is_loaded {
        return Err(AppError::BadRequest("weapon is not loaded".to_string()));
    }
    if weapon.ammo == Some(0) {
        return Err(AppError::BadRequest("weapon is out of ammo".to_string()));
    }

    let attack_payload =
        dice_handlers::roll_event_payload("1d20", weapon.attack_bonus, Some(&format!("{} attack", weapon.name)), None)?;
    let damage_payload =
        dice_handlers::roll_event_payload(&weapon.damage_notation, 0, Some(&format!("{} damage", weapon.name)), None)?;

    let metadata = auth.metadata();
    let attack_event = NewEvent {
        aggregate_type: "dice_roll",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(session_id),
        event_type: "dice_roll.rolled",
        payload: attack_payload,
        metadata: metadata.clone(),
    };
    let damage_event = NewEvent {
        aggregate_type: "dice_roll",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(session_id),
        event_type: "dice_roll.rolled",
        payload: damage_payload,
        metadata,
    };

    let (weapon_row, attack_row, damage_row) = retry_tx!(state.pool(), |tx| {
        let weapon_row = projection::fire(&mut tx, id, &auth.metadata()).await?;
        let attack_row = dice_projection::append_and_project(&mut tx, &attack_event).await?;
        let damage_row = dice_projection::append_and_project(&mut tx, &damage_event).await?;
        Ok::<_, AppError>((weapon_row, attack_row, damage_row))
    })?;

    Ok(Json(json!({
        "weapon": weapon_row,
        "attack": attack_row,
        "damage": damage_row,
    })))
}

pub async fn reload_weapon(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let session_id = authz::row_session_id(state.pool(), authz::SessionTable::SiegeWeapons, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let weapon = load_weapon_core(state.pool(), id)
        .await?
        .ok_or(AppError::NotFound)?;
    if weapon.crew_count < weapon.crew_required {
        return Err(AppError::BadRequest(format!(
            "needs {} crew ({} assigned)",
            weapon.crew_required, weapon.crew_count
        )));
    }

    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::reload(&mut tx, id, &metadata).await
    })?;

    Ok(Json(row))
}

#[derive(Debug, Deserialize)]
pub struct CrewRequest {
    pub character_id: Uuid,
    pub action: String,
}

pub async fn change_crew(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<CrewRequest>,
) -> Result<Json<Value>, AppError> {
    let session_id = authz::row_session_id(state.pool(), authz::SessionTable::SiegeWeapons, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    let join = match req.action.as_str() {
        "join" => true,
        "leave" => false,
        other => {
            return Err(AppError::BadRequest(format!(
                "action must be join or leave (got {other:?})"
            )))
        }
    };

    // crew slots hold characters: the character must belong to this session and
    // to the requesting user (GMs can slot anyone's)
    let (owner_id, character_session) = authz::character_owner_session(state.pool(), req.character_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if character_session != Some(session_id) {
        return Err(AppError::BadRequest("character is not in this session".to_string()));
    }
    if owner_id != auth.user_id
        && !authz::is_session_gm(state.pool(), auth.user_id, session_id).await?
    {
        return Err(AppError::Forbidden);
    }

    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::change_crew(&mut tx, id, req.character_id, join, &metadata).await
    })?;

    Ok(Json(row))
}

#[derive(Debug, Deserialize)]
pub struct DamageRequest {
    pub amount: i32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_accepts_typical_weapon() {
        assert!(validate_common("Ballista", "3d6!", 3, 10, 10, 2).is_ok());
        assert!(validate_common("Catapult", "2d8!>=7", -2, 20, 25, 0).is_ok());
    }

    #[test]
    fn validate_rejects_bad_names() {
        assert!(validate_common("  ", "3d6!", 0, 10, 10, 1).is_err());
        assert!(validate_common(&"x".repeat(NAME_MAX + 1), "3d6!", 0, 10, 10, 1).is_err());
    }

    #[test]
    fn validate_rejects_bad_notation() {
        assert!(validate_common("Ballista", "words", 0, 10, 10, 1).is_err());
        assert!(validate_common("Ballista", "2d13", 0, 10, 10, 1).is_err());
        assert!(validate_common("Ballista", "21d6!", 0, 10, 10, 1).is_err());
        // diceless expressions are not damage
        assert!(validate_common("Ballista", "5", 0, 10, 10, 1).is_err());
    }

    #[test]
    fn validate_rejects_out_of_range_fields() {
        assert!(validate_common("B", "3d6!", 21, 10, 10, 1).is_err());
        assert!(validate_common("B", "3d6!", 0, -1, 10, 1).is_err());
        assert!(validate_common("B", "3d6!", 0, 11, 10, 1).is_err());
        assert!(validate_common("B", "3d6!", 0, 10, 10, 9).is_err());
    }

    #[test]
    fn validate_ammo_bounds() {
        assert!(validate_ammo(None, None).is_ok());
        assert!(validate_ammo(Some(5), Some(10)).is_ok());
        assert!(validate_ammo(Some(-1), Some(10)).is_err());
        assert!(validate_ammo(Some(11), Some(10)).is_err());
        assert!(validate_ammo(Some(10), Some(-1)).is_err());
    }

    #[test]
    fn explosion_notation_is_valid_weapon_damage() {
        // the whole point: exploding dice as siege damage
        assert!(dice_handlers::validate_notation("3d6!").is_ok());
        assert!(dice_handlers::validate_notation("2d10!!").is_ok());
        assert!(dice_handlers::validate_notation("4d8!>=6+1").is_ok());
    }
}

pub async fn damage_weapon(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<DamageRequest>,
) -> Result<Json<Value>, AppError> {
    let session_id = authz::row_session_id(state.pool(), authz::SessionTable::SiegeWeapons, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !authz::is_session_member(state.pool(), auth.user_id, session_id).await? {
        return Err(AppError::Forbidden);
    }

    if req.amount == 0 || req.amount.abs() > HP_MAX {
        return Err(AppError::BadRequest("damage amount out of range".to_string()));
    }
    let event_type = if req.amount > 0 {
        "siege_weapon.damaged"
    } else {
        "siege_weapon.repaired"
    };

    let metadata = auth.metadata();
    let row = retry_tx!(state.pool(), |tx| {
        projection::damage(&mut tx, id, req.amount, event_type, &metadata).await
    })?;

    Ok(Json(row))
}
