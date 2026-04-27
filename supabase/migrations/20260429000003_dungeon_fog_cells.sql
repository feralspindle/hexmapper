-- Grid-based fog of war for dungeons.
-- Ported from supabase_migration_dungeon_fog_grid.sql with secure RLS policies
-- (replaces the original open "using (true)" policy).

create table if not exists dungeon_fog_cells (
  id            uuid        primary key default gen_random_uuid(),
  dungeon_id    uuid        not null references dungeons(id) on delete cascade,
  cell_x        integer     not null,
  cell_y        integer     not null,
  source_client text,
  created_at    timestamptz not null default now(),
  unique (dungeon_id, cell_x, cell_y)
);

create index if not exists dungeon_fog_cells_dungeon_idx
  on dungeon_fog_cells(dungeon_id);

alter table dungeon_fog_cells enable row level security;

-- Members can read fog state (needed to render the fog overlay client-side)
create policy "dungeon_fog_cells_member_select" on dungeon_fog_cells
  as permissive for select to authenticated
  using (
    exists (
      select 1 from dungeons d
      where d.id = dungeon_fog_cells.dungeon_id
        and is_session_member(d.session_id)
    )
  );

-- Only the GM can reveal or hide fog cells
create policy "dungeon_fog_cells_gm_write" on dungeon_fog_cells
  as permissive for all to authenticated
  using (
    exists (
      select 1 from dungeons d
      where d.id = dungeon_fog_cells.dungeon_id
        and is_session_gm(d.session_id)
    )
  )
  with check (
    exists (
      select 1 from dungeons d
      where d.id = dungeon_fog_cells.dungeon_id
        and is_session_gm(d.session_id)
    )
  );

alter publication supabase_realtime add table dungeon_fog_cells;

-- Remove old room-level revealed columns (superseded by grid-based fog)
alter table dungeon_rooms      drop column if exists revealed;
alter table dungeon_corridors  drop column if exists revealed;
