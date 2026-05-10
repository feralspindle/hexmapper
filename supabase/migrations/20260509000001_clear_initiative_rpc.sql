create or replace function clear_initiative(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from sessions where id = p_session_id and owner_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update characters
  set data = data - 'initiative'
  where session_id = p_session_id
    and data ? 'initiative';
end $$;
