//! Replay-diff verification for `dice_roll_annotation` (Phase 8). Dry run in a
//! rolled-back tx: backfill genesis, replay into a shadow table, diff ALL columns.

use hexmap_server::domains::dice::annotation_projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dice_roll_annotation', a.id, a.session_id, 1, 'dice_roll_annotation.created',
       jsonb_build_object('roll_id', a.roll_id, 'body', a.body),
       jsonb_build_object('user_id', a.user_id, 'display_name', a.display_name, 'genesis', true),
       a.created_at
from dice_roll_annotations a
where not exists (select 1 from events e where e.aggregate_type='dice_roll_annotation' and e.aggregate_id=a.id)
"#;
const DIFF_COLS: &str = "id, roll_id, session_id, user_id, display_name, body, created_at";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let pool = PgPoolOptions::new().max_connections(1).connect(&env::var("DATABASE_URL").unwrap()).await.expect("connect");
    let mut conn = pool.acquire().await.unwrap();
    let mut tx = conn.begin().await.unwrap();

    let bf = sqlx::query(GENESIS).execute(&mut *tx).await.expect("backfill").rows_affected();
    println!("genesis backfilled (dry run): {bf}");
    sqlx::query("create temp table shadow_dice_roll_annotations (like dice_roll_annotations including defaults) on commit drop").execute(&mut *tx).await.unwrap();
    let r = sqlx::query(&annotation_projection::replay_select("shadow_dice_roll_annotations")).execute(&mut *tx).await.unwrap().rows_affected();
    let live: i64 = sqlx::query_scalar("select count(*) from dice_roll_annotations").fetch_one(&mut *tx).await.unwrap();
    let m: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from dice_roll_annotations except select {DIFF_COLS} from shadow_dice_roll_annotations) d")).fetch_one(&mut *tx).await.unwrap();
    let e: i64 = sqlx::query_scalar(&format!("select count(*) from (select {DIFF_COLS} from shadow_dice_roll_annotations except select {DIFF_COLS} from dice_roll_annotations) d")).fetch_one(&mut *tx).await.unwrap();
    println!("replayed={r}  live={live}  missing={m}  extra={e}");
    println!("{}", if m == 0 && e == 0 { "✅ replay faithful (incl. display_name)" } else { "❌ diverged" });
    tx.rollback().await.unwrap();
}
