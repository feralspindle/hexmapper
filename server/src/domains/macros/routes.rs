use axum::routing::{delete, post};
use axum::Router;

use crate::domains::macros::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/dice-macros", post(handlers::save_macro))
        .route("/dice-macros/{id}", delete(handlers::delete_macro))
}
