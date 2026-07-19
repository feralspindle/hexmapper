use axum::routing::get;
use axum::Router;

use crate::domains::compendium::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/compendium-entries", get(handlers::list_entries))
        .route(
            "/compendium-entries/{id}",
            axum::routing::delete(handlers::delete_entry),
        )
}
