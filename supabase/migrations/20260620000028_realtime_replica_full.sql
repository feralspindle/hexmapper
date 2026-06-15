-- Align replica identity to FULL for migrated tables that take UPDATE/DELETE and
-- rely on Supabase Realtime postgres_changes with RLS. Without FULL, realtime
-- delivery of edits across clients is unreliable (see hex_cells hide/reveal).
-- Append-only tables (chat, dice, activity, photo_broadcasts) don't need this.

alter table maps                  replica identity full;
alter table hex_notes             replica identity full;
alter table dungeon_element_notes replica identity full;
