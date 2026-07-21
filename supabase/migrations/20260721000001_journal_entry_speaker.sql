-- solo journal entries can be attached to a party character, recording who is
-- speaking or acting. character_id is the live link for the picker; the name
-- is a snapshot like author_name, so an entry keeps its speaker after the
-- character is renamed or deleted. composite fk so an entry cannot point at a
-- character from another session.

alter table public.journal_entries
  add column character_id   uuid,
  add column character_name text;

alter table public.journal_entries
  add constraint journal_entries_character_session_fkey
    foreign key (character_id, session_id)
    references public.characters (id, session_id)
    on delete set null (character_id);
