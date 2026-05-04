-- hex_cells_player_select had `revealed = true` in its USING clause. Supabase
-- Realtime only delivers an event to a subscriber if they have SELECT access to
-- the row in its new state (INSERT/UPDATE) or old state (DELETE). A player who
-- couldn't SELECT a hidden cell (revealed=false) would never receive the UPDATE
-- event when the GM reveals it, so fog-of-war changes were silent on the player
-- side. The same pattern was fixed for session_members in migration 00005.
--
-- Fix: allow players to SELECT all cells in their session. The application
-- already filters unrevealed cells client-side in handleRealtimeEvent, so the
-- visual fog-of-war behaviour is unchanged.

drop policy if exists "hex_cells_player_select" on hex_cells;

create policy "hex_cells_player_select" on hex_cells
  as permissive for select to authenticated
  using (is_session_member(session_id));
