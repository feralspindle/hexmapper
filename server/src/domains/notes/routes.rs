use axum::routing::{delete, patch, post};
use axum::Router;

use crate::domains::notes::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/hex-notes", post(handlers::create_hex_note))
        .route("/hex-notes/{id}", patch(handlers::edit_hex_note))
        .route("/hex-notes/{id}", delete(handlers::delete_hex_note))
        .route("/dungeon-element-notes", post(handlers::create_dungeon_note))
        .route("/dungeon-element-notes/{id}", patch(handlers::edit_dungeon_note))
        .route("/dungeon-element-notes/{id}", delete(handlers::delete_dungeon_note))
        .route("/dungeon-cell-notes", post(handlers::create_dungeon_cell_note))
        .route("/dungeon-cell-notes/{id}", patch(handlers::edit_dungeon_cell_note))
        .route("/dungeon-cell-notes/{id}", delete(handlers::delete_dungeon_cell_note))
}
