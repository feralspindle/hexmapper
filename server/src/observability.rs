//! Prometheus metrics + structured (JSON) request logging.
//!
//! `/metrics` is rendered from the installed recorder (scraped by Alloy on the
//! compose network, never exposed through Caddy). The per-request middleware records
//! RED metrics keyed by the *route template* (low cardinality) and emits one
//! structured log line per request carrying the `request_id` for correlation.

use std::time::Instant;

use axum::extract::MatchedPath;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use tracing_subscriber::EnvFilter;

/// Installs the global Prometheus recorder; the returned handle renders `/metrics`.
pub fn install_metrics() -> PrometheusHandle {
    PrometheusBuilder::new()
        .install_recorder()
        .expect("failed to install Prometheus recorder")
}

/// JSON structured logging — one machine-parseable line per event (for Loki).
pub fn init_tracing() {
    tracing_subscriber::fmt()
        .json()
        .with_current_span(true)
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();
}

/// Per-request RED metrics + a structured completion log.
pub async fn track_metrics(req: Request<axum::body::Body>, next: Next) -> Response {
    let start = Instant::now();
    let method = req.method().clone();
    // Route template ("/sessions/{id}"), not the concrete path — bounds cardinality.
    let path = req
        .extensions()
        .get::<MatchedPath>()
        .map(|p| p.as_str().to_owned())
        .unwrap_or_else(|| req.uri().path().to_owned());
    let request_id = req
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("-")
        .to_owned();

    let response = next.run(req).await;
    let status = response.status().as_u16();
    let latency = start.elapsed().as_secs_f64();

    metrics::counter!(
        "http_requests_total",
        "method" => method.to_string(), "path" => path.clone(), "status" => status.to_string()
    )
    .increment(1);
    metrics::histogram!(
        "http_request_duration_seconds",
        "method" => method.to_string(), "path" => path.clone()
    )
    .record(latency);

    tracing::info!(
        method = %method,
        path = %path,
        status,
        latency_ms = latency * 1000.0,
        request_id = %request_id,
        "request completed"
    );

    response
}
