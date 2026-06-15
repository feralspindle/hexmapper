-- ROLLBACK for supabase/migrations/20260620000040_lock_write_rls.sql.
-- Drops the cutover write-lock, instantly restoring direct client writes (the
-- original permissive policies were never touched, so nothing needs recreating).
-- Apply manually if you need to fall back to the Vercel + direct-Supabase site:
--   cd server && cargo run --example apply_sql -- ../deploy/cutover-rollback-unlock-rls.sql
-- Kept out of supabase/migrations/ so it is never auto-applied as a forward migration.

do $$
declare
  t text;
  locked text[] := array[
    'characters','character_sheet_log','chat_messages','dice_macros','dice_rolls',
    'dice_roll_annotations',
    'dungeon_activity','dungeon_corridors','dungeon_element_notes','dungeon_fog_cells',
    'dungeon_rooms','dungeons','hex_cells','hex_notes','maps','party_bank_ledger',
    'party_calendar_days','party_calendar_settings','party_quests','party_session_notes',
    'party_vault_containers','party_vault_items','party_vault_loot','photo_broadcasts',
    'reference_photos','session_members','sessions','user_preferences'
  ];
begin
  foreach t in array locked loop
    execute format('drop policy if exists es_lock_no_insert on public.%I', t);
    execute format('drop policy if exists es_lock_no_update on public.%I', t);
    execute format('drop policy if exists es_lock_no_delete on public.%I', t);
  end loop;
end $$;
