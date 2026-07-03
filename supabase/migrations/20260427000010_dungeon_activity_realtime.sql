do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dungeon_activity'
  ) then
    alter publication supabase_realtime add table dungeon_activity;
  end if;
end $$;
