-- Allow all session members to see all characters in their shared session.
-- The previous policy gated visibility on active_char_visible_to_me(), which
-- only passed when a character was explicitly set as someone's active_character_id.
-- This caused Supabase Realtime to silently drop postgres_changes UPDATE events
-- for any subscriber who failed the RLS check — making the party panel non-realtime.
drop policy if exists "characters_select" on characters;

create policy "characters_select" on characters
  as permissive for select to authenticated
  using (
    user_id = auth.uid()
    or (session_id is not null and is_session_member(session_id::uuid))
  );
