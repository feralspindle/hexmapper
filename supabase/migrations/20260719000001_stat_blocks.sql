-- gm_less sessions: the owner runs real PCs alongside a cast of NPCs and
-- monsters. stat_blocks keeps that cast separate from characters so player
-- sheets and monster stat blocks never mix.

create table public.stat_blocks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'monster',
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stat_blocks_kind_check check (kind in ('npc', 'monster'))
);

create index stat_blocks_session_idx on public.stat_blocks(session_id, created_at);

alter table public.stat_blocks enable row level security;

-- member select only, writes go through the api (service role)
create policy "stat_blocks_select" on public.stat_blocks
  as permissive for select to authenticated
  using (public.is_session_member(session_id));

create trigger touch_stat_blocks before update on public.stat_blocks
  for each row execute function public.touch_updated_at();

alter table public.stat_blocks replica identity full;
alter publication supabase_realtime add table public.stat_blocks;
