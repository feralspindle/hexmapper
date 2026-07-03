use jsonwebtoken::jwk::JwkSet;
use sqlx::PgPool;
use std::sync::{Arc, RwLock};

use crate::ratelimit::{self, UserRateLimiter};
use crate::realtime::RealtimeHub;

#[derive(Clone)]
pub struct AppState(Arc<AppStateInner>);

pub struct AppStateInner {
    pub pool: PgPool,
    /// Swappable so a background task can pick up Supabase key rotations without a
    /// restart (see `auth::jwt::spawn_jwks_refresh`).
    pub jwks: RwLock<Arc<JwkSet>>,
    pub realtime: RealtimeHub,
    pub rate_limiter: Arc<UserRateLimiter>,
    pub cors_allowed_origins: Vec<String>,
}

impl AppState {
    pub fn new(pool: PgPool, jwks: JwkSet, cors_allowed_origins: Vec<String>) -> Self {
        Self(Arc::new(AppStateInner {
            pool,
            jwks: RwLock::new(Arc::new(jwks)),
            realtime: RealtimeHub::default(),
            rate_limiter: ratelimit::build(),
            cors_allowed_origins,
        }))
    }

    pub fn pool(&self) -> &PgPool {
        &self.0.pool
    }

    pub fn rate_limiter(&self) -> &UserRateLimiter {
        &self.0.rate_limiter
    }

    /// Current JWKS snapshot. Returns an `Arc` (not a borrow) so a concurrent
    /// rotation swap never invalidates an in-flight verification.
    pub fn jwks(&self) -> Arc<JwkSet> {
        self.0.jwks.read().expect("jwks lock poisoned").clone()
    }

    /// Replaces the JWKS after a successful refresh.
    pub fn set_jwks(&self, jwks: JwkSet) {
        *self.0.jwks.write().expect("jwks lock poisoned") = Arc::new(jwks);
    }

    pub fn realtime(&self) -> &RealtimeHub {
        &self.0.realtime
    }

    pub fn allows_origin(&self, origin: &str) -> bool {
        self.0
            .cors_allowed_origins
            .iter()
            .any(|allowed| allowed == origin)
    }
}
