//! Projection of `siege_weapon` events into `siege_weapons`. Full-snapshot
//! events, collection aggregate (see vault loot_projection.rs pattern).
//!
//! Fire / reload / crew / damage are all projections of a full row snapshot —
//! they differ only in event_type for audit purposes.

use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

const COLS: &str = "id, session_id, name, damage_notation, attack_bonus, ammo, max_ammo, hp, max_hp, crew_required, crewed_by, is_loaded, notes, sort_order, created_by, created_at, updated_at";

/// jsonb -> uuid[] (to_jsonb of a uuid[] column round-trips as a text array;
/// array_agg over an empty set is null, hence the coalesce)
fn crew_from_jsonb(s: &str) -> String {
    format!(
        "coalesce((select array_agg(x::uuid) from jsonb_array_elements_text({s}->'crewed_by') as ce(x)), '{{}}')"
    )
}

fn snapshot_columns(s: &str) -> String {
    format!(
        r#"
        ({s}->>'id')::uuid,
        ({s}->>'session_id')::uuid,
        {s}->>'name',
        {s}->>'damage_notation',
        ({s}->>'attack_bonus')::int,
        ({s}->>'ammo')::int,
        ({s}->>'max_ammo')::int,
        ({s}->>'hp')::int,
        ({s}->>'max_hp')::int,
        ({s}->>'crew_required')::int,
        {crew},
        ({s}->>'is_loaded')::boolean,
        {s}->>'notes',
        ({s}->>'sort_order')::int,
        ({s}->>'created_by')::uuid,
        ({s}->>'created_at')::timestamptz,
        ({s}->>'updated_at')::timestamptz
        "#,
        crew = crew_from_jsonb(s),
    )
}

#[allow(clippy::too_many_arguments)]
pub async fn create(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    session_id: Uuid,
    name: &str,
    damage_notation: &str,
    attack_bonus: i32,
    ammo: Option<i32>,
    max_ammo: Option<i32>,
    hp: i32,
    max_hp: i32,
    crew_required: i32,
    is_loaded: bool,
    notes: &str,
    sort_order: i32,
    created_by: Uuid,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with ins as (
            insert into siege_weapons (id, session_id, name, damage_notation, attack_bonus, ammo, max_ammo, hp, max_hp, crew_required, crewed_by, is_loaded, notes, sort_order, created_by)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '{}'::uuid[], $11, $12, $13, $14)
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'siege_weapon', ins.id, ins.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'siege_weapon' and e.aggregate_id = ins.id), 0) + 1,
                'siege_weapon.created', to_jsonb(ins), $15
            from ins
        )
        select to_jsonb(ins) from ins
        "#,
    )
    .bind(id).bind(session_id).bind(name).bind(damage_notation)
    .bind(attack_bonus).bind(ammo).bind(max_ammo).bind(hp).bind(max_hp)
    .bind(crew_required).bind(is_loaded).bind(notes).bind(sort_order)
    .bind(created_by).bind(metadata)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

pub async fn update(tx: &mut Transaction<'_, Postgres>, id: Uuid, patch: &Value, metadata: &Value) -> Result<Value, AppError> {
    let sql = format!(
        r#"
        with upd as (
            update siege_weapons set
                name            = coalesce($2->>'name', name),
                damage_notation = coalesce($2->>'damage_notation', damage_notation),
                attack_bonus    = coalesce(($2->>'attack_bonus')::int, attack_bonus),
                ammo            = case when $2 ? 'ammo' then ($2->>'ammo')::int else ammo end,
                max_ammo        = case when $2 ? 'max_ammo' then ($2->>'max_ammo')::int else max_ammo end,
                hp              = coalesce(($2->>'hp')::int, hp),
                max_hp          = coalesce(($2->>'max_hp')::int, max_hp),
                crew_required   = coalesce(($2->>'crew_required')::int, crew_required),
                crewed_by       = case when $2 ? 'crewed_by' then {crew_patch} else crewed_by end,
                is_loaded       = coalesce(($2->>'is_loaded')::boolean, is_loaded),
                notes           = coalesce($2->>'notes', notes),
                sort_order      = coalesce(($2->>'sort_order')::int, sort_order),
                updated_at      = now()
            where id = $1
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'siege_weapon', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'siege_weapon' and e.aggregate_id = upd.id), 0) + 1,
                'siege_weapon.updated', to_jsonb(upd), $3
            from upd
        )
        select to_jsonb(upd) from upd
        "#,
        crew_patch = crew_from_jsonb("$2"),
    );
    let row: Value = sqlx::query_scalar(&sql)
    .bind(id).bind(patch).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(row)
}

