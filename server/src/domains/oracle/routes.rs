use axum::routing::{get, patch, post};
use axum::Router;

use crate::domains::oracle::{handlers, packs};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/oracle-tables",
            get(handlers::list_tables).post(handlers::create_table),
        )
        .route(
            "/oracle-tables/{id}",
            patch(handlers::update_table).delete(handlers::delete_table),
        )
        .route("/oracle-tables/{id}/rows", post(handlers::create_row))
        .route(
            "/oracle-table-rows/{id}",
            patch(handlers::update_row).delete(handlers::delete_row),
        )
        .route(
            "/oracle-rolls",
            get(handlers::list_rolls).post(handlers::roll_oracle),
        )
        .route("/oracle-packs", get(packs::list_packs))
        .route("/oracle-packs/install", post(packs::install_pack))
}
