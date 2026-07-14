-- parent_map_id / parent_hex_id landed in map_hierarchy_party_columns after
-- the session_relationship_integrity pass, with plain fks only - so a map
-- could claim a parent map or hex from another session (#6, last open path).
-- Same composite-fk treatment as the rest of the linked records.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maps_parent_map_session_fkey'
      and conrelid = 'public.maps'::regclass
  ) then
    alter table public.maps
      add constraint maps_parent_map_session_fkey
      foreign key (parent_map_id, session_id)
        references public.maps (id, session_id)
        on delete set null (parent_map_id) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maps_parent_hex_session_fkey'
      and conrelid = 'public.maps'::regclass
  ) then
    alter table public.maps
      add constraint maps_parent_hex_session_fkey
      foreign key (parent_hex_id, session_id)
        references public.hex_cells (id, session_id)
        on delete set null (parent_hex_id) not valid;
  end if;
end $$;
