-- Allow session members to see each other's active characters.
-- Previously the policy only let the GM see characters with session_id = their
-- session, and players only see their own. That meant:
--   - a character with session_id = null (edge case) was invisible to the GM
--   - a character created moments before loadAll ran might not be in the array,
--     and an on-demand fetch by the party panel would be denied by RLS
-- The new clause: if you're in the same session as the person who selected the
-- character, you can read it.

create or replace function active_char_visible_to_me(p_char_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from session_members sm
    where sm.active_character_id = p_char_id
      and (
        exists (
          select 1 from session_members sm2
          where sm2.session_id = sm.session_id
            and sm2.user_id = auth.uid()
        )
        or exists (
          select 1 from sessions s
          where s.id = sm.session_id
            and s.owner_id = auth.uid()
        )
      )
  );
end $$;

drop policy if exists "characters_select" on characters;
create policy "characters_select" on characters
  as permissive for select to authenticated
  using (
    user_id = auth.uid()
    or (session_id is not null and is_session_gm(session_id::uuid))
    or active_char_visible_to_me(id)
  );
