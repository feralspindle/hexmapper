//! Replay-diff verification for the dungeon domain (Phase 8). Dry run inside a
//! rolled-back transaction; backfills genesis events, replays each aggregate into a
//! shadow table, and diffs ALL projection columns against the live tables.

use hexmap_server::domains::dungeon::{corridor_projection, fog_projection, projection, room_projection};
use sqlx::postgres::PgPoolOptions;
use sqlx::Connection;
use std::env;

const GENESIS: &str = r#"
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dungeon', d.id, d.session_id, 1, 'dungeon.created', to_jsonb(d), jsonb_build_object('genesis', true), d.created_at
from dungeons d
where not exists (select 1 from events e where e.aggregate_type='dungeon' and e.aggregate_id=d.id);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dungeon_room', r.id, r.session_id, 1, 'dungeon_room.created', to_jsonb(r), jsonb_build_object('genesis', true), r.created_at
from dungeon_rooms r
where not exists (select 1 from events e where e.aggregate_type='dungeon_room' and e.aggregate_id=r.id);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dungeon_corridor', c.id, c.session_id, 1, 'dungeon_corridor.created', to_jsonb(c), jsonb_build_object('genesis', true), c.created_at
from dungeon_corridors c
where not exists (select 1 from events e where e.aggregate_type='dungeon_corridor' and e.aggregate_id=c.id);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dungeon_fog_cell', f.id, d.session_id, 1, 'dungeon_fog_cell.revealed', to_jsonb(f), jsonb_build_object('genesis', true), f.created_at
from dungeon_fog_cells f join dungeons d on d.id = f.dungeon_id
where not exists (select 1 from events e where e.aggregate_type='dungeon_fog_cell' and e.aggregate_id=f.id);
"#;

struct Agg {
    name: &'static str,
    table: &'static str,
    diff_cols: &'static str,
    replay: fn(&str) -> String,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let pool = PgPoolOptions::new().max_connections(1).connect(&env::var("DATABASE_URL").unwrap()).await.expect("connect");
    let mut conn = pool.acquire().await.unwrap();
    let mut tx = conn.begin().await.unwrap();

    sqlx::raw_sql(GENESIS).execute(&mut *tx).await.expect("backfill");

    let aggs = [
        Agg { name: "dungeon", table: "dungeons",
            diff_cols: "id, session_id, hex_id, name, created_at, updated_at, torch_running, torch_elapsed_ms, torch_started_at, map_image_path, map_image_offset_x, map_image_offset_y, map_image_scale, map_image_rotation, fog_mode, fog_reveal_all, map_offset_locked",
            replay: projection::replay_select },
        Agg { name: "dungeon_room", table: "dungeon_rooms",
            diff_cols: "id, dungeon_id, session_id, origin_x, origin_y, width, height, label, notes, color, source_client, created_at, updated_at, items, doors, shape, points",
            replay: room_projection::replay_select },
        Agg { name: "dungeon_corridor", table: "dungeon_corridors",
            diff_cols: "id, dungeon_id, session_id, x1, y1, x2, y2, label, width, source_client, created_at, updated_at, points",
            replay: corridor_projection::replay_select },
        Agg { name: "dungeon_fog_cell", table: "dungeon_fog_cells",
            diff_cols: "id, dungeon_id, cell_x, cell_y, source_client, created_at",
            replay: fog_projection::replay_select },
    ];

    let mut ok = true;
    for a in &aggs {
        let shadow = format!("shadow_{}", a.table);
        sqlx::query(&format!("create temp table {shadow} (like {} including defaults) on commit drop", a.table)).execute(&mut *tx).await.unwrap();
        let r = sqlx::query(&(a.replay)(&shadow)).execute(&mut *tx).await.unwrap().rows_affected();
        let live: i64 = sqlx::query_scalar(&format!("select count(*) from {}", a.table)).fetch_one(&mut *tx).await.unwrap();
        let m: i64 = sqlx::query_scalar(&format!("select count(*) from (select {c} from {t} except select {c} from {shadow}) d", c=a.diff_cols, t=a.table)).fetch_one(&mut *tx).await.unwrap();
        let e: i64 = sqlx::query_scalar(&format!("select count(*) from (select {c} from {shadow} except select {c} from {t}) d", c=a.diff_cols, t=a.table)).fetch_one(&mut *tx).await.unwrap();
        let pass = m == 0 && e == 0;
        ok &= pass;
        println!("{:<18} replayed={r:<4} live={live:<4} missing={m} extra={e}  {}", a.name, if pass {"✅"} else {"❌ DIVERGED"});
    }

    println!("\n{}", if ok { "✅ all dungeon aggregates replay faithful" } else { "❌ divergence detected" });
    tx.rollback().await.unwrap();
}
