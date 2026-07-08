use axum::routing::{delete, patch, post};
use axum::Router;

use crate::domains::vault::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/vault-containers", post(handlers::create_container))
        .route("/vault-containers/{id}", delete(handlers::delete_container))
        .route("/vault-loot", post(handlers::create_loot))
        .route("/vault-loot/{id}", patch(handlers::update_loot))
        .route("/vault-loot/{id}", delete(handlers::delete_loot))
        .route("/vault-items", post(handlers::create_item))
        .route("/vault-items/{id}", patch(handlers::update_item))
        .route("/vault-items/{id}", delete(handlers::delete_item))
        .route("/vault-ledger", post(handlers::create_ledger_entry))
}
