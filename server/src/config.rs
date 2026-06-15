use std::env;

pub struct Config {
    pub database_url: String,
    pub supabase_url: String,
    pub cors_allowed_origin: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            supabase_url: env::var("SUPABASE_URL").expect("SUPABASE_URL must be set"),
            cors_allowed_origin: env::var("CORS_ALLOWED_ORIGIN")
                .expect("CORS_ALLOWED_ORIGIN must be set"),
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
        }
    }
}
