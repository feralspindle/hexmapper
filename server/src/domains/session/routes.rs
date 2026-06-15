use axum::routing::{delete, patch, post};
use axum::Router;

use crate::domains::session::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sessions", post(handlers::create_session))
        .route("/sessions/{id}", patch(handlers::update_session))
        .route("/sessions/{id}", delete(handlers::delete_session))
        .route("/sessions/{id}/torch", post(handlers::torch))
        .route("/sessions/{id}/join", post(handlers::join_session))
        .route("/session-members/active", post(handlers::set_active_member))
}
