use axum::routing::{get, patch};
use axum::Router;

use crate::domains::journal::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/journal-entries",
            get(handlers::list_entries).post(handlers::create_entry),
        )
        .route(
            "/journal-entries/{id}",
            patch(handlers::update_entry).delete(handlers::delete_entry),
        )
}
