-- Cutover write-lock (Phase 8). Blocks all client (authenticated/anon) INSERT/
-- UPDATE/DELETE on the event-sourced tables, so the ONLY write path becomes the Rust
-- server — which connects as `postgres` (bypassrls=true, verified) and is therefore
-- unaffected. SELECT is left untouched (reads keep working).
--
-- Implemented as RESTRICTIVE policies returning false. Restrictive policies are
-- AND-ed with every existing permissive policy, so this neither depends on nor
-- removes the current read/write policies — it just adds a hard "no" for writes.
-- Fully reversible without touching the originals: apply
-- deploy/cutover-rollback-unlock-rls.sql to drop these policies.
--
-- Intentionally NOT locked (still a direct client write): bug_reports.
-- (events is already service_role-only; map_drafts is unused.)

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
    -- idempotent: drop first so re-running this migration is safe
    execute format('drop policy if exists es_lock_no_insert on public.%I', t);
    execute format('drop policy if exists es_lock_no_update on public.%I', t);
    execute format('drop policy if exists es_lock_no_delete on public.%I', t);
    execute format('create policy es_lock_no_insert on public.%I as restrictive for insert to authenticated, anon with check (false)', t);
    execute format('create policy es_lock_no_update on public.%I as restrictive for update to authenticated, anon using (false)', t);
    execute format('create policy es_lock_no_delete on public.%I as restrictive for delete to authenticated, anon using (false)', t);
  end loop;
end $$;
