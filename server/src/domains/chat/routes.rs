use axum::routing::post;
use axum::Router;

use crate::domains::chat::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/chat-messages", post(handlers::send_message))
}
