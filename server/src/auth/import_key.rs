//! Import-key auth for external content pushers (local rules assistants and
//! the like). Keys are minted per gm_less session by the owner, sha-256 hashed
//! at rest, and only presented to the /import/* endpoints — a leaked key can
//! add content to one solo session and nothing else.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

pub const KEY_PREFIX: &str = "hxm_";
/// Shown in key listings so the owner can tell keys apart without ever seeing
/// the full secret again.
const DISPLAY_PREFIX_LEN: usize = 12;

/// Two v4 uuids' worth of randomness behind the recognizable prefix.
pub fn mint_key() -> String {
    format!(
        "{KEY_PREFIX}{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    )
}

pub fn hash_key(key: &str) -> String {
    format!("{:x}", Sha256::digest(key.as_bytes()))
}

pub fn display_prefix(key: &str) -> String {
    key.chars().take(DISPLAY_PREFIX_LEN).collect()
}

/// A verified import key: the session it unlocks and the user it acts as
/// (the key's creator — events carry their id so imports stay attributable).
pub struct ImportAuth {
    pub key_id: Uuid,
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub key_name: String,
    pub request_id: String,
    pub route: String,
}

impl ImportAuth {
    pub fn metadata(&self) -> Value {
        json!({
            "user_id": self.user_id,
            "display_name": self.key_name,
            "import_key_id": self.key_id,
            "request_id": self.request_id,
            "route": self.route,
        })
    }
}

impl FromRequestParts<AppState> for ImportAuth {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized)?;
        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or(AppError::Unauthorized)?;
        if !token.starts_with(KEY_PREFIX) {
            return Err(AppError::Unauthorized);
        }

        let row: Option<(Uuid, Uuid, Uuid, String, String)> = sqlx::query_as(
            r#"
            select k.id, k.session_id, k.created_by, k.name, s.play_mode
            from import_keys k
            join sessions s on s.id = k.session_id
            where k.key_hash = $1
            "#,
        )
        .bind(hash_key(token))
        .fetch_optional(state.pool())
        .await?;
        let (key_id, session_id, user_id, key_name, play_mode) =
            row.ok_or(AppError::Unauthorized)?;

        // same per-user bucket as the browser - the key acts as its creator
        if state.rate_limiter().check_key(&user_id).is_err() {
            metrics::counter!("http_rate_limited_total").increment(1);
            return Err(AppError::TooManyRequests);
        }

        // imports are a solo/co-op feature; a session flipped back to gm mode
        // stops accepting pushes without the owner having to revoke anything
        if play_mode != "gm_less" {
            return Err(AppError::Forbidden);
        }

        sqlx::query("update import_keys set last_used_at = now() where id = $1")
            .bind(key_id)
            .execute(state.pool())
            .await?;

        Ok(ImportAuth {
            key_id,
            session_id,
            user_id,
            key_name,
            request_id: Uuid::new_v4().to_string(),
            route: format!("{} {}", parts.method.as_str(), parts.uri.path()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minted_keys_have_the_prefix_and_length() {
        let key = mint_key();
        assert!(key.starts_with(KEY_PREFIX));
        assert_eq!(key.len(), KEY_PREFIX.len() + 64);
    }

    #[test]
    fn minted_keys_are_unique() {
        assert_ne!(mint_key(), mint_key());
    }

    #[test]
    fn hashing_is_stable_and_prefix_is_short() {
        let key = mint_key();
        assert_eq!(hash_key(&key), hash_key(&key));
        assert_eq!(display_prefix(&key).len(), 12);
    }
}
