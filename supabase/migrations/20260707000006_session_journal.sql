-- issue #56: session journal. prose entries interleaved with pinned rolls
-- (oracle answers, dice, encounter results), chronological, stamped with the
-- in-game calendar date when one is set. writes go through the api (event
-- sourced), members read directly.

create table public.journal_entries (
  id             uuid        primary key default gen_random_uuid(),
  session_id     uuid        not null references public.sessions(id) on delete cascade,
  author_user_id uuid        not null references auth.users(id) on delete cascade,
  author_name    text        not null default '',
  kind           text        not null default 'prose',
  body           text        not null default '',
  pin            jsonb,
  game_date      jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint journal_entries_kind_check check (kind in ('prose', 'pin')),
  constraint journal_entries_body_length check (char_length(body) <= 8000)
);

create index journal_entries_session_idx on public.journal_entries(session_id, created_at);

alter table public.journal_entries enable row level security;

create policy "journal_entries_select" on public.journal_entries
  as permissive for select to authenticated
  using (public.is_session_member(session_id));

alter table public.journal_entries replica identity full;
alter publication supabase_realtime add table public.journal_entries;
