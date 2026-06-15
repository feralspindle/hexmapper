use axum::routing::{delete, patch, post};
use axum::Router;

use crate::domains::map::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/maps", post(handlers::create_map))
        .route("/maps/{id}", patch(handlers::update_map))
        .route("/maps/{id}", delete(handlers::delete_map))
}
