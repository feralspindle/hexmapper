use axum::routing::{patch, post};
use axum::Router;

use crate::domains::siege::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/siege-weapons", post(handlers::create_weapon))
        .route(
            "/siege-weapons/{id}",
            patch(handlers::update_weapon).delete(handlers::delete_weapon),
        )
        .route("/siege-weapons/{id}/fire", post(handlers::fire_weapon))
        .route("/siege-weapons/{id}/reload", post(handlers::reload_weapon))
        .route("/siege-weapons/{id}/crew", post(handlers::change_crew))
        .route("/siege-weapons/{id}/damage", post(handlers::damage_weapon))
}
