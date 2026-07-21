//! On-entry hex content generation for exploration mode (solo/GM-less play).
//! Contents roll on the session owner's oracle tables when one carries the
//! matching tag (`hex.terrain`, `hex.poi[.<terrain>]`, `hex.encounter[.<terrain>]`),
//! with built-in fallbacks so exploration works before any content pack is
//! loaded. Roll resolution is shared with the oracle panel via `oracle::roll`;
//! the one divergence is degenerate tables (range gaps, zero weights), which
//! the panel reports as errors while generation logs and treats as "no
//! result" so a bad table can never block party movement.
//!
//! TERRAIN_IDS mirrors the frontend TERRAIN_TYPES ids; the contract is pinned
//! by src/stores/terrainContract.test.js reading this file.

use rand::Rng;
use sqlx::PgPool;
use uuid::Uuid;

use crate::domains::oracle::roll::{self, RollRow, TableRoll};
use crate::error::AppError;

pub const TERRAIN_IDS: &[&str] = &[
    "plains",
    "forest",
    "jungle",
    "mountain",
    "water",
    "coast",
    "desert",
    "swamp",
    "city",
    "dungeon",
    "snow",
    "volcanic",
];

const FALLBACK_TERRAIN: &[(&str, i32)] = &[
    ("plains", 4),
    ("forest", 4),
    ("mountain", 2),
    ("water", 2),
    ("desert", 1),
    ("swamp", 1),
    ("snow", 1),
];

const FALLBACK_POI: &[&str] = &[
    "Ancient ruins",
    "Standing stones",
    "Abandoned watchtower",
    "Overgrown shrine",
    "Hermit's hut",
    "Weathered obelisk",
    "Collapsed mine",
    "Forgotten waymarker",
];

const FALLBACK_ENCOUNTER: &[&str] = &[
    "Bandits demand a toll for passage.",
    "A wandering merchant offers strange wares.",
    "Wolves shadow the party at a distance.",
    "Goblin scouts watch from cover.",
    "A corpse lies picked clean beside the trail.",
    "Distant smoke rises from a hidden camp.",
    "An overgrown battlefield, weapons still rusting in the ground.",
    "A riderless horse grazes, saddlebags intact.",
];

const FALLBACK_FEATURE_CHANCE_IN: u32 = 3;

pub struct GeneratedHex {
    pub terrain_type: String,
    pub label: Option<String>,
    pub notes: Option<String>,
}

enum TagRoll {
    NoTable,
    Nothing,
    Rolled(String),
}

pub async fn generate_contents(
    pool: &PgPool,
    session_id: Uuid,
    existing_terrain: Option<&str>,
) -> Result<GeneratedHex, AppError> {
    let terrain_type = match existing_terrain {
        Some(terrain) if !terrain.is_empty() => terrain.to_string(),
        _ => match roll_tagged_table(pool, session_id, "hex.terrain").await? {
            TagRoll::Rolled(result) => match normalize_terrain(&result) {
                Some(id) => id,
                None => {
                    tracing::warn!(
                        result,
                        "hex.terrain roll is not a known terrain id; using fallback"
                    );
                    fallback_terrain()
                }
            },
            _ => fallback_terrain(),
        },
    };

    let label = roll_feature(pool, session_id, "hex.poi", &terrain_type, FALLBACK_POI).await?;
    let notes = roll_feature(
        pool,
        session_id,
        "hex.encounter",
        &terrain_type,
        FALLBACK_ENCOUNTER,
    )
    .await?;

    Ok(GeneratedHex {
        terrain_type,
        label,
        notes,
    })
}

/// Rolls `<base>.<terrain>` first, then `<base>`. Once any tagged table
/// exists, its (possibly empty) result is authoritative; only when neither
/// table exists does the built-in 1-in-N fallback apply. Empty results mean
/// "nothing here" and yield None.
async fn roll_feature(
    pool: &PgPool,
    session_id: Uuid,
    base_tag: &str,
    terrain: &str,
    fallback: &[&str],
) -> Result<Option<String>, AppError> {
    let terrain_tag = format!("{base_tag}.{terrain}");
    match roll_tagged_table(pool, session_id, &terrain_tag).await? {
        TagRoll::Rolled(result) => Ok(non_empty(result)),
        TagRoll::Nothing => match roll_tagged_table(pool, session_id, base_tag).await? {
            TagRoll::Rolled(result) => Ok(non_empty(result)),
            _ => Ok(None),
        },
        TagRoll::NoTable => match roll_tagged_table(pool, session_id, base_tag).await? {
            TagRoll::Rolled(result) => Ok(non_empty(result)),
            TagRoll::Nothing => Ok(None),
            TagRoll::NoTable => {
                let mut rng = rand::thread_rng();
                if rng.gen_range(0..FALLBACK_FEATURE_CHANCE_IN) == 0 {
                    Ok(Some(fallback[rng.gen_range(0..fallback.len())].to_string()))
                } else {
                    Ok(None)
                }
            }
        },
    }
}

