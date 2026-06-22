-- A foreign key on the parent id and a separate foreign key on session_id do
-- not prove that both rows belong to the same session.  Composite foreign keys
-- make that tenant boundary a database invariant.  They are NOT VALID so the
-- migration protects new writes without being blocked by historical rows; a
-- separate data audit can validate them after any legacy violations are fixed.

alter table public.maps
  add constraint maps_id_session_id_key unique (id, session_id);
alter table public.hex_cells
  add constraint hex_cells_id_session_id_key unique (id, session_id);
alter table public.dungeons
  add constraint dungeons_id_session_id_key unique (id, session_id);
alter table public.characters
  add constraint characters_id_session_id_key unique (id, session_id);
alter table public.dice_rolls
  add constraint dice_rolls_id_session_id_key unique (id, session_id);
alter table public.party_vault_containers
  add constraint party_vault_containers_id_session_id_key unique (id, session_id);
alter table public.reference_photos
  add constraint reference_photos_id_session_id_key unique (id, session_id);

alter table public.hex_cells
  add constraint hex_cells_map_session_fkey
  foreign key (map_id, session_id)
  references public.maps (id, session_id)
  on delete cascade not valid;

alter table public.dungeons
  add constraint dungeons_hex_session_fkey
  foreign key (hex_id, session_id)
  references public.hex_cells (id, session_id)
  on delete cascade not valid;

alter table public.dungeon_rooms
  add constraint dungeon_rooms_dungeon_session_fkey
  foreign key (dungeon_id, session_id)
  references public.dungeons (id, session_id)
  on delete cascade not valid;

alter table public.dungeon_corridors
  add constraint dungeon_corridors_dungeon_session_fkey
  foreign key (dungeon_id, session_id)
  references public.dungeons (id, session_id)
  on delete cascade not valid;

alter table public.hex_notes
  add constraint hex_notes_cell_session_fkey
  foreign key (hex_cell_id, session_id)
  references public.hex_cells (id, session_id)
  on delete cascade not valid;

alter table public.map_drafts
  add constraint map_drafts_map_session_fkey
  foreign key (map_id, session_id)
  references public.maps (id, session_id)
  on delete cascade not valid;

alter table public.dice_rolls
  add constraint dice_rolls_character_session_fkey
  foreign key (character_id, session_id)
  references public.characters (id, session_id)
  on delete set null (character_id) not valid;

alter table public.dice_roll_annotations
  add constraint dice_roll_annotations_roll_session_fkey
  foreign key (roll_id, session_id)
  references public.dice_rolls (id, session_id)
  on delete cascade not valid;

alter table public.party_vault_items
  add constraint party_vault_items_container_session_fkey
  foreign key (container_id, session_id)
  references public.party_vault_containers (id, session_id)
  on delete set null (container_id) not valid;

alter table public.photo_broadcasts
  add constraint photo_broadcasts_photo_session_fkey
  foreign key (photo_id, session_id)
  references public.reference_photos (id, session_id)
  on delete set null (photo_id) not valid;

alter table public.sessions
  add constraint sessions_active_map_session_fkey
  foreign key (active_map_id, id)
  references public.maps (id, session_id)
  on delete set null (active_map_id) not valid;

alter table public.session_members
  add constraint session_members_active_character_session_fkey
  foreign key (active_character_id, session_id)
  references public.characters (id, session_id)
  on delete set null (active_character_id) not valid;

create or replace function public.enforce_dungeon_note_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.element_type = 'room' and not exists (
    select 1 from public.dungeon_rooms
    where id = new.element_id and session_id = new.session_id
  ) then
    raise foreign_key_violation using
      message = 'dungeon note room does not belong to session';
  elsif new.element_type = 'corridor' and not exists (
    select 1 from public.dungeon_corridors
    where id = new.element_id and session_id = new.session_id
  ) then
    raise foreign_key_violation using
      message = 'dungeon note corridor does not belong to session';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_dungeon_note_session() from public;

create trigger enforce_dungeon_note_session
  before insert or update of element_id, element_type, session_id
  on public.dungeon_element_notes
  for each row execute function public.enforce_dungeon_note_session();
