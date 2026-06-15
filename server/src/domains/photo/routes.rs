use axum::routing::{delete, post};
use axum::Router;

use crate::domains::photo::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/reference-photos", post(handlers::create_photo))
        .route("/reference-photos/{id}", delete(handlers::delete_photo))
        .route("/photo-broadcasts", post(handlers::broadcast_photo))
}
