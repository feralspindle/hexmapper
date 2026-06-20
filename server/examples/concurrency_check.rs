//! Proves the optimistic-concurrency guard (`retry_tx!`) serializes concurrent
//! same-aggregate event appends instead of failing with 23505.
//!
//! Unlike the rollback-only replay checks, this *commits* real rows — it fires N
//! concurrent appends at one synthetic aggregate (`aggregate_type = 'concurrency_test'`,
//! which has no projection table, so nothing else is touched), asserts all N succeed
//! with contiguous sequences 1..=N, then deletes the scratch events. With N writers
//! all computing `max(sequence)+1` at once, the unique constraint forces conflicts;
//! the run passing proves the retry resolved every one.

use hexmap_server::error::AppError;
use hexmap_server::events::projector::APPEND_EVENT_CTE;
use hexmap_server::observability;
use hexmap_server::retry_tx;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use std::env;
use uuid::Uuid;

// Kept under the Supabase session-pooler client cap (pool_size 15) so every writer
// gets a real connection and actually races on the constraint.
const N: usize = 12;
const AGG_TYPE: &str = "concurrency_test";

async fn append_one(pool: &sqlx::PgPool, agg_id: Uuid, n: usize) -> Result<(), AppError> {
    retry_tx!(pool, |tx| {
        // The append's own sequence isn't visible to a sibling SELECT on `events` in
        // the same statement, so just confirm the insert via evt's RETURNING; the
        // contiguity check reads the sequences back afterwards.
        let sql = format!("{APPEND_EVENT_CTE} select aggregate_id from evt");
        let _: Uuid = sqlx::query_scalar(&sql)
            .bind(AGG_TYPE)
            .bind(agg_id)
            .bind(Option::<Uuid>::None)
            .bind("concurrency_test.appended")
            .bind(json!({ "n": n }))
            .bind(json!({}))
            .fetch_one(&mut *tx)
            .await?;
        Ok(())
    })
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let handle = observability::install_metrics();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    // Pool must allow all N writers to race simultaneously, or they serialize at the
    // pool and never contend on the constraint.
    let pool = PgPoolOptions::new()
        .max_connections(N as u32 + 1)
        .connect(&database_url)
        .await
        .expect("connect");

    let agg_id = Uuid::new_v4();

    let mut tasks = Vec::new();
    for n in 0..N {
        let pool = pool.clone();
        tasks.push(tokio::spawn(async move { append_one(&pool, agg_id, n).await }));
    }

    let mut ok = 0usize;
    let mut errs = Vec::new();
    for t in tasks {
        match t.await.expect("task join") {
            Ok(_) => ok += 1,
            Err(e) => errs.push(format!("{e:?}")),
        }
    }

    let sequences: Vec<i64> =
        sqlx::query_scalar("select sequence from events where aggregate_type = $1 and aggregate_id = $2 order by sequence")
            .bind(AGG_TYPE)
            .bind(agg_id)
            .fetch_all(&pool)
            .await
            .expect("read sequences");

    // Clean up the scratch events.
    sqlx::query("delete from events where aggregate_type = $1 and aggregate_id = $2")
        .bind(AGG_TYPE)
        .bind(agg_id)
        .execute(&pool)
        .await
        .expect("cleanup");

    let contiguous: Vec<i64> = (1..=N as i64).collect();
    let retries = handle
        .render()
        .lines()
        .find(|l| l.starts_with("sequence_conflict_retries_total"))
        .and_then(|l| l.rsplit(' ').next())
        .unwrap_or("0")
        .to_string();

    println!("concurrent appends to one aggregate: {ok}/{N} succeeded");
    println!("retries recorded (sequence_conflict_retries_total): {retries}");
    println!("sequences written: {sequences:?}");
    if !errs.is_empty() {
        println!("errors: {errs:?}");
    }

    if ok == N && sequences == contiguous {
        println!("\n✅ all {N} concurrent appends serialized into contiguous sequences 1..={N}");
    } else {
        println!("\n❌ concurrency guard failed (expected {N} contiguous sequences)");
        std::process::exit(1);
    }
}
