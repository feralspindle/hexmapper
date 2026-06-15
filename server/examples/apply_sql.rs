//! One-off: apply a SQL file against DATABASE_URL. Usage:
//!   cargo run --example apply_sql -- ../supabase/migrations/<file>.sql
//! Migrations here are written idempotent, so re-running is safe.

use sqlx::postgres::PgPoolOptions;
use std::{env, fs};

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let path = env::args().nth(1).expect("usage: apply_sql -- <path.sql>");
    let sql = fs::read_to_string(&path).expect("read sql file");
    let pool = PgPoolOptions::new().max_connections(1).connect(&env::var("DATABASE_URL").unwrap()).await.expect("connect");
    sqlx::raw_sql(&sql).execute(&pool).await.expect("apply sql");
    println!("applied {path}");
}
