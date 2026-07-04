use std::str::FromStr;

use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{decode, decode_header, errors, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use uuid::Uuid;

/// Leeway applied to `exp` both when verifying a token and when the realtime
/// heartbeat decides a live connection's token has expired
/// (`RealtimeHub::expired`). The two checks MUST use the same value: if
/// verification is more lenient (jsonwebtoken defaults to 60s), a just-expired
/// token authenticates successfully and the heartbeat kills the connection
/// milliseconds later, producing a sub-second ready->kill reconnect storm
/// until the client refreshes its token.
pub const EXP_LEEWAY_SECONDS: u64 = 0;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SupabaseClaims {
    pub sub: Uuid,
    pub exp: usize,
    pub role: String,
    pub email: Option<String>,
    #[serde(default)]
    pub user_metadata: serde_json::Value,
}

impl SupabaseClaims {
    /// Display name, mirroring the `fill_display_name` SQL trigger's coalesce order,
    /// resolved straight from the token (no DB round trip).
    pub fn display_name(&self) -> String {
        let m = &self.user_metadata;
        ["full_name", "global_name", "name", "user_name"]
            .iter()
            .find_map(|k| m.get(*k).and_then(|v| v.as_str()))
            .or(self.email.as_deref())
            .unwrap_or("Adventurer")
            .to_string()
    }
}

pub async fn fetch_jwks(supabase_url: &str) -> Result<JwkSet, reqwest::Error> {
    let url = format!(
        "{}/auth/v1/.well-known/jwks.json",
        supabase_url.trim_end_matches('/')
    );
    reqwest::get(&url).await?.json::<JwkSet>().await
}

/// Periodically re-fetches the Supabase JWKS so signing-key rotations are picked up
/// without a restart. On a failed fetch the previous key set is retained, so a
/// transient Supabase outage never breaks verification.
pub fn spawn_jwks_refresh(supabase_url: String, state: crate::state::AppState) {
    const REFRESH_INTERVAL: std::time::Duration = std::time::Duration::from_secs(15 * 60);

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(REFRESH_INTERVAL);
        interval.tick().await; // consume the immediate first tick; keys are already fresh at startup
        loop {
            interval.tick().await;
            match fetch_jwks(&supabase_url).await {
                Ok(jwks) => state.set_jwks(jwks),
                Err(error) => tracing::warn!(%error, "JWKS refresh failed; retaining previous key set"),
            }
        }
    });
}

pub fn verify(token: &str, jwks: &JwkSet) -> Result<SupabaseClaims, errors::Error> {
    let header = decode_header(token)?;

    let kid = header
        .kid
        .as_deref()
        .ok_or(errors::ErrorKind::InvalidToken)?;
    let jwk = jwks.find(kid).ok_or(errors::ErrorKind::InvalidToken)?;
    let decoding_key = DecodingKey::from_jwk(jwk)?;

    // Pin the algorithm to what the JWKS key declares; never trust the token
    // header's `alg`, which is attacker-controlled.
    let key_algorithm = jwk
        .common
        .key_algorithm
        .ok_or(errors::ErrorKind::InvalidAlgorithm)?;
    let algorithm = Algorithm::from_str(&key_algorithm.to_string())?;

    let mut validation = Validation::new(algorithm);
    validation.set_audience(&["authenticated"]);
    validation.leeway = EXP_LEEWAY_SECONDS;

    let decoded = decode::<SupabaseClaims>(token, &decoding_key, &validation)?;

    Ok(decoded.claims)
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use serde_json::json;

    const KID: &str = "test-key";
    const SECRET: &[u8] = b"realtime-test-secret-realtime-test-secret";

    fn test_jwks() -> JwkSet {
        use base64::Engine;
        let k = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(SECRET);
        serde_json::from_value(json!({
            "keys": [{ "kty": "oct", "kid": KID, "alg": "HS256", "k": k }]
        }))
        .unwrap()
    }

    fn sign(algorithm: Algorithm, exp: i64) -> String {
        let header = Header {
            alg: algorithm,
            kid: Some(KID.to_string()),
            ..Header::default()
        };
        let claims = json!({
            "sub": Uuid::new_v4(),
            "exp": exp,
            "aud": "authenticated",
            "role": "authenticated",
        });
        encode(&header, &claims, &EncodingKey::from_secret(SECRET)).unwrap()
    }

    #[test]
    fn accepts_valid_token() {
        let token = sign(Algorithm::HS256, chrono::Utc::now().timestamp() + 3600);
        let claims = verify(&token, &test_jwks()).unwrap();
        assert_eq!(claims.role, "authenticated");
    }

    #[test]
    fn rejects_token_expired_within_default_leeway_window() {
        // 30s past exp is inside jsonwebtoken's default 60s leeway; accepting it
        // is what caused the ready->kill reconnect storm.
        let token = sign(Algorithm::HS256, chrono::Utc::now().timestamp() - 30);
        let error = verify(&token, &test_jwks()).unwrap_err();
        assert!(matches!(error.kind(), errors::ErrorKind::ExpiredSignature));
    }

    #[test]
    fn rejects_algorithm_not_declared_by_jwks_key() {
        let token = sign(Algorithm::HS384, chrono::Utc::now().timestamp() + 3600);
        assert!(verify(&token, &test_jwks()).is_err());
    }
}
