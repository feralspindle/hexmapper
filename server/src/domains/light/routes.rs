use axum::routing::{delete, get, post};
use axum::Router;

use crate::domains::light::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/light-sources",
            get(handlers::list_lights).post(handlers::create_light),
        )
        .route("/light-sources/{id}", delete(handlers::delete_light))
        .route("/light-sources/{id}/control", post(handlers::control_light))
        .route("/light-sources/{id}/tick", post(handlers::tick_light))
        .route("/light-sources/{id}/expire", post(handlers::expire_light))
}
