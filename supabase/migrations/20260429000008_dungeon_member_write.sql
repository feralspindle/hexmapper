-- The dungeon map is collaboratively edited by all session members, not just
-- the GM. Open up room and corridor writes to any session member.
-- Fog cells remain GM-only: revealing/hiding fog is a GM privilege.

drop policy if exists "dungeon_rooms_gm_write" on dungeon_rooms;
create policy "dungeon_rooms_member_write" on dungeon_rooms
  as permissive for all to authenticated
  using  (is_dungeon_member(dungeon_id))
  with check (is_dungeon_member(dungeon_id));

drop policy if exists "dungeon_corridors_gm_write" on dungeon_corridors;
create policy "dungeon_corridors_member_write" on dungeon_corridors
  as permissive for all to authenticated
  using  (is_dungeon_member(dungeon_id))
  with check (is_dungeon_member(dungeon_id));
