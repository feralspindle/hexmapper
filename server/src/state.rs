use jsonwebtoken::jwk::JwkSet;
use sqlx::PgPool;
use std::sync::Arc;

use crate::realtime::RealtimeHub;

#[derive(Clone)]
pub struct AppState(Arc<AppStateInner>);

pub struct AppStateInner {
    pub pool: PgPool,
    pub jwks: JwkSet,
    pub realtime: RealtimeHub,
    pub cors_allowed_origin: String,
}

impl AppState {
    pub fn new(pool: PgPool, jwks: JwkSet, cors_allowed_origin: String) -> Self {
        Self(Arc::new(AppStateInner {
            pool,
            jwks,
            realtime: RealtimeHub::default(),
            cors_allowed_origin,
        }))
    }

    pub fn pool(&self) -> &PgPool {
        &self.0.pool
    }

    pub fn jwks(&self) -> &JwkSet {
        &self.0.jwks
    }

    pub fn realtime(&self) -> &RealtimeHub {
        &self.0.realtime
    }

    pub fn cors_allowed_origin(&self) -> &str {
        &self.0.cors_allowed_origin
    }
}
