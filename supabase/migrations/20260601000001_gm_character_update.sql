drop policy if exists "characters_update_member" on characters;
create policy "characters_update_member" on characters
  as permissive for update to authenticated
  using (
    session_id is not null
    and is_session_member(session_id::uuid)
  )
  with check (
    session_id is not null
    and is_session_member(session_id::uuid)
  );
