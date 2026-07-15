-- issue #153: fog-staged tokens leaked their positions to players. hiding was
-- render-only - the member select policy returned every token row, so a
-- GM-staged ambush was one devtools tab away. players now only read tokens on
-- revealed ground; the GM keeps full select. the realtime path gets the same
-- treatment server-side (visible_event in the rust hub).

-- security definer so the policy doesn't re-enter RLS on dungeons /
-- dungeon_fog_cells, same as is_session_member / is_session_gm
create or replace function is_dungeon_cell_visible(p_dungeon_id uuid, p_x integer, p_y integer)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  return not exists (
    select 1 from dungeons
    where id = p_dungeon_id and fog_mode and not fog_reveal_all
  ) or exists (
    select 1 from dungeon_fog_cells
    where dungeon_id = p_dungeon_id and cell_x = p_x and cell_y = p_y
  );
end $$;

drop policy if exists "dungeon_tokens_member_select" on dungeon_tokens;
create policy "dungeon_tokens_member_select" on dungeon_tokens
  as permissive for select to authenticated
  using (
    is_session_member(session_id)
    and (is_session_gm(session_id) or is_dungeon_cell_visible(dungeon_id, x, y))
  );
