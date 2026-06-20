use std::collections::BTreeMap;

use axum::extract::State;
use axum::Json;
use chrono::{DateTime, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::dice::{annotation_projection, projection};
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

const ALLOWED_DICE: &[&str] = &["d1", "d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const MAX_PER_DIE: i32 = 20;
const MAX_TOTAL_DICE: i32 = 40;

#[derive(Debug, Deserialize)]
pub struct RollDiceRequest {
    pub session_id: Uuid,
    pub pending: BTreeMap<String, i32>,
    #[serde(default)]
    pub modifier: i32,
    pub label: Option<String>,
    pub character_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
struct DieResult {
    die: String,
    value: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DiceRollRow {
    pub id: Uuid,
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub pending: serde_json::Value,
    pub modifier: i32,
    pub results: serde_json::Value,
    pub total: i32,
    pub created_at: DateTime<Utc>,
    pub label: Option<String>,
    pub character_id: Option<Uuid>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AnnotationRow {
    pub id: Uuid,
    pub roll_id: Uuid,
    pub session_id: Uuid,
    pub user_id: Option<Uuid>,
    pub display_name: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAnnotationRequest {
    pub roll_id: Uuid,
    pub session_id: Uuid,
    pub body: String,
}

pub async fn create_annotation(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateAnnotationRequest>,
) -> Result<Json<AnnotationRow>, AppError> {
    // RLS: dice_annot_member_insert = (auth.uid() = user_id) AND is_session_member.
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    let body = req.body.trim();
    if body.is_empty() {
        return Err(AppError::BadRequest("annotation body is empty".to_string()));
    }

    // Resolve display_name server-side (mirrors the fill_display_name trigger) so the
    // event carries it and replay is self-contained.
    let display_name = authz::resolve_display_name(state.pool(), auth.user_id).await?;

    let event = NewEvent {
        aggregate_type: "dice_roll_annotation",
        aggregate_id: Uuid::new_v4(),
        session_id: Some(req.session_id),
        event_type: "dice_roll_annotation.created",
        payload: json!({ "roll_id": req.roll_id, "body": body }),
        metadata: auth.metadata_with(json!({ "display_name": display_name })),
    };

    let row = retry_tx!(state.pool(), |tx| {
        annotation_projection::append_and_project(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

pub async fn roll_dice(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<RollDiceRequest>,
) -> Result<Json<DiceRollRow>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }

    if let Some(character_id) = req.character_id {
        if !authz::owns_character(state.pool(), auth.user_id, character_id).await? {
            return Err(AppError::Forbidden);
        }
    }

    let (results, total) = roll(&req.pending, req.modifier)?;
    let stats = compute_stats(&req.pending, req.modifier, total);

    let row_id = Uuid::new_v4();

    let event = NewEvent {
        aggregate_type: "dice_roll",
        aggregate_id: row_id,
        session_id: Some(req.session_id),
        event_type: "dice_roll.rolled",
        payload: json!({
            "pending": req.pending,
            "modifier": req.modifier,
            "label": req.label,
            "character_id": req.character_id,
            "results": results,
            "total": total,
            "stats": stats,
        }),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_and_project(&mut tx, &event).await
    })?;

    Ok(Json(row))
}

fn build_notation(pending: &BTreeMap<String, i32>, modifier: i32) -> String {
    let mut parts: Vec<String> = pending
        .iter()
        .filter(|(_, &count)| count > 0)
        .map(|(die, count)| format!("{count}{die}"))
        .collect();

    match modifier.cmp(&0) {
        std::cmp::Ordering::Greater => parts.push(modifier.to_string()),
        std::cmp::Ordering::Less => parts.push(modifier.to_string()),
        std::cmp::Ordering::Equal => {}
    }

    parts.join("+").replace("+-", "-")
}

fn compute_stats(pending: &BTreeMap<String, i32>, modifier: i32, total: i32) -> Option<ttrpg_dice_engine::engine::DistributionPosition> {
    let notation = build_notation(pending, modifier);
    match ttrpg_dice_engine::distribution(&notation) {
        Ok(dist) => Some(dist.position_of(total as i64)),
        Err(err) => {
            tracing::warn!("failed to compute dice roll stats for notation {notation:?}: {err}");
            None
        }
    }
}

fn roll(pending: &BTreeMap<String, i32>, modifier: i32) -> Result<(Vec<DieResult>, i32), AppError> {
    let mut results = Vec::new();
    let mut total = modifier;
    let mut total_dice: i32 = 0;
    let mut rng = rand::thread_rng();

    for (die, &count) in pending {
        if count <= 0 {
            continue;
        }

        if !ALLOWED_DICE.contains(&die.as_str()) {
            return Err(AppError::BadRequest(format!("invalid die type: {die}")));
        }

        if count > MAX_PER_DIE {
            return Err(AppError::BadRequest(format!(
                "max {MAX_PER_DIE} of any one die type (got {count} {die})"
            )));
        }

        total_dice += count;
        if total_dice > MAX_TOTAL_DICE {
            return Err(AppError::BadRequest(format!("max {MAX_TOTAL_DICE} total dice per roll")));
        }

        let sides: i32 = die[1..].parse().map_err(|_| AppError::BadRequest(format!("invalid die type: {die}")))?;

        for _ in 0..count {
            let value = if sides == 1 { 1 } else { rng.gen_range(1..=sides) };
            results.push(DieResult { die: die.clone(), value });
            total += value;
        }
    }

    if total_dice == 0 {
        return Err(AppError::BadRequest("no dice to roll".to_string()));
    }

    Ok((results, total))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_notation_single_die() {
        let pending = BTreeMap::from([("d20".to_string(), 1)]);
        assert_eq!(build_notation(&pending, 0), "1d20");
        assert_eq!(build_notation(&pending, 5), "1d20+5");
        assert_eq!(build_notation(&pending, -3), "1d20-3");
    }

    #[test]
    fn build_notation_multiple_dice() {
        let pending = BTreeMap::from([("d6".to_string(), 2), ("d20".to_string(), 1)]);
        assert_eq!(build_notation(&pending, 0), "1d20+2d6");
    }

    #[test]
    fn build_notation_skips_zero_counts() {
        let pending = BTreeMap::from([("d4".to_string(), 0), ("d6".to_string(), 3)]);
        assert_eq!(build_notation(&pending, 0), "3d6");
    }

    #[test]
    fn compute_stats_for_all_allowed_dice() {
        for die in ALLOWED_DICE {
            let pending = BTreeMap::from([(die.to_string(), 1)]);
            let stats = compute_stats(&pending, 0, 1);
            assert!(stats.is_some(), "expected stats for {die}");
        }
    }

    #[test]
    fn compute_stats_with_modifier_and_multiple_dice() {
        let pending = BTreeMap::from([("d6".to_string(), 2), ("d20".to_string(), 1)]);
        let stats = compute_stats(&pending, 3, 10).unwrap();
        assert!((stats.mean - 20.5).abs() < 0.001);
    }
}
