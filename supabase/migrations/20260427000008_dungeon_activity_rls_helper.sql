-- dungeon_activity is created in the next migration and its policies call this
-- helper.  Keep the helper ahead of that table so a fresh database can replay
-- the migration history successfully.  The later dungeon RLS migration replaces
-- this with the same implementation after the rest of the helpers are installed.
create or replace function public.is_dungeon_member(p_dungeon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dungeons d
    join public.sessions s on s.id = d.session_id
    where d.id = p_dungeon_id
      and (
        s.owner_id = auth.uid()
        or exists (
          select 1
          from public.session_members sm
          where sm.session_id = d.session_id
            and sm.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.is_dungeon_member(uuid) from public;
grant execute on function public.is_dungeon_member(uuid) to authenticated;
