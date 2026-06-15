-- Supabase Realtime needs the full old row to reliably evaluate RLS on UPDATE and
-- to include q/r on DELETE events. hex_cells was at replica identity DEFAULT (PK
-- only), which broke realtime delivery of hide/reveal (UPDATE) and cell deletes.
-- Align it with characters (which is already FULL).

alter table hex_cells replica identity full;
