create table if not exists party_calendar_settings (
  id             uuid        primary key default gen_random_uuid(),
  session_id     uuid        not null unique references sessions(id) on delete cascade,
  month_names    jsonb       not null default '["January","February","March","April","May","June","July","August","September","October","November","December"]'::jsonb,
  days_per_month jsonb       not null default '[31,28,31,30,31,30,31,31,30,31,30,31]'::jsonb,
  weekday_names  jsonb       not null default '["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]'::jsonb,
  epoch_weekday  integer     not null default 1,
  year_prefix    text        not null default '',
  year_suffix    text        not null default '',
  current_year   integer     not null default 1,
  current_month  integer     not null default 1,
  current_day    integer     not null default 1,
  updated_at     timestamptz not null default now()
);

alter table party_calendar_settings enable row level security;
drop policy if exists "calendar_settings_member_select" on party_calendar_settings;

create policy "calendar_settings_member_select" on party_calendar_settings
  as permissive for select to authenticated
  using (is_session_member(session_id));
drop policy if exists "calendar_settings_gm_write" on party_calendar_settings;

create policy "calendar_settings_gm_write" on party_calendar_settings
  as permissive for all to authenticated
  using  (is_session_gm(session_id))
  with check (is_session_gm(session_id));

create table if not exists party_calendar_days (
  id         uuid        primary key default gen_random_uuid(),
  session_id uuid        not null references sessions(id) on delete cascade,
  year       integer     not null,
  month      integer     not null,
  day        integer     not null,
  weather    text,
  notes      text        not null default '',
  updated_at timestamptz not null default now(),
  unique (session_id, year, month, day)
);

alter table party_calendar_days enable row level security;
drop policy if exists "calendar_days_member_select" on party_calendar_days;

create policy "calendar_days_member_select" on party_calendar_days
  as permissive for select to authenticated
  using (is_session_member(session_id));
drop policy if exists "calendar_days_member_write" on party_calendar_days;

create policy "calendar_days_member_write" on party_calendar_days
  as permissive for all to authenticated
  using  (is_session_member(session_id))
  with check (is_session_member(session_id));

alter table party_calendar_settings replica identity full;
alter table party_calendar_days     replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'party_calendar_settings') then
    alter publication supabase_realtime add table party_calendar_settings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'party_calendar_days') then
    alter publication supabase_realtime add table party_calendar_days;
  end if;
end $$;
