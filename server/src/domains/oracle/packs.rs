//! built-in oracle table packs (#48). a pack is a json bundle of tables in the
//! chained format; installing one creates ordinary tables in the installing
//! user's library through the event-sourced projections, so the copies are
//! user-editable and nothing references the pack afterwards. chain keys
//! resolve inside the pack at install time.

use std::collections::{HashMap, HashSet};

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::authz;
use crate::domains::oracle::projection;
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

const STARTER_PACK: &str = include_str!("packs/shadowdark_starter.json");

#[derive(Debug, Deserialize)]
pub struct Pack {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tables: Vec<PackTable>,
}

#[derive(Debug, Deserialize)]
pub struct PackTable {
    pub key: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    pub tag: Option<String>,
    pub rows: Vec<PackRow>,
}

#[derive(Debug, Deserialize)]
pub struct PackRow {
    #[serde(default = "default_weight")]
    pub weight: i32,
    pub range: Option<[i32; 2]>,
    pub result: String,
    #[serde(default)]
    pub notes: String,
    pub chain: Option<String>,
}

fn default_mode() -> String {
    "weighted".to_string()
}

fn default_weight() -> i32 {
    1
}

pub fn builtin_packs() -> Result<Vec<Pack>, AppError> {
    [STARTER_PACK]
        .iter()
        .map(|raw| {
            // unreachable in practice - the packs are compile-time embedded and
            // unit-tested, but a handler can't panic
            serde_json::from_str(raw).map_err(|err| {
                AppError::BadRequest(format!("builtin pack failed to parse (server bug): {err}"))
            })
        })
        .collect()
}

#[derive(Debug, Serialize)]
pub struct PackSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tables: usize,
    pub rows: usize,
}

pub async fn list_packs(
    State(_state): State<AppState>,
    _auth: AuthUser,
) -> Result<Json<Vec<PackSummary>>, AppError> {
    let packs = builtin_packs()?;
    Ok(Json(
        packs
            .iter()
            .map(|pack| PackSummary {
                id: pack.id.clone(),
                name: pack.name.clone(),
                description: pack.description.clone(),
                tables: pack.tables.len(),
                rows: pack.tables.iter().map(|t| t.rows.len()).sum(),
            })
            .collect(),
    ))
}

#[derive(Debug, Deserialize)]
pub struct InstallPackRequest {
    pub session_id: Uuid,
    pub pack_id: String,
}

#[derive(Debug, Serialize)]
pub struct InstallPackResponse {
    pub installed_tables: usize,
    pub installed_rows: usize,
}

pub async fn install_pack(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<InstallPackRequest>,
) -> Result<Json<InstallPackResponse>, AppError> {
    if !authz::is_session_member(state.pool(), auth.user_id, req.session_id).await? {
        return Err(AppError::Forbidden);
    }
    let packs = builtin_packs()?;
    let pack = packs
        .into_iter()
        .find(|pack| pack.id == req.pack_id)
        .ok_or(AppError::NotFound)?;

    // block a double install: pack table names colliding with tables the user
    // already owns is the honest signal (installed copies are user-editable,
    // so there's nothing sturdier to key on)
    let colliding = colliding_tables(&state, auth.user_id, &pack.tables).await?;
    if !colliding.is_empty() {
        let names: Vec<String> = colliding.into_iter().map(|(_, name)| name).collect();
        return Err(AppError::BadRequest(format!(
            "pack tables already exist in your library: {}",
            names.join(", ")
        )));
    }

    let installed_rows = install_table_bundle(&state, &pack.tables, &[], &auth.metadata()).await?;

    Ok(Json(InstallPackResponse {
        installed_tables: pack.tables.len(),
        installed_rows,
    }))
}

/// Tables the user already owns whose names collide with the bundle's, as (id, name).
pub(crate) async fn colliding_tables(
    state: &AppState,
    owner_id: Uuid,
    tables: &[PackTable],
) -> Result<Vec<(Uuid, String)>, AppError> {
    let names: Vec<String> = tables.iter().map(|t| t.name.clone()).collect();
    sqlx::query_as("select id, name from oracle_tables where created_by = $1 and name = any($2)")
        .bind(owner_id)
        .bind(&names)
        .fetch_all(state.pool())
        .await
        .map_err(Into::into)
}

