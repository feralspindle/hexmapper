use axum::Router;
use axum::routing::get;
use tower_http::cors::{AllowOrigin, CorsLayer};

use hexmap_server::auth;
use hexmap_server::config::Config;
use hexmap_server::db;
use hexmap_server::domains;
use hexmap_server::observability;
use hexmap_server::ratelimit;
use hexmap_server::realtime;
use hexmap_server::state::AppState;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    observability::init_tracing();
    let metrics = observability::install_metrics();

    let config = Config::from_env();

    let pool = db::connect(&config.database_url)
        .await
        .expect("failed to connect to database");

    let jwks = auth::jwt::fetch_jwks(&config.supabase_url)
        .await
        .expect("failed to fetch Supabase JWKS");

    let state = AppState::new(pool, jwks, config.cors_allowed_origins.clone());
    let shutdown_state = state.clone();
    realtime::spawn_event_listener(config.database_url.clone(), state.clone());
    auth::jwt::spawn_jwks_refresh(config.supabase_url.clone(), state.clone());
    ratelimit::spawn_retain(state.clone());

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(
            config
                .cors_allowed_origins
                .iter()
                .map(|origin| {
                    origin
                        .parse()
                        .unwrap_or_else(|_| panic!("invalid CORS_ALLOWED_ORIGIN: {origin}"))
                })
                .collect::<Vec<_>>(),
        ))
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let api = Router::new()
        // Public, unauthenticated liveness probe. Reachable at /api/healthz through Caddy
        // (Caddy only proxies /api/*, so the root /healthz below is internal-only). Touches
        // no DB — proves the HTTP server is up and reachable. Used by the deploy smoke test.
        .route("/healthz", get(|| async { "ok" }))
        .merge(domains::dice::router())
        .merge(domains::chat::router())
        .merge(domains::macros::router())
        .merge(domains::prefs::router())
        .merge(domains::photo::router())
        .merge(domains::activity::router())
        .merge(domains::notes::router())
        .merge(domains::oracle::router())
        .merge(domains::light::router())
        .merge(domains::journal::router())
        .merge(domains::notebook::router())
        .merge(domains::calendar::router())
        .merge(domains::vault::router())
        .merge(domains::character::router())
        .merge(domains::statblock::router())
        .merge(domains::compendium::router())
        .merge(domains::import::router())
        .merge(domains::map::router())
        .merge(domains::hex::router())
        .merge(domains::session::router())
        .merge(domains::dungeon::router())
        .merge(realtime::router())
        .layer(axum::middleware::from_fn(observability::track_metrics))
        .with_state(state);

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        // Internal only (Alloy scrapes api:8080/metrics on the compose network; Caddy
        // proxies /api/* and serves static, so /metrics is never publicly reachable).
        .route(
            "/metrics",
            get(move || {
                let m = metrics.clone();
                async move { m.render() }
            }),
        )
        .nest("/api", api)
        .layer(cors);

    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind listener");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(shutdown_state))
        .await
        .expect("server error");
}

// Websocket connections never end on their own, so a plain graceful shutdown would
// hang; disconnect_all ends every socket loop with a `server_restart` farewell so
// deploy restarts are attributable client-side instead of looking like failures.
async fn shutdown_signal(state: AppState) {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install ctrl-c handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutdown signal received; disconnecting realtime clients");
    state.realtime().disconnect_all().await;
}
