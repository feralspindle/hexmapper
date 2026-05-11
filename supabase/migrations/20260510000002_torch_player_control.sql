-- Allow any session member (not just the GM) to control torch timers.

create or replace function torch_start(p_dungeon_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from dungeons d
    join sessions s on s.id = d.session_id
    where d.id = p_dungeon_id
      and (
        s.owner_id = auth.uid()
        or exists (select 1 from session_members where session_id = s.id and user_id = auth.uid())
      )
  ) then
    raise exception 'not authorized';
  end if;

  update dungeons
  set torch_running    = true,
      torch_started_at = now()
  where id = p_dungeon_id;
end $$;

create or replace function torch_pause(p_dungeon_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from dungeons d
    join sessions s on s.id = d.session_id
    where d.id = p_dungeon_id
      and (
        s.owner_id = auth.uid()
        or exists (select 1 from session_members where session_id = s.id and user_id = auth.uid())
      )
  ) then
    raise exception 'not authorized';
  end if;

  update dungeons
  set torch_elapsed_ms = least(
        3600000,
        torch_elapsed_ms + (extract(epoch from (now() - torch_started_at)) * 1000)::bigint
      ),
      torch_running    = false,
      torch_started_at = null
  where id = p_dungeon_id
    and torch_running = true
    and torch_started_at is not null;
end $$;

create or replace function torch_reset(p_dungeon_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from dungeons d
    join sessions s on s.id = d.session_id
    where d.id = p_dungeon_id
      and (
        s.owner_id = auth.uid()
        or exists (select 1 from session_members where session_id = s.id and user_id = auth.uid())
      )
  ) then
    raise exception 'not authorized';
  end if;

  update dungeons
  set torch_elapsed_ms = 0,
      torch_started_at = case when torch_running then now() else null end
  where id = p_dungeon_id;
end $$;

create or replace function session_torch_start(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from sessions where id = p_session_id and owner_id = auth.uid()
    union all
    select 1 from session_members where session_id = p_session_id and user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update sessions
  set torch_running    = true,
      torch_started_at = now()
  where id = p_session_id;
end $$;

create or replace function session_torch_pause(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from sessions where id = p_session_id and owner_id = auth.uid()
    union all
    select 1 from session_members where session_id = p_session_id and user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update sessions
  set torch_elapsed_ms = least(
        3600000,
        torch_elapsed_ms + (extract(epoch from (now() - torch_started_at)) * 1000)::bigint
      ),
      torch_running    = false,
      torch_started_at = null
  where id = p_session_id
    and torch_running = true
    and torch_started_at is not null;
end $$;

create or replace function session_torch_reset(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from sessions where id = p_session_id and owner_id = auth.uid()
    union all
    select 1 from session_members where session_id = p_session_id and user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update sessions
  set torch_elapsed_ms = 0,
      torch_started_at = case when torch_running then now() else null end
  where id = p_session_id;
end $$;
