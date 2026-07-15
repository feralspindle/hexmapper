-- Fog-mode cell annotations. In fog mode the map is a background image the GM
-- reveals cell by cell - there are no drawn rooms or corridors to hang the
-- annotation layer on. Two projections fill that gap, both keyed to the same
-- grid as dungeon_fog_cells / dungeon_tokens:
--   dungeon_icons      - free-placed grid icons (same palette as room items)
--   dungeon_cell_notes - threaded notes attached to a grid cell
-- Visibility mirrors the dungeon_tokens rule from 20260715000000: players only
-- read rows on revealed ground (is_dungeon_cell_visible), the GM reads
-- everything, and the rust realtime hub applies the same filter to event
-- pushes. Writes go through the rust server only (es_lock).

create table if not exists dungeon_icons (
  id            uuid        primary key default gen_random_uuid(),
  dungeon_id    uuid        not null references dungeons(id) on delete cascade,
  session_id    uuid        not null references sessions(id) on delete cascade,
  type          text        not null,
  label         text,
  notes         text,
  x             integer     not null,
  y             integer     not null,
  source_client text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists dungeon_icons_dungeon_idx
  on dungeon_icons(dungeon_id);

create table if not exists dungeon_cell_notes (
  id            uuid        primary key default gen_random_uuid(),
  dungeon_id    uuid        not null references dungeons(id) on delete cascade,
  session_id    uuid        not null references sessions(id) on delete cascade,
  cell_x        integer     not null,
  cell_y        integer     not null,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  display_name  text        not null,
  body          text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists dungeon_cell_notes_cell_idx
  on dungeon_cell_notes(dungeon_id, cell_x, cell_y);

-- composite fks so a row can't stitch together a dungeon from another session
-- (same pattern as session_relationship_integrity / dungeon_tokens)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_icons_dungeon_session_fkey'
      and conrelid = 'public.dungeon_icons'::regclass
  ) then
    alter table public.dungeon_icons
      add constraint dungeon_icons_dungeon_session_fkey
      foreign key (dungeon_id, session_id)
        references public.dungeons (id, session_id)
        on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_cell_notes_dungeon_session_fkey'
      and conrelid = 'public.dungeon_cell_notes'::regclass
  ) then
    alter table public.dungeon_cell_notes
      add constraint dungeon_cell_notes_dungeon_session_fkey
      foreign key (dungeon_id, session_id)
        references public.dungeons (id, session_id)
        on delete cascade;
  end if;
end $$;

alter table dungeon_icons enable row level security;
alter table dungeon_cell_notes enable row level security;

-- member select, fog-gated for players; writes go through the api
drop policy if exists "dungeon_icons_member_select" on dungeon_icons;
create policy "dungeon_icons_member_select" on dungeon_icons
  as permissive for select to authenticated
  using (
    is_session_member(session_id)
    and (is_session_gm(session_id) or is_dungeon_cell_visible(dungeon_id, x, y))
  );

drop policy if exists "dungeon_cell_notes_member_select" on dungeon_cell_notes;
create policy "dungeon_cell_notes_member_select" on dungeon_cell_notes
  as permissive for select to authenticated
  using (
    is_session_member(session_id)
    and (is_session_gm(session_id) or is_dungeon_cell_visible(dungeon_id, cell_x, cell_y))
  );

drop policy if exists es_lock_no_insert on dungeon_icons;
drop policy if exists es_lock_no_update on dungeon_icons;
drop policy if exists es_lock_no_delete on dungeon_icons;
create policy es_lock_no_insert on dungeon_icons as restrictive for insert to authenticated, anon with check (false);
create policy es_lock_no_update on dungeon_icons as restrictive for update to authenticated, anon using (false);
create policy es_lock_no_delete on dungeon_icons as restrictive for delete to authenticated, anon using (false);

drop policy if exists es_lock_no_insert on dungeon_cell_notes;
drop policy if exists es_lock_no_update on dungeon_cell_notes;
drop policy if exists es_lock_no_delete on dungeon_cell_notes;
create policy es_lock_no_insert on dungeon_cell_notes as restrictive for insert to authenticated, anon with check (false);
create policy es_lock_no_update on dungeon_cell_notes as restrictive for update to authenticated, anon using (false);
create policy es_lock_no_delete on dungeon_cell_notes as restrictive for delete to authenticated, anon using (false);

alter table dungeon_icons replica identity full;
alter table dungeon_cell_notes replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dungeon_icons'
  ) then
    alter publication supabase_realtime add table dungeon_icons;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dungeon_cell_notes'
  ) then
    alter publication supabase_realtime add table dungeon_cell_notes;
  end if;
end $$;
