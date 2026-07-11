-- issue #57: the api redacts unexplored hexes to sentinels for everyone, but the
-- hex_cells_gm_all rls policy still hands the session owner full rows. in gm_less
-- play the driver is the owner, so any player could take their jwt to postgrest
-- and read terrain/label/notes for hexes the party never entered. split the gm
-- policy so select excludes explored = false rows in gm_less sessions.
--
-- gm-led sessions are untouched: exploration only exists in gm_less play (same
-- contract as server/src/domains/hex/visibility.rs and projection.rs), and the
-- owner there authors the map.
--
-- writes are unchanged. the app writes through the api (service role), and the
-- supabase realtime path only loses events for rows this policy hides - the rust
-- realtime path already collapses those to sentinels for everyone.

-- security definer to match is_session_gm, otherwise the sessions subquery
-- re-enters sessions rls (see 20260429000004_fix_rls_recursion.sql)
create or replace function is_gm_less_session(p_session_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from sessions where id = p_session_id and play_mode = 'gm_less'
  );
end;
$$;

drop policy if exists "hex_cells_gm_all" on public.hex_cells;

create policy "hex_cells_gm_select" on public.hex_cells
  as permissive for select to authenticated
  using (
    is_session_gm(session_id)
    and not (explored = false and is_gm_less_session(session_id))
  );

create policy "hex_cells_gm_insert" on public.hex_cells
  as permissive for insert to authenticated
  with check (is_session_gm(session_id));

create policy "hex_cells_gm_update" on public.hex_cells
  as permissive for update to authenticated
  using (is_session_gm(session_id))
  with check (is_session_gm(session_id));

create policy "hex_cells_gm_delete" on public.hex_cells
  as permissive for delete to authenticated
  using (is_session_gm(session_id));