/// fire: unload + spend one ammo (untracked weapons keep a null ammo). the
/// where clause re-checks loaded/ammo under the write lock so two racing fire
/// calls cannot both succeed
pub async fn fire(tx: &mut Transaction<'_, Postgres>, id: Uuid, metadata: &Value) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with upd as (
            update siege_weapons set
                is_loaded = false,
                ammo = case when ammo is null then null else greatest(ammo - 1, 0) end,
                updated_at = now()
            where id = $1 and is_loaded and (ammo is null or ammo > 0)
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'siege_weapon', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'siege_weapon' and e.aggregate_id = upd.id), 0) + 1,
                'siege_weapon.fired', to_jsonb(upd), $2
            from upd
        )
        select to_jsonb(upd) from upd
        "#,
    )
    .bind(id).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(AppError::BadRequest("weapon is not loaded or out of ammo".to_string()))?;

    Ok(row)
}

/// reload: requires crew_count >= crew_required, enforced in SQL
pub async fn reload(tx: &mut Transaction<'_, Postgres>, id: Uuid, metadata: &Value) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with upd as (
            update siege_weapons set
                is_loaded = true,
                updated_at = now()
            where id = $1 and coalesce(array_length(crewed_by, 1), 0) >= crew_required
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'siege_weapon', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'siege_weapon' and e.aggregate_id = upd.id), 0) + 1,
                'siege_weapon.reloaded', to_jsonb(upd), $2
            from upd
        )
        select to_jsonb(upd) from upd
        "#,
    )
    .bind(id).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(AppError::BadRequest("not enough crew to reload".to_string()))?;

    Ok(row)
}

/// crew change: join appends (idempotent), leave removes (idempotent)
pub async fn change_crew(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    character_id: Uuid,
    join: bool,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with upd as (
            update siege_weapons set
                crewed_by = case
                    when $3 then case when $2::uuid = any(crewed_by) then crewed_by else crewed_by || $2::uuid end
                    else array_remove(crewed_by, $2::uuid)
                end,
                updated_at = now()
            where id = $1
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'siege_weapon', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'siege_weapon' and e.aggregate_id = upd.id), 0) + 1,
                'siege_weapon.crew_changed', to_jsonb(upd), $4
            from upd
        )
        select to_jsonb(upd) from upd
        "#,
    )
    .bind(id).bind(character_id).bind(join).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(row)
}

/// damage (positive) or repair (negative); hp is clamped to 0..max_hp
pub async fn damage(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    amount: i32,
    event_type: &str,
    metadata: &Value,
) -> Result<Value, AppError> {
    let row: Value = sqlx::query_scalar(
        r#"
        with upd as (
            update siege_weapons set
                hp = least(greatest(hp - $2, 0), max_hp),
                updated_at = now()
            where id = $1
            returning *
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'siege_weapon', upd.id, upd.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'siege_weapon' and e.aggregate_id = upd.id), 0) + 1,
                $3, to_jsonb(upd), $4
            from upd
        )
        select to_jsonb(upd) from upd
        "#,
    )
    .bind(id).bind(amount).bind(event_type).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(row)
}

pub async fn delete(tx: &mut Transaction<'_, Postgres>, id: Uuid, metadata: &Value) -> Result<(), AppError> {
    sqlx::query(
        r#"
        with del as (
            delete from siege_weapons where id = $1 returning session_id
        ),
        evt as (
            insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata)
            select 'siege_weapon', $1, del.session_id,
                coalesce((select max(sequence) from events e where e.aggregate_type = 'siege_weapon' and e.aggregate_id = $1), 0) + 1,
                'siege_weapon.deleted', '{}'::jsonb, $2
            from del
        )
        select 1
        "#,
    )
    .bind(id).bind(metadata)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(())
}

pub fn replay_select(target_table: &str) -> String {
    format!(
        r#"
        insert into {target_table} ({COLS})
        select distinct on (e.aggregate_id) {cols}
        from events e
        where e.aggregate_type = 'siege_weapon'
          and e.event_type in ('siege_weapon.created', 'siege_weapon.updated', 'siege_weapon.fired', 'siege_weapon.reloaded', 'siege_weapon.crew_changed', 'siege_weapon.damaged', 'siege_weapon.repaired')
          and not exists (
            select 1 from events d
            where d.aggregate_type = 'siege_weapon' and d.aggregate_id = e.aggregate_id
              and d.event_type = 'siege_weapon.deleted'
          )
        order by e.aggregate_id, e.sequence desc
        "#,
        cols = snapshot_columns("e.payload"),
    )
}
