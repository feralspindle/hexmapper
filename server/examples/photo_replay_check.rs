//! Replay-diff verification for the photo domain (Phase 8). Dry run: backfills
//! genesis events for both aggregates, replays each into a shadow table via the
//! real `projection::replay_*` functions, diffs against the live tables, then rolls
//! back. Exercises the lifecycle exclusion (reference_photo) and the ON DELETE SET
//! NULL reconstruction of photo_id (photo_broadcast).

use hexmap_server::domains::photo::projection;
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS_REFERENCE: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'reference_photo', rp.id, rp.session_id::uuid, 1, 'reference_photo.created',
  jsonb_build_object('name', rp.name, 'storage_path', rp.storage_path),
  jsonb_build_object('user_id', rp.user_id, 'genesis', true),
  coalesce(rp.created_at, now())
from reference_photos rp
where not exists (select 1 from events e where e.aggregate_type = 'reference_photo' and e.aggregate_id = rp.id)
"#;

const GENESIS_BROADCAST: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'photo_broadcast', pb.id, pb.session_id::uuid, 1, 'photo_broadcast.sent',
  jsonb_build_object('photo_id', pb.photo_id, 'photo_url', pb.photo_url, 'photo_name', pb.photo_name),
  jsonb_build_object('user_id', pb.user_id, 'genesis', true),
  coalesce(pb.created_at, now())
from photo_broadcasts pb
where not exists (select 1 from events e where e.aggregate_type = 'photo_broadcast' and e.aggregate_id = pb.id)
"#;

const SHADOW_REFERENCE_DDL: &str = r#"
create temp table shadow_reference_photos (
  id uuid, session_id text, user_id uuid, name text, storage_path text, created_at timestamptz
) on commit drop
"#;

const SHADOW_BROADCAST_DDL: &str = r#"
create temp table shadow_photo_broadcasts (
  id uuid, session_id text, user_id uuid, photo_id uuid, photo_url text, photo_name text, created_at timestamptz
) on commit drop
"#;

const REF_COLS: &str = "id, session_id, user_id, name, storage_path, created_at";
const BCAST_COLS: &str = "id, session_id, user_id, photo_id, photo_url, photo_name, created_at";

async fn diff(tx: &mut sqlx::PgConnection, live: &str, shadow: &str, cols: &str) -> (i64, i64) {
    let missing: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {cols} from {live} except select {cols} from {shadow}) d"
    )).fetch_one(&mut *tx).await.unwrap();
    let extra: i64 = sqlx::query_scalar(&format!(
        "select count(*) from (select {cols} from {shadow} except select {cols} from {live}) d"
    )).fetch_one(&mut *tx).await.unwrap();
    (missing, extra)
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new().max_connections(1).connect(&database_url).await.expect("connect");
    let mut conn = pool.acquire().await.expect("acquire");
    let mut tx = conn.begin().await.expect("begin");

    let bf_ref = sqlx::query(GENESIS_REFERENCE).execute(&mut *tx).await.expect("ref backfill").rows_affected();
    let bf_bcast = sqlx::query(GENESIS_BROADCAST).execute(&mut *tx).await.expect("bcast backfill").rows_affected();
    println!("genesis backfilled (dry run): {bf_ref} reference_photo, {bf_bcast} photo_broadcast");

    sqlx::query(SHADOW_REFERENCE_DDL).execute(&mut *tx).await.expect("ddl ref");
    sqlx::query(SHADOW_BROADCAST_DDL).execute(&mut *tx).await.expect("ddl bcast");

    let r1 = sqlx::query(&projection::replay_reference_photos("shadow_reference_photos")).execute(&mut *tx).await.expect("replay ref").rows_affected();
    let r2 = sqlx::query(&projection::replay_photo_broadcasts("shadow_photo_broadcasts")).execute(&mut *tx).await.expect("replay bcast").rows_affected();
    println!("replayed: {r1} reference_photos, {r2} photo_broadcasts");

    let (rm, re) = diff(&mut tx, "reference_photos", "shadow_reference_photos", REF_COLS).await;
    let (bm, be) = diff(&mut tx, "photo_broadcasts", "shadow_photo_broadcasts", BCAST_COLS).await;

    println!("reference_photos diff — missing: {rm}, extra: {re}");
    println!("photo_broadcasts diff — missing: {bm}, extra: {be}");

    if rm == 0 && re == 0 && bm == 0 && be == 0 {
        println!("\n✅ replay is faithful for both photo aggregates (lifecycle + SET NULL reconstruction)");
    } else {
        println!("\n❌ replay diverged");
    }

    tx.rollback().await.expect("rollback");
    println!("(transaction rolled back — nothing written)");
}
