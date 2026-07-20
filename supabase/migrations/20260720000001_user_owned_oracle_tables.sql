-- oracle tables belong to their creator now instead of a session, so a solo
-- player's table library follows them from game to game. a session uses a
-- table only when its owner adds it to that session (session_oracle_tables),
-- which is also what makes it visible to the other players in co-op. rolls
-- are still session history: what you rolled belongs to the game it happened
-- in.

drop policy if exists "oracle_tables_select_member" on public.oracle_tables;
drop policy if exists "oracle_table_rows_select_member" on public.oracle_table_rows;

drop index if exists public.oracle_tables_session_idx;
alter table public.oracle_tables drop column if exists session_id;

create index if not exists oracle_tables_owner_idx
  on public.oracle_tables(created_by, updated_at desc);

create table if not exists public.session_oracle_tables (
  id         uuid        primary key default gen_random_uuid(),
  session_id uuid        not null references public.sessions(id) on delete cascade,
  table_id   uuid        not null references public.oracle_tables(id) on delete cascade,
  added_by   uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, table_id)
);

create index if not exists session_oracle_tables_table_idx
  on public.session_oracle_tables(table_id);

alter table public.session_oracle_tables enable row level security;

create policy "session_oracle_tables_select_member" on public.session_oracle_tables
  for select to authenticated
  using (public.is_session_member(session_id));

create policy "oracle_tables_select_owner_or_shared" on public.oracle_tables
  for select to authenticated
  using (
    auth.uid() = created_by
    or exists (
      select 1 from public.session_oracle_tables sot
      where sot.table_id = oracle_tables.id
        and public.is_session_member(sot.session_id)
    )
  );

create policy "oracle_table_rows_select_owner_or_shared" on public.oracle_table_rows
  for select to authenticated
  using (
    exists (
      select 1 from public.oracle_tables ot
      where ot.id = oracle_table_rows.table_id
        and (
          ot.created_by = auth.uid()
          or exists (
            select 1 from public.session_oracle_tables sot
            where sot.table_id = ot.id
              and public.is_session_member(sot.session_id)
          )
        )
    )
  );

alter table public.session_oracle_tables replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_oracle_tables'
  ) then
    execute 'alter publication supabase_realtime add table public.session_oracle_tables';
  end if;
end $$;
