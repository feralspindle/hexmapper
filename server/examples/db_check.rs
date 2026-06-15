use sqlx::postgres::PgPoolOptions;
use std::env;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .expect("failed to connect");

    let one: i32 = sqlx::query_scalar("select 1").fetch_one(&pool).await.expect("select 1 failed");
    println!("select 1 -> {one}");

    match sqlx::query_scalar::<_, i64>("select count(*) from events").fetch_one(&pool).await {
        Ok(count) => println!("events table row count -> {count}"),
        Err(e) => println!("events table query failed -> {e}"),
    }

    let dice_count: Option<i64> = sqlx::query_scalar("select count(*) from dice_rolls")
        .fetch_one(&pool)
        .await
        .ok();
    println!("dice_rolls table row count -> {dice_count:?}");
}
