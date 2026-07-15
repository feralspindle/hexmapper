use axum::routing::post;
use axum::Router;

use crate::domains::dungeon::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/dungeons", post(handlers::create_dungeon))
        .route("/dungeons/{id}", axum::routing::patch(handlers::update_dungeon))
        .route("/dungeons/{id}/torch", post(handlers::torch))
        .route("/dungeon-rooms", post(handlers::create_room))
        .route(
            "/dungeon-rooms/{id}",
            axum::routing::patch(handlers::update_room).delete(handlers::delete_room),
        )
        .route("/dungeon-corridors", post(handlers::create_corridor))
        .route(
            "/dungeon-corridors/{id}",
            axum::routing::patch(handlers::update_corridor).delete(handlers::delete_corridor),
        )
        .route("/dungeon-tokens", post(handlers::create_token))
        .route(
            "/dungeon-tokens/{id}",
            axum::routing::patch(handlers::update_token).delete(handlers::delete_token),
        )
        .route("/dungeon-icons", post(handlers::create_icon))
        .route(
            "/dungeon-icons/{id}",
            axum::routing::patch(handlers::update_icon).delete(handlers::delete_icon),
        )
        .route("/dungeon-fog/reveal", post(handlers::fog_reveal))
        .route("/dungeon-fog/hide", post(handlers::fog_hide))
        .route("/dungeon-fog/reveal-bulk", post(handlers::fog_reveal_bulk))
        .route("/dungeon-fog/hide-bulk", post(handlers::fog_hide_bulk))
        .route("/dungeon-fog/clear", post(handlers::fog_clear))
}
