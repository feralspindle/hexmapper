-- oracle tables belong to their creator now instead of a session, so a solo
-- player's table library follows them from game to game. rolls are still
-- session history: what you rolled belongs to the game it happened in.

drop policy if exists "oracle_tables_select_member" on public.oracle_tables;
drop policy if exists "oracle_table_rows_select_member" on public.oracle_table_rows;

drop index if exists public.oracle_tables_session_idx;
alter table public.oracle_tables drop column if exists session_id;

create index if not exists oracle_tables_owner_idx
  on public.oracle_tables(created_by, updated_at desc);

create policy "oracle_tables_select_owner" on public.oracle_tables
  for select to authenticated
  using (auth.uid() = created_by);

create policy "oracle_table_rows_select_owner" on public.oracle_table_rows
  for select to authenticated
  using (
    exists (
      select 1 from public.oracle_tables ot
      where ot.id = oracle_table_rows.table_id
        and ot.created_by = auth.uid()
    )
  );
