create table if not exists party_vault_containers (
  id            uuid        primary key default gen_random_uuid(),
  session_id    uuid        not null references sessions(id) on delete cascade,
  name          text        not null default 'Container',
  gear_slots    integer     not null default 10,
  source_client text,
  created_at    timestamptz not null default now()
);

create index if not exists party_vault_containers_session_idx on party_vault_containers(session_id);

alter table party_vault_containers enable row level security;

create policy "party_vault_containers_member_select" on party_vault_containers
  as permissive for select to authenticated
  using (is_session_member(session_id));

create policy "party_vault_containers_member_write" on party_vault_containers
  as permissive for all to authenticated
  using (is_session_member(session_id))
  with check (is_session_member(session_id));

alter publication supabase_realtime add table party_vault_containers;

alter table party_vault_items
  add column if not exists container_id uuid references party_vault_containers(id) on delete set null;
