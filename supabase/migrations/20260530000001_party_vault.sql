create table if not exists party_vault_loot (
  id            uuid        primary key default gen_random_uuid(),
  session_id    uuid        not null references sessions(id) on delete cascade,
  name          text        not null default '',
  quantity      integer     not null default 1,
  notes         text        not null default '',
  added_by_name text        not null default '',
  source_client text,
  created_at    timestamptz not null default now()
);

create index if not exists party_vault_loot_session_idx on party_vault_loot(session_id);

alter table party_vault_loot enable row level security;

create policy "party_vault_loot_member_select" on party_vault_loot
  as permissive for select to authenticated
  using (is_session_member(session_id));

create policy "party_vault_loot_member_write" on party_vault_loot
  as permissive for all to authenticated
  using (is_session_member(session_id))
  with check (is_session_member(session_id));

alter publication supabase_realtime add table party_vault_loot;

create table if not exists party_vault_items (
  id            uuid        primary key default gen_random_uuid(),
  session_id    uuid        not null references sessions(id) on delete cascade,
  container     text        not null default 'bank',
  name          text        not null default '',
  quantity      integer     not null default 1,
  notes         text        not null default '',
  added_by_name text        not null default '',
  source_client text,
  created_at    timestamptz not null default now()
);

create index if not exists party_vault_items_session_idx on party_vault_items(session_id);

alter table party_vault_items enable row level security;

create policy "party_vault_items_member_select" on party_vault_items
  as permissive for select to authenticated
  using (is_session_member(session_id));

create policy "party_vault_items_member_write" on party_vault_items
  as permissive for all to authenticated
  using (is_session_member(session_id))
  with check (is_session_member(session_id));

alter publication supabase_realtime add table party_vault_items;
