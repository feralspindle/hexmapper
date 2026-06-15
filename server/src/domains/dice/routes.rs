use axum::routing::post;
use axum::Router;

use crate::domains::dice::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/dice-rolls", post(handlers::roll_dice))
        .route("/dice-roll-annotations", post(handlers::create_annotation))
}
