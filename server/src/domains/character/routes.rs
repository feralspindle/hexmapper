use axum::routing::{delete, patch, post};
use axum::Router;

use crate::domains::character::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/characters", post(handlers::create_character))
        .route("/characters/clear-initiative", post(handlers::clear_initiative))
        .route("/characters/{id}", patch(handlers::update_character_data))
        .route("/characters/{id}", delete(handlers::delete_character))
        .route(
            "/characters/{id}/adjust-currency",
            post(handlers::adjust_character_currency),
        )
        .route("/character-sheet-log", post(handlers::record_sheet_log))
}
