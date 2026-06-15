use axum::routing::{delete, patch, post};
use axum::Router;

use crate::domains::notebook::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/party-quests", post(handlers::create_quest))
        .route("/party-quests/{id}", patch(handlers::update_quest))
        .route("/party-quests/{id}", delete(handlers::delete_quest))
        .route("/party-session-notes", post(handlers::create_session_note))
        .route("/party-session-notes/{id}", patch(handlers::update_session_note))
        .route("/party-session-notes/{id}", delete(handlers::delete_session_note))
}
