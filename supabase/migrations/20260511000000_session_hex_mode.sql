alter table sessions
  add column if not exists hex_mode text not null default 'fow'
    check (hex_mode in ('fow', 'blank'));

create or replace function join_session(p_session_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_session sessions;
begin
  select * into v_session from sessions where id = p_session_id;
  if not found then
    raise exception 'session_not_found' using hint = 'No session with that ID exists.';
  end if;

  insert into session_members (session_id, user_id, last_seen_at)
  values (p_session_id, auth.uid(), now())
  on conflict (session_id, user_id) do update set last_seen_at = now();

  return json_build_object(
    'id',              v_session.id,
    'name',            v_session.name,
    'owner_id',        v_session.owner_id,
    'active_map_id',   v_session.active_map_id,
    'torch_running',   v_session.torch_running,
    'torch_elapsed_ms', v_session.torch_elapsed_ms,
    'torch_started_at', v_session.torch_started_at,
    'hex_mode',        v_session.hex_mode
  );
end $$;
