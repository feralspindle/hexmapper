use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{decode, decode_header, errors, DecodingKey, Validation};
use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SupabaseClaims {
    pub sub: Uuid,
    pub role: String,
    pub email: Option<String>,
}

pub async fn fetch_jwks(supabase_url: &str) -> Result<JwkSet, reqwest::Error> {
    let url = format!("{}/auth/v1/.well-known/jwks.json", supabase_url.trim_end_matches('/'));
    reqwest::get(&url).await?.json::<JwkSet>().await
}

pub fn verify(token: &str, jwks: &JwkSet) -> Result<SupabaseClaims, errors::Error> {
    let header = decode_header(token)?;

    let kid = header.kid.as_deref().ok_or(errors::ErrorKind::InvalidToken)?;
    let jwk = jwks.find(kid).ok_or(errors::ErrorKind::InvalidToken)?;
    let decoding_key = DecodingKey::from_jwk(jwk)?;

    let mut validation = Validation::new(header.alg);
    validation.set_audience(&["authenticated"]);

    let decoded = decode::<SupabaseClaims>(token, &decoding_key, &validation)?;

    Ok(decoded.claims)
}
