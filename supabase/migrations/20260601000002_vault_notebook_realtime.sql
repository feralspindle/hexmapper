alter table public.party_vault_loot       replica identity full;
alter table public.party_vault_items      replica identity full;
alter table public.party_vault_containers replica identity full;
alter table public.party_bank_ledger      replica identity full;
alter table public.party_quests           replica identity full;
alter table public.party_session_notes    replica identity full;

do $$
declare
  t text;
  tables text[] := array[
    'party_vault_loot',
    'party_vault_items',
    'party_vault_containers',
    'party_bank_ledger',
    'party_quests',
    'party_session_notes'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
