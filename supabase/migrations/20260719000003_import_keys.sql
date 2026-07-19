-- long-lived import keys for external tools (local rules assistants etc.)
-- pushing content into a solo session over the rest api. the raw key is shown
-- once at mint time and only its sha-256 lands here. not event-sourced - this
-- is auth infrastructure, not game state.

create table public.import_keys (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  created_by   uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  key_hash     text not null unique,
  key_prefix   text not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index import_keys_session_idx on public.import_keys(session_id);

alter table public.import_keys enable row level security;

-- session owner only, and even they never see key_hash preimages; mint,
-- list, and revoke all go through the api
create policy "import_keys_select" on public.import_keys
  as permissive for select to authenticated
  using (public.is_session_gm(session_id));
