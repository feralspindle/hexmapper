-- Reconcile drift found on live production (LIVE_SOURCE) that was never captured
-- as a migration, so a from-scratch apply reproduces prod. See deploy/reconcile-drift.md
-- and deploy/check-drift.sh. Every statement is idempotent (safe on a fresh DB too).

-- 1. Security: drop the wide-open leftover fog policy still on prod. The real model
--    (dungeon_fog_cells_gm_write + dungeon_fog_cells_member_select) is already applied.
drop policy if exists "dungeon_fog_cells_auth" on public.dungeon_fog_cells;

-- 2. Drop the dead dungeon-images read policy. That bucket is unused — dungeon images
--    are stored in session-maps (see src/stores/dungeonStore.js).
drop policy if exists "Public access to dungeon images" on storage.objects;

-- 3. Capture the quest-reward columns that were added directly on prod.
alter table public.party_quests
  add column if not exists reward_type text    not null default 'item',
  add column if not exists reward_qty  integer not null default 1;

-- 4. Align party_vault_items.slots default with prod (was 1 in migration, 0 on live).
alter table public.party_vault_items alter column slots set default 0;

-- 5. Re-apply the client events revoke. 20260620000043 was edited after it had
--    already been applied to prod, so `db push` will never re-run it and the revoke
--    never reached live. This forward statement closes that second barrier.
--    (No-op from scratch — 20260620000043 already revoked it.)
revoke select on table public.events from anon, authenticated;
