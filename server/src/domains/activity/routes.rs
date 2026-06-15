use axum::routing::post;
use axum::Router;

use crate::domains::activity::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/dungeon-activity", post(handlers::record_activity))
}
