-- issue #45: per-source synced light timers (torch / lantern / light spell).
-- server holds the anchor state (elapsed + started_at), clients interpolate
-- locally, same algebra as the session torch. rounds mode ticks down when the
-- crawling round tracker advances instead of by wall clock.

create table public.light_sources (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references public.sessions(id) on delete cascade,
  created_by            uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  kind                  text not null default 'torch',
  mode                  text not null default 'real_time',
  duration_ms           bigint not null default 3600000,
  elapsed_ms            bigint not null default 0,
  running               boolean not null default false,
  started_at            timestamptz,
  duration_rounds       int not null default 10,
  rounds_elapsed        int not null default 0,
  expired               boolean not null default false,
  attached_character_id uuid references public.characters(id) on delete set null,
  attached_q            int,
  attached_r            int,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint light_sources_kind_check check (kind in ('torch', 'lantern', 'light_spell', 'custom')),
  constraint light_sources_mode_check check (mode in ('real_time', 'rounds')),
  constraint light_sources_duration_check check (duration_ms > 0 and duration_rounds > 0)
);

create index light_sources_session_idx on public.light_sources(session_id, created_at);

alter table public.light_sources enable row level security;

-- member select only, writes go through the api (service role)
create policy "light_sources_select" on public.light_sources
  as permissive for select to authenticated
  using (public.is_session_member(session_id));

alter table public.light_sources replica identity full;
alter publication supabase_realtime add table public.light_sources;
