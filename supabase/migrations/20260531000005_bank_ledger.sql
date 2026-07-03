create table if not exists party_bank_ledger (
  id             uuid        primary key default gen_random_uuid(),
  session_id     uuid        not null references sessions(id) on delete cascade,
  description    text        not null default '',
  character_name text,
  display_name   text        not null default '',
  gold_change    integer     not null default 0,
  silver_change  integer     not null default 0,
  copper_change  integer     not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists party_bank_ledger_session_idx on party_bank_ledger(session_id);

alter table party_bank_ledger enable row level security;
drop policy if exists "party_bank_ledger_select" on party_bank_ledger;

create policy "party_bank_ledger_select" on party_bank_ledger
  as permissive for select to authenticated
  using (is_session_member(session_id));
drop policy if exists "party_bank_ledger_write" on party_bank_ledger;

create policy "party_bank_ledger_write" on party_bank_ledger
  as permissive for all to authenticated
  using (is_session_member(session_id))
  with check (is_session_member(session_id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'party_bank_ledger'
  ) then
    alter publication supabase_realtime add table party_bank_ledger;
  end if;
end $$;
