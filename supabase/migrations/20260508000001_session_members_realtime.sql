-- session_members had REPLICA IDENTITY FULL and correct RLS policies set in
-- 20260429000005, but was never added to the realtime publication. Subscriptions
-- in characterStore._subscribeRealtime() were silent no-ops, breaking party
-- panel updates for all clients.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_members'
  ) then
    alter publication supabase_realtime add table public.session_members;
  end if;
end $$;
