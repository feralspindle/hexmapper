//! Single source of truth for what a hex cell row exposes to a viewer.
//! Unexplored cells (explored = false) collapse to a coordinates-only
//! sentinel for everyone — in solo/co-op the driver must not see contents
//! early. Hidden cells (revealed = false) collapse the same way for non-GM
//! viewers. Visible non-GM rows lose the server-only fields.
//!
//! The projection's in-SQL redaction and the frontend's hiddenCellSentinel
//! mirror this contract; the SQL builders below derive from the same consts
//! so the Rust and SQL paths cannot drift.

use serde_json::{json, Map, Value};

pub const SENTINEL_KEYS: &[&str] = &["session_id", "map_id", "q", "r"];
pub const GM_ONLY_KEYS: &[&str] = &["gm_markers", "source_client"];

pub enum VisibleHexRow {
    Full(Value),
    Sentinel(Value),
}

pub fn visible_hex_row(mut row: Value, is_gm: bool) -> VisibleHexRow {
    let explored = row.get("explored").and_then(Value::as_bool) != Some(false);
    let revealed = row.get("revealed").and_then(Value::as_bool) == Some(true);

    if !explored || (!is_gm && !revealed) {
        let mut sentinel = Map::new();
        for key in SENTINEL_KEYS {
            if let Some(value) = row.get(*key) {
                sentinel.insert((*key).to_string(), value.clone());
            }
        }
        sentinel.insert("revealed".to_string(), json!(false));
        sentinel.insert("explored".to_string(), json!(explored));
        return VisibleHexRow::Sentinel(Value::Object(sentinel));
    }

    if !is_gm {
        if let Value::Object(object) = &mut row {
            for key in GM_ONLY_KEYS {
                object.remove(*key);
            }
        }
    }
    VisibleHexRow::Full(row)
}

/// `jsonb_build_object(...)` sentinel over a hex_cells row aliased `h`,
/// matching `visible_hex_row`'s sentinel shape.
pub fn sentinel_sql(explored: bool) -> String {
    let fields = SENTINEL_KEYS
        .iter()
        .map(|key| format!("'{key}', h.{key}"))
        .collect::<Vec<_>>()
        .join(", ");
    format!("jsonb_build_object({fields}, 'revealed', false, 'explored', {explored})")
}

/// `- 'gm_markers' - 'source_client'` jsonb strip suffix for player rows.
pub fn strip_gm_fields_sql() -> String {
    GM_ONLY_KEYS
        .iter()
        .map(|key| format!(" - '{key}'"))
        .collect::<String>()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn full_row() -> Value {
        json!({
            "id": "cell", "session_id": "s", "map_id": "m", "q": 1, "r": 2,
            "revealed": true, "explored": true, "terrain_type": "forest",
            "label": "Grove", "gm_markers": "[]", "source_client": "tab"
        })
    }

    #[test]
    fn unexplored_rows_are_sentinels_for_everyone() {
        for is_gm in [true, false] {
            let mut row = full_row();
            row["explored"] = json!(false);
            row["revealed"] = json!(false);
            match visible_hex_row(row, is_gm) {
                VisibleHexRow::Sentinel(sentinel) => {
                    assert_eq!(sentinel["explored"], false);
                    assert_eq!(sentinel["revealed"], false);
                    assert!(sentinel.get("terrain_type").is_none());
                    assert!(sentinel.get("id").is_none());
                }
                VisibleHexRow::Full(_) => panic!("unexplored row must be a sentinel"),
            }
        }
    }

    #[test]
    fn hidden_rows_are_sentinels_only_for_players() {
        let mut row = full_row();
        row["revealed"] = json!(false);
        assert!(matches!(
            visible_hex_row(row.clone(), true),
            VisibleHexRow::Full(_)
        ));
        assert!(matches!(
            visible_hex_row(row, false),
            VisibleHexRow::Sentinel(_)
        ));
    }

    #[test]
    fn player_rows_lose_gm_only_fields() {
        match visible_hex_row(full_row(), false) {
            VisibleHexRow::Full(row) => {
                assert!(row.get("gm_markers").is_none());
                assert!(row.get("source_client").is_none());
                assert_eq!(row["label"], "Grove");
            }
            VisibleHexRow::Sentinel(_) => panic!("revealed row must be full"),
        }
    }

    #[test]
    fn missing_explored_key_counts_as_explored() {
        let mut row = full_row();
        row.as_object_mut().unwrap().remove("explored");
        assert!(matches!(
            visible_hex_row(row, false),
            VisibleHexRow::Full(_)
        ));
    }
}
