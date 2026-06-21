use jsonwebtoken::jwk::JwkSet;
use sqlx::PgPool;
use std::sync::{Arc, RwLock};

use crate::realtime::RealtimeHub;

#[derive(Clone)]
pub struct AppState(Arc<AppStateInner>);

pub struct AppStateInner {
    pub pool: PgPool,
    /// Swappable so a background task can pick up Supabase key rotations without a
    /// restart (see `auth::jwt::spawn_jwks_refresh`).
    pub jwks: RwLock<Arc<JwkSet>>,
    pub realtime: RealtimeHub,
    pub cors_allowed_origin: String,
}

impl AppState {
    pub fn new(pool: PgPool, jwks: JwkSet, cors_allowed_origin: String) -> Self {
        Self(Arc::new(AppStateInner {
            pool,
            jwks: RwLock::new(Arc::new(jwks)),
            realtime: RealtimeHub::default(),
            cors_allowed_origin,
        }))
    }

    pub fn pool(&self) -> &PgPool {
        &self.0.pool
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

    pub fn cors_allowed_origin(&self) -> &str {
        &self.0.cors_allowed_origin
    }
}
