use jsonwebtoken::jwk::JwkSet;
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState(Arc<AppStateInner>);

pub struct AppStateInner {
    pub pool: PgPool,
    pub jwks: JwkSet,
}

impl AppState {
    pub fn new(pool: PgPool, jwks: JwkSet) -> Self {
        Self(Arc::new(AppStateInner { pool, jwks }))
    }

    pub fn pool(&self) -> &PgPool {
        &self.0.pool
    }

    pub fn jwks(&self) -> &JwkSet {
        &self.0.jwks
    }
}
