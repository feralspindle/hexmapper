use axum::routing::get;
use axum::Router;

use crate::domains::statblock::handlers;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/stat-blocks",
            get(handlers::list_stat_blocks).post(handlers::create_stat_block),
        )
        .route(
            "/stat-blocks/{id}",
            axum::routing::patch(handlers::update_stat_block_data)
                .delete(handlers::delete_stat_block),
        )
}
