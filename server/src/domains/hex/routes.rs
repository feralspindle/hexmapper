use axum::routing::{get, post};
use axum::Router;

use crate::domains::hex::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/hex-cells", get(handlers::list_hexes))
        .route("/hex-cells/upsert", post(handlers::upsert_hex))
        .route("/hex-cells/delete", post(handlers::delete_hex))
        .route("/hex-cells/bulk-reveal", post(handlers::bulk_reveal))
        .route("/hex-cells/clear", post(handlers::clear_hex))
}