/// Shared by pack install and the external import endpoint: emits the created
/// events for a whole bundle in one transaction, optionally deleting existing
/// tables first (replace-on-import). Ownership comes from the user_id in
/// `metadata`, same as any other table create. Returns the row count installed.
pub(crate) async fn install_table_bundle(
    state: &AppState,
    tables: &[PackTable],
    delete_first: &[Uuid],
    metadata: &serde_json::Value,
) -> Result<usize, AppError> {
    // key -> id up front so rows can chain to tables created later in the loop
    let ids: HashMap<&str, Uuid> = tables
        .iter()
        .map(|table| (table.key.as_str(), Uuid::new_v4()))
        .collect();

    retry_tx!(state.pool(), |tx| {
        for table_id in delete_first {
            let event = NewEvent {
                aggregate_type: "oracle_table",
                aggregate_id: *table_id,
                session_id: None,
                event_type: "oracle_table.deleted",
                payload: json!({}),
                metadata: metadata.clone(),
            };
            projection::append_table_deleted(&mut tx, &event).await?;
        }

        // two passes: rows can chain forward to tables later in the pack, and
        // the subtable fk is not deferrable, so every table must exist before
        // the first row insert
        for table in tables {
            let event = NewEvent {
                aggregate_type: "oracle_table",
                aggregate_id: ids[table.key.as_str()],
                session_id: None,
                event_type: "oracle_table.created",
                payload: json!({
                    "name": table.name,
                    "description": table.description,
                    "mode": table.mode,
                    "tag": table.tag,
                }),
                metadata: metadata.clone(),
            };
            projection::append_table_created(&mut tx, &event).await?;
        }

        for table in tables {
            for (position, row) in table.rows.iter().enumerate() {
                let subtable_id = row.chain.as_deref().map(|key| ids[key]);
                let event = NewEvent {
                    aggregate_type: "oracle_table_row",
                    aggregate_id: Uuid::new_v4(),
                    session_id: None,
                    event_type: "oracle_table_row.created",
                    payload: json!({
                        "table_id": ids[table.key.as_str()],
                        "weight": row.weight,
                        "range_min": row.range.map(|r| r[0]),
                        "range_max": row.range.map(|r| r[1]),
                        "result": row.result,
                        "notes": row.notes,
                        "position": position as i32,
                        "subtable_id": subtable_id,
                    }),
                    metadata: metadata.clone(),
                };
                projection::append_row_created(&mut tx, &event).await?;
            }
        }
        Ok(())
    })?;

    Ok(tables.iter().map(|t| t.rows.len()).sum())
}

/// integrity check shared by the unit tests: chain keys resolve, keys are
/// unique, modes are sane, range tables have complete rows
pub fn validate_pack(pack: &Pack) -> Result<(), String> {
    validate_tables(&pack.tables)
}

/// bundle-level checks shared with the import endpoint, which accepts the same
/// table shape from outside
pub(crate) fn validate_tables(tables: &[PackTable]) -> Result<(), String> {
    let mut keys = HashSet::new();
    for table in tables {
        if !keys.insert(table.key.as_str()) {
            return Err(format!("duplicate table key {}", table.key));
        }
        if !matches!(table.mode.as_str(), "weighted" | "range") {
            return Err(format!("table {} has invalid mode {}", table.key, table.mode));
        }
        if table.rows.is_empty() {
            return Err(format!("table {} has no rows", table.key));
        }
    }
    let keys: HashSet<&str> = tables.iter().map(|t| t.key.as_str()).collect();
    for table in tables {
        for row in &table.rows {
            if row.weight <= 0 {
                return Err(format!("table {} row has non-positive weight", table.key));
            }
            if let Some(chain) = &row.chain {
                if !keys.contains(chain.as_str()) {
                    return Err(format!(
                        "table {} chains to unknown key {chain}",
                        table.key
                    ));
                }
                if chain == &table.key {
                    return Err(format!("table {} chains to itself", table.key));
                }
            }
            if table.mode == "range" && row.range.is_none() {
                return Err(format!("range table {} has a row without a range", table.key));
            }
            if let Some([min, max]) = row.range {
                if min > max {
                    return Err(format!("table {} has an inverted range", table.key));
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domains::hex::generate::TERRAIN_IDS;

    #[test]
    fn builtin_packs_parse_and_validate() {
        let packs = builtin_packs().expect("packs parse");
        assert!(!packs.is_empty());
        for pack in &packs {
            validate_pack(pack).expect("pack is internally consistent");
        }
    }

    #[test]
    fn terrain_tagged_tables_only_emit_terrain_ids() {
        for pack in builtin_packs().unwrap() {
            for table in &pack.tables {
                if table.tag.as_deref() == Some("hex.terrain") {
                    for row in &table.rows {
                        assert!(
                            TERRAIN_IDS.contains(&row.result.as_str()),
                            "terrain table row {:?} is not a terrain id",
                            row.result
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn exploration_tags_cover_every_terrain_encounter() {
        // the starter pack should feed hex generation for every terrain the
        // terrain table can produce
        let packs = builtin_packs().unwrap();
        let starter = &packs[0];
        let tags: HashSet<String> = starter
            .tables
            .iter()
            .filter_map(|t| t.tag.clone())
            .collect();
        let terrain_table = starter
            .tables
            .iter()
            .find(|t| t.tag.as_deref() == Some("hex.terrain"))
            .expect("starter has a terrain table");
        for row in &terrain_table.rows {
            let expected = format!("hex.encounter.{}", row.result);
            assert!(
                tags.contains(&expected),
                "no encounter table tagged {expected}"
            );
        }
    }

    #[test]
    fn dice_expressions_in_pack_rows_parse() {
        for pack in builtin_packs().unwrap() {
            for table in &pack.tables {
                for row in &table.rows {
                    let mut rest = row.result.as_str();
                    while let Some(start) = rest.find('{') {
                        let after = &rest[start + 1..];
                        let end = after.find('}').expect("braces close in pack content");
                        let expr = after[..end].trim();
                        ttrpg_dice_engine::parse(expr).unwrap_or_else(|err| {
                            panic!("bad dice expr {expr:?} in {}: {err:?}", table.key)
                        });
                        rest = &after[end + 1..];
                    }
                }
            }
        }
    }
}
