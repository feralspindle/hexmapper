alter table public.maps
  add column if not exists exploration_mode boolean not null default false;

alter table public.hex_cells
  add column if not exists explored boolean not null default true;

alter table public.oracle_tables
  add column if not exists tag text;

create index if not exists oracle_tables_session_tag_idx
  on public.oracle_tables(session_id, tag)
  where tag is not null;
