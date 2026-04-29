-- Allow any session member to see all members in their session.
-- The previous policy (user_id = auth.uid() OR is_session_gm) let each player
-- see only their own row, so Supabase Realtime would not deliver INSERT events
-- when a new player joined — breaking party-panel reactivity for non-GMs.
drop policy if exists "session_members_select" on session_members;
create policy "session_members_select" on session_members
  as permissive for select to authenticated
  using (is_session_member(session_id));

-- Full replica identity so DELETE events carry the complete old row, allowing
-- the party panel to remove a departed player without a separate fetch.
alter table session_members replica identity full;
