-- Fix RLS infinite recursion caused by cross-table inline subqueries between
-- sessions and session_members. Replace with SECURITY DEFINER helpers that
-- bypass RLS and break the mutual recursion cycle.

-- sessions_select was: exists (select 1 from session_members where ... user_id = auth.uid())
-- That queries session_members with RLS active → session_members_select queries sessions → loop.
drop policy if exists "sessions_select" on sessions;
create policy "sessions_select" on sessions
  as permissive for select to authenticated
  using (owner_id = auth.uid() or is_session_member(id));

-- session_members_select was: exists (select 1 from sessions where ... owner_id = auth.uid())
-- That queries sessions with RLS active → sessions_select queries session_members → loop.
drop policy if exists "session_members_select" on session_members;
create policy "session_members_select" on session_members
  as permissive for select to authenticated
  using (user_id = auth.uid() or is_session_gm(session_id));

-- Same pattern: inline sessions query inside session_members policy.
drop policy if exists "session_members_delete" on session_members;
create policy "session_members_delete" on session_members
  as permissive for delete to authenticated
  using (user_id = auth.uid() or is_session_gm(session_id));

-- hex_cells player policies queried session_members inline.
drop policy if exists "hex_cells_player_select" on hex_cells;
create policy "hex_cells_player_select" on hex_cells
  as permissive for select to authenticated
  using (revealed = true and is_session_member(session_id));

drop policy if exists "hex_cells_player_marker" on hex_cells;
create policy "hex_cells_player_marker" on hex_cells
  as permissive for insert to authenticated
  with check (is_session_member(session_id));
