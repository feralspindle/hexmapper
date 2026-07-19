use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::Router;

use crate::domains::import::handlers;
use crate::state::AppState;

// a whole book's worth of tables can outgrow axum's 2 MB default body limit
const MAX_IMPORT_BODY_BYTES: usize = 10 * 1024 * 1024;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/import-keys",
            get(handlers::list_import_keys).post(handlers::create_import_key),
        )
        .route(
            "/import-keys/{id}",
            axum::routing::delete(handlers::delete_import_key),
        )
        .route("/import/oracle-tables", post(handlers::import_oracle_tables))
        .route("/import/stat-blocks", post(handlers::import_stat_blocks))
        .route("/import/characters", post(handlers::import_characters))
        .route("/import/compendium", post(handlers::import_compendium))
        .layer(DefaultBodyLimit::max(MAX_IMPORT_BODY_BYTES))
}
