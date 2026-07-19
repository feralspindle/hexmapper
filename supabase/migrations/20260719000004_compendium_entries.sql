-- session-scoped reference library: gear catalogs and spell lists pushed in
-- by external import tools (or, later, entered by hand). distinct from the
-- party vault, which is what the party actually owns - this is the book.

create table public.compendium_entries (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  name       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compendium_entries_kind_check check (kind in ('gear', 'spell')),
  -- re-imports upsert by (session, kind, name) instead of stacking duplicates
  constraint compendium_entries_session_kind_name_key unique (session_id, kind, name)
);

alter table public.compendium_entries enable row level security;

-- member select only, writes go through the api (service role)
create policy "compendium_entries_select" on public.compendium_entries
  as permissive for select to authenticated
  using (public.is_session_member(session_id));

create trigger touch_compendium_entries before update on public.compendium_entries
  for each row execute function public.touch_updated_at();

alter table public.compendium_entries replica identity full;
alter publication supabase_realtime add table public.compendium_entries;
