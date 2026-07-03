alter table public.sessions
  add column if not exists play_mode text not null default 'gm';

alter table public.sessions
  drop constraint if exists sessions_play_mode_check;

alter table public.sessions
  add constraint sessions_play_mode_check
  check (play_mode in ('gm', 'gm_less'));

create table if not exists public.oracle_tables (
  id          uuid        primary key default gen_random_uuid(),
  session_id  uuid        not null references public.sessions(id) on delete cascade,
  created_by  uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  description text        not null default '',
  mode        text        not null default 'weighted',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint oracle_tables_mode_check check (mode in ('weighted', 'range'))
);

create table if not exists public.oracle_table_rows (
  id          uuid        primary key default gen_random_uuid(),
  table_id    uuid        not null references public.oracle_tables(id) on delete cascade,
  weight      integer     not null default 1,
  range_min   integer,
  range_max   integer,
  result      text        not null,
  notes       text        not null default '',
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint oracle_table_rows_weight_check check (weight > 0),
  constraint oracle_table_rows_range_check check (
    (range_min is null and range_max is null)
    or (range_min is not null and range_max is not null and range_min <= range_max)
  )
);

create table if not exists public.oracle_rolls (
  id           uuid        primary key default gen_random_uuid(),
  session_id   uuid        not null references public.sessions(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  display_name text        not null default '',
  kind         text        not null,
  question     text,
  table_id     uuid        references public.oracle_tables(id) on delete set null,
  table_name   text,
  result       jsonb       not null,
  created_at   timestamptz not null default now(),
  constraint oracle_rolls_kind_check check (kind in ('yes_no', 'event_prompt', 'table'))
);

create index if not exists oracle_tables_session_idx on public.oracle_tables(session_id, updated_at desc);
create index if not exists oracle_table_rows_table_idx on public.oracle_table_rows(table_id, position, created_at);
create index if not exists oracle_rolls_session_idx on public.oracle_rolls(session_id, created_at desc);

alter table public.oracle_tables enable row level security;
alter table public.oracle_table_rows enable row level security;
alter table public.oracle_rolls enable row level security;

drop policy if exists "oracle_tables_select_member" on public.oracle_tables;
create policy "oracle_tables_select_member" on public.oracle_tables
  for select to authenticated
  using (public.is_session_member(session_id));

drop policy if exists "oracle_table_rows_select_member" on public.oracle_table_rows;
create policy "oracle_table_rows_select_member" on public.oracle_table_rows
  for select to authenticated
  using (
    exists (
      select 1 from public.oracle_tables ot
      where ot.id = oracle_table_rows.table_id
        and public.is_session_member(ot.session_id)
    )
  );

drop policy if exists "oracle_rolls_select_member" on public.oracle_rolls;
create policy "oracle_rolls_select_member" on public.oracle_rolls
  for select to authenticated
  using (public.is_session_member(session_id));

alter table public.oracle_tables replica identity full;
alter table public.oracle_table_rows replica identity full;
alter table public.oracle_rolls replica identity full;

do $$
declare
  t text;
begin
  foreach t in array array['oracle_tables', 'oracle_table_rows', 'oracle_rolls']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
