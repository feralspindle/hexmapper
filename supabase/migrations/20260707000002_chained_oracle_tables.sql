-- issue #47: a table row can chain to another oracle table. rolling the row
-- rolls through the referenced table (and so on) and records the whole chain
-- as one grouped result. on delete set null so deleting a table just ends the
-- chain instead of blocking the delete or orphaning rows.

alter table public.oracle_table_rows
  add column if not exists subtable_id uuid references public.oracle_tables(id) on delete set null;

create index if not exists oracle_table_rows_subtable_idx
  on public.oracle_table_rows(subtable_id)
  where subtable_id is not null;
