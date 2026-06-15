use axum::routing::put;
use axum::Router;

use crate::domains::prefs::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/user-preferences", put(handlers::save_prefs))
}
