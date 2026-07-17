-- characters_update_member let any session member update any other member's
-- character row. Direct client writes are already blocked by the es_lock
-- restrictive policies, but the permissive policy documented (and, if the
-- lock were ever rolled back, granted) broader access than intended: sheet
-- writes are owner or GM only. Member-level party operations (coin splits)
-- go through the API's narrow adjust-currency endpoint instead.

drop policy if exists "characters_update_member" on characters;
drop policy if exists "characters_update_gm" on characters;

create policy "characters_update_gm" on characters
  as permissive for update to authenticated
  using (
    session_id is not null
    and is_session_gm(session_id::uuid)
  )
  with check (
    session_id is not null
    and is_session_gm(session_id::uuid)
  );
