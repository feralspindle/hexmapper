-- GM initiative belongs to the campaign session, not to a dungeon or character.
-- Preserve the most recently updated dungeon value during the scope correction.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sessions'
      and column_name = 'gm_initiative'
  ) then
    alter table public.sessions add column gm_initiative integer;

    with latest_dungeon as (
      select distinct on (session_id)
        session_id,
        gm_initiative
      from public.dungeons
      order by session_id, updated_at desc, id
    ),
    updated as (
      update public.sessions s
      set gm_initiative = d.gm_initiative,
          updated_at = now()
      from latest_dungeon d
      where s.id = d.session_id
        and s.gm_initiative is distinct from d.gm_initiative
      returning s.*
    )
    insert into public.events (
      aggregate_type,
      aggregate_id,
      session_id,
      sequence,
      event_type,
      payload,
      metadata
    )
    select
      'session',
      u.id,
      u.id,
      coalesce((
        select max(e.sequence)
        from public.events e
        where e.aggregate_type = 'session'
          and e.aggregate_id = u.id
      ), 0) + 1,
      'session.updated',
      to_jsonb(u),
      jsonb_build_object('migration', 'session_gm_initiative')
    from updated u;
  end if;
end
$$;
