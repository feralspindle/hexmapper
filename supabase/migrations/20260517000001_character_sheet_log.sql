create table if not exists character_sheet_log (
  id           uuid        primary key default gen_random_uuid(),
  session_id   uuid        not null references sessions(id) on delete cascade,
  user_id      uuid,
  display_name text        not null default 'Someone',
  what         text        not null default '',
  created_at   timestamptz not null default now()
);

alter table character_sheet_log enable row level security;

create index if not exists character_sheet_log_session_idx
  on character_sheet_log(session_id, created_at desc);
drop policy if exists "character_sheet_log_select" on character_sheet_log;

create policy "character_sheet_log_select" on character_sheet_log
  as permissive for select to authenticated
  using (is_session_member(session_id));
drop policy if exists "character_sheet_log_insert" on character_sheet_log;

create policy "character_sheet_log_insert" on character_sheet_log
  as permissive for insert to authenticated
  with check (
    is_session_member(session_id)
    and (user_id = auth.uid() or user_id is null)
  );
