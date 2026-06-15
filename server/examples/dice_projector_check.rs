//! Dry-run of the live dice command path (Phase 8): exercises the single-CTE
//! `projection::append_and_project` against real data inside a rolled-back
//! transaction — verifying the event is appended AND the projection row is folded
//! from it in one round trip, with the display_name trigger firing. Writes nothing.

use hexmap_server::domains::dice::projection;
use hexmap_server::events::NewEvent;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;
use uuid::Uuid;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new().max_connections(1).connect(&database_url).await.expect("connect");
    let mut conn = pool.acquire().await.expect("acquire");
    let mut tx = conn.begin().await.expect("begin");

    let (session_id, user_id): (Uuid, Uuid) =
        sqlx::query_as("select session_id, user_id from dice_rolls limit 1")
            .fetch_one(&mut *tx).await.expect("need at least one existing dice_rolls row");

    let new_id = Uuid::new_v4();
    let event = NewEvent {
        aggregate_type: "dice_roll",
        aggregate_id: new_id,
        session_id: Some(session_id),
        event_type: "dice_roll.rolled",
        payload: json!({
            "pending": { "d20": 1 },
            "modifier": 3,
            "label": "Projector dry run",
            "character_id": null,
            "results": [{ "die": "d20", "value": 17 }],
            "total": 20,
            "stats": null,
        }),
        metadata: json!({ "user_id": user_id }),
    };

    let row = projection::append_and_project(&mut tx, &event).await.expect("append_and_project");
    println!("projected row returned from single-CTE command path:");
    println!("  id           = {}", row.id);
    println!("  display_name = {:?}  (trigger-filled)", row.display_name);
    println!("  total        = {}", row.total);
    println!("  modifier     = {}", row.modifier);
    println!("  created_at    = {}", row.created_at);

    let seq: i64 = sqlx::query_scalar(
        "select sequence from events where aggregate_type = 'dice_roll' and aggregate_id = $1",
    ).bind(new_id).fetch_one(&mut *tx).await.expect("event row");
    println!("  event sequence = {seq}  (expected 1 for a new aggregate)");

    let projected_total: i32 = sqlx::query_scalar("select total from dice_rolls where id = $1")
        .bind(new_id).fetch_one(&mut *tx).await.expect("projection row");

    if seq == 1 && projected_total == 20 && row.total == 20 {
        println!("\n✅ command path OK — event appended (seq 1) and projection folded from it in one round trip");
    } else {
        println!("\n❌ command path mismatch");
    }

    tx.rollback().await.expect("rollback");
    println!("(transaction rolled back — nothing written)");
}
