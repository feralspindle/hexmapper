-- The dungeon_rooms, dungeon_corridors, and dungeon_fog_cells policies were
-- written as inline EXISTS subqueries on the dungeons table:
--   exists (select 1 from dungeons d where d.id = ... and is_session_gm(d.session_id))
--
-- This causes the WITH CHECK clause to query `dungeons` with RLS active, which
-- itself evaluates is_session_member / is_session_gm — a nested policy chain
-- that Postgres can reject with an RLS violation even when the user is the GM.
--
-- Fix: two SECURITY DEFINER helpers that look up the dungeon's session without
-- going through RLS, matching the pattern used by is_session_member / is_session_gm.

create or replace function is_dungeon_gm(p_dungeon_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from dungeons d
    join sessions s on s.id = d.session_id
    where d.id = p_dungeon_id
      and s.owner_id = auth.uid()
  );
end $$;

create or replace function is_dungeon_member(p_dungeon_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from dungeons d
    where d.id = p_dungeon_id
      and is_session_member(d.session_id)
  );
end $$;

-- dungeon_rooms
drop policy if exists "dungeon_rooms_member_select" on dungeon_rooms;
drop policy if exists "dungeon_rooms_gm_write"      on dungeon_rooms;

create policy "dungeon_rooms_member_select" on dungeon_rooms
  as permissive for select to authenticated
  using (is_dungeon_member(dungeon_id));
drop policy if exists "dungeon_rooms_gm_write" on dungeon_rooms;

create policy "dungeon_rooms_gm_write" on dungeon_rooms
  as permissive for all to authenticated
  using  (is_dungeon_gm(dungeon_id))
  with check (is_dungeon_gm(dungeon_id));

-- dungeon_corridors
drop policy if exists "dungeon_corridors_member_select" on dungeon_corridors;
drop policy if exists "dungeon_corridors_gm_write"      on dungeon_corridors;

create policy "dungeon_corridors_member_select" on dungeon_corridors
  as permissive for select to authenticated
  using (is_dungeon_member(dungeon_id));
drop policy if exists "dungeon_corridors_gm_write" on dungeon_corridors;

create policy "dungeon_corridors_gm_write" on dungeon_corridors
  as permissive for all to authenticated
  using  (is_dungeon_gm(dungeon_id))
  with check (is_dungeon_gm(dungeon_id));

-- dungeon_fog_cells (created in migration 00003 with the same inline pattern)
drop policy if exists "dungeon_fog_cells_member_select" on dungeon_fog_cells;
drop policy if exists "dungeon_fog_cells_gm_write"      on dungeon_fog_cells;

create policy "dungeon_fog_cells_member_select" on dungeon_fog_cells
  as permissive for select to authenticated
  using (is_dungeon_member(dungeon_id));
drop policy if exists "dungeon_fog_cells_gm_write" on dungeon_fog_cells;

create policy "dungeon_fog_cells_gm_write" on dungeon_fog_cells
  as permissive for all to authenticated
  using  (is_dungeon_gm(dungeon_id))
  with check (is_dungeon_gm(dungeon_id));
