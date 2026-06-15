use axum::routing::get;
use axum::Router;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use hexmap_server::auth;
use hexmap_server::config::Config;
use hexmap_server::db;
use hexmap_server::domains;
use hexmap_server::state::AppState;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let config = Config::from_env();

    let pool = db::connect(&config.database_url)
        .await
        .expect("failed to connect to database");

    let jwks = auth::jwt::fetch_jwks(&config.supabase_url)
        .await
        .expect("failed to fetch Supabase JWKS");

    let state = AppState::new(pool, jwks);

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::exact(
            config.cors_allowed_origin.parse().expect("invalid CORS_ALLOWED_ORIGIN"),
        ))
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let api = Router::new()
        .merge(domains::dice::router())
        .merge(domains::chat::router())
        .merge(domains::macros::router())
        .merge(domains::prefs::router())
        .merge(domains::photo::router())
        .merge(domains::activity::router())
        .merge(domains::notes::router())
        .merge(domains::notebook::router())
        .merge(domains::calendar::router())
        .merge(domains::vault::router())
        .merge(domains::character::router())
        .merge(domains::map::router())
        .merge(domains::hex::router())
        .merge(domains::session::router())
        .merge(domains::dungeon::router())
        .with_state(state);

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .nest("/api", api)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
