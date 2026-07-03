create table if not exists party_quests (
  id            uuid        primary key default gen_random_uuid(),
  session_id    uuid        not null references sessions(id) on delete cascade,
  title         text        not null default '',
  description   text        not null default '',
  goals         jsonb       not null default '[]',
  reward        text        not null default '',
  completed     boolean     not null default false,
  added_by_name text        not null default '',
  is_gm_added   boolean     not null default false,
  display_order integer     not null default 0,
  source_client text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists party_quests_session_idx on party_quests(session_id);

alter table party_quests enable row level security;
drop policy if exists "party_quests_member_select" on party_quests;

create policy "party_quests_member_select" on party_quests
  as permissive for select to authenticated
  using (is_session_member(session_id));
drop policy if exists "party_quests_member_write" on party_quests;

create policy "party_quests_member_write" on party_quests
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
      and tablename = 'party_quests'
  ) then
    alter publication supabase_realtime add table party_quests;
  end if;
end $$;

create table if not exists party_session_notes (
  id             uuid        primary key default gen_random_uuid(),
  session_id     uuid        not null references sessions(id) on delete cascade,
  title          text        not null default '',
  content        text        not null default '',
  author_name    text        not null default '',
  author_user_id text,
  is_gm_author   boolean     not null default false,
  source_client  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists party_session_notes_session_idx on party_session_notes(session_id);

alter table party_session_notes enable row level security;
drop policy if exists "party_session_notes_member_select" on party_session_notes;

create policy "party_session_notes_member_select" on party_session_notes
  as permissive for select to authenticated
  using (is_session_member(session_id));
drop policy if exists "party_session_notes_member_write" on party_session_notes;

create policy "party_session_notes_member_write" on party_session_notes
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
      and tablename = 'party_session_notes'
  ) then
    alter publication supabase_realtime add table party_session_notes;
  end if;
end $$;
