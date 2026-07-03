ALTER TABLE public.characters REPLICA IDENTITY FULL;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'characters'
  ) then
    ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;
  end if;
end $$;
