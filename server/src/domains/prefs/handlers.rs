use axum::extract::State;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::AuthUser;
use crate::domains::prefs::projection;
use crate::error::AppError;
use crate::events::NewEvent;
use crate::retry_tx;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct SavePrefsRequest {
    pub dungeon_map_style: String,
    pub dungeon_density: String,
    pub dungeon_palette: String,
    pub dungeon_icon_style: String,
    pub dungeon_panel_layout: String,
    pub dungeon_show_cursors: bool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PrefsRow {
    pub user_id: uuid::Uuid,
    pub dungeon_map_style: String,
    pub dungeon_density: String,
    pub dungeon_palette: String,
    pub dungeon_icon_style: String,
    pub dungeon_panel_layout: String,
    pub dungeon_show_cursors: bool,
    pub updated_at: DateTime<Utc>,
}

pub async fn save_prefs(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<SavePrefsRequest>,
) -> Result<Json<PrefsRow>, AppError> {
    let event = NewEvent {
        aggregate_type: "user_preferences",
        aggregate_id: auth.user_id,
        session_id: None,
        event_type: "user_preferences.updated",
        payload: json!({
            "dungeon_map_style": req.dungeon_map_style,
            "dungeon_density": req.dungeon_density,
            "dungeon_palette": req.dungeon_palette,
            "dungeon_icon_style": req.dungeon_icon_style,
            "dungeon_panel_layout": req.dungeon_panel_layout,
            "dungeon_show_cursors": req.dungeon_show_cursors,
        }),
        metadata: auth.metadata(),
    };

    let row = retry_tx!(state.pool(), |tx| {
        projection::append_and_project(&mut tx, &event).await
    })?;

    Ok(Json(row))
}
