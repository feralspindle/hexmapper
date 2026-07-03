use std::env;

pub struct Config {
    pub database_url: String,
    pub supabase_url: String,
    pub cors_allowed_origins: Vec<String>,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            supabase_url: env::var("SUPABASE_URL").expect("SUPABASE_URL must be set"),
            cors_allowed_origins: {
                let origins: Vec<_> = env::var("CORS_ALLOWED_ORIGIN")
                    .expect("CORS_ALLOWED_ORIGIN must be set")
                    .split(',')
                    .map(str::trim)
                    .filter(|origin| !origin.is_empty())
                    .map(str::to_owned)
                    .collect();
                assert!(
                    !origins.is_empty(),
                    "CORS_ALLOWED_ORIGIN must include at least one origin"
                );
                origins
            },
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
        }
    }
}
