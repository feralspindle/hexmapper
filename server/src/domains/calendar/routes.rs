use axum::routing::{post, put};
use axum::Router;

use crate::domains::calendar::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/calendar-settings", put(handlers::update_settings))
        .route("/calendar-days", post(handlers::upsert_day))
}