fn normalize_terrain(result: &str) -> Option<String> {
    let id = result.trim().to_lowercase();
    TERRAIN_IDS.contains(&id.as_str()).then_some(id)
}

fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "—" || trimmed == "-" {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn fallback_terrain() -> String {
    let total: i32 = FALLBACK_TERRAIN.iter().map(|(_, w)| w).sum();
    let mut roll = rand::thread_rng().gen_range(1..=total);
    for (terrain, weight) in FALLBACK_TERRAIN {
        roll -= weight;
        if roll <= 0 {
            return (*terrain).to_string();
        }
    }
    "plains".to_string()
}

/// Resolves the most recently updated table carrying `tag` among the tables
/// added to this session (tables are user-owned; adding one to the session is
/// what opts it into the session's automation) in one query: the LEFT JOIN
/// distinguishes a missing table (zero rows) from an existing table with no
/// usable rows. Degenerate outcomes (range gap, no positive weight) log and
/// become Nothing rather than errors.
async fn roll_tagged_table(
    pool: &PgPool,
    session_id: Uuid,
    tag: &str,
) -> Result<TagRoll, AppError> {
    let rows: Vec<(Option<i32>, Option<i32>, Option<i32>, Option<String>, String)> =
        sqlx::query_as(
            r#"
            select r.weight, r.range_min, r.range_max, r.result, ot.mode
            from oracle_tables ot
            left join oracle_table_rows r on r.table_id = ot.id
            where ot.id = (
                select t.id from oracle_tables t
                join session_oracle_tables sot on sot.table_id = t.id
                where sot.session_id = $1 and t.tag = $2
                order by t.updated_at desc
                limit 1
            )
            order by r.position asc, r.created_at asc
            "#,
        )
        .bind(session_id)
        .bind(tag)
        .fetch_all(pool)
        .await?;

    if rows.is_empty() {
        return Ok(TagRoll::NoTable);
    }

    let mode = rows[0].4.clone();
    let mut roll_rows = Vec::new();
    let mut results = Vec::new();
    for (weight, range_min, range_max, result, _) in &rows {
        if let Some(result) = result {
            roll_rows.push(RollRow {
                weight: weight.unwrap_or(1),
                range_min: *range_min,
                range_max: *range_max,
            });
            results.push(result.clone());
        }
    }
    if roll_rows.is_empty() {
        return Ok(TagRoll::Nothing);
    }

    match roll::resolve(&mode, &roll_rows) {
        TableRoll::Range { index, .. } | TableRoll::Weighted { index, .. } => {
            Ok(TagRoll::Rolled(results[index].clone()))
        }
        TableRoll::RangeGap { roll } => {
            tracing::warn!(tag, roll, "tagged oracle table has a range gap; treating as no result");
            Ok(TagRoll::Nothing)
        }
        TableRoll::NoPositiveWeight => Ok(TagRoll::Nothing),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_terrain_ids_are_all_known_terrain_ids() {
        for (terrain, weight) in FALLBACK_TERRAIN {
            assert!(
                TERRAIN_IDS.contains(terrain),
                "fallback terrain {terrain} missing from TERRAIN_IDS"
            );
            assert!(*weight > 0);
        }
    }

    #[test]
    fn normalize_terrain_accepts_known_ids_case_insensitively() {
        assert_eq!(normalize_terrain("Forest"), Some("forest".to_string()));
        assert_eq!(normalize_terrain("  swamp "), Some("swamp".to_string()));
        assert_eq!(normalize_terrain("Rolling grassland"), None);
        assert_eq!(normalize_terrain(""), None);
        assert_eq!(normalize_terrain("—"), None);
    }

    #[test]
    fn fallback_terrain_always_returns_a_known_id() {
        for _ in 0..100 {
            let terrain = fallback_terrain();
            assert!(TERRAIN_IDS.contains(&terrain.as_str()));
        }
    }
}
