-- siege weapons: shared party resources with damage notation (exploding dice
-- supported via the engine), ammo, hp, and crew. event-sourced like the vault:
-- the Rust API is the only writer, clients read through RLS + realtime.

create table if not exists siege_weapons (
  id               uuid        primary key default gen_random_uuid(),
  session_id       uuid        not null references sessions(id) on delete cascade,
  name             text        not null,
  damage_notation  text        not null,
  attack_bonus     integer     not null default 0,
  ammo             integer,
  max_ammo         integer,
  hp               integer     not null default 10,
  max_hp           integer     not null default 10,
  crew_required    integer     not null default 1,
  crewed_by        uuid[]      not null default '{}',
  is_loaded        boolean     not null default true,
  notes            text        not null default '',
  sort_order       integer     not null default 0,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists siege_weapons_session_idx on siege_weapons(session_id, sort_order);

create trigger touch_siege_weapons before update on siege_weapons
  for each row execute function public.touch_updated_at();

alter table siege_weapons enable row level security;

drop policy if exists "siege_weapons_member_select" on siege_weapons;
create policy "siege_weapons_member_select" on siege_weapons
  as permissive for select to authenticated
  using (is_session_member(session_id));

-- event-sourced table: the Rust API is the only writer (matches 20260620000040)
drop policy if exists es_lock_no_insert on siege_weapons;
drop policy if exists es_lock_no_update on siege_weapons;
drop policy if exists es_lock_no_delete on siege_weapons;
create policy es_lock_no_insert on siege_weapons as restrictive for insert to authenticated, anon with check (false);
create policy es_lock_no_update on siege_weapons as restrictive for update to authenticated, anon using (false);
create policy es_lock_no_delete on siege_weapons as restrictive for delete to authenticated, anon using (false);

alter table siege_weapons replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'siege_weapons'
  ) then
    alter publication supabase_realtime add table siege_weapons;
  end if;
end $$;
