create table if not exists dungeon_activity (
  id           uuid        primary key default gen_random_uuid(),
  dungeon_id   uuid        not null references dungeons(id) on delete cascade,
  user_id      uuid,
  display_name text        not null default 'Someone',
  verb         text        not null,
  what         text        not null default '',
  created_at   timestamptz not null default now()
);

alter table dungeon_activity enable row level security;

create index if not exists dungeon_activity_dungeon_id_idx on dungeon_activity(dungeon_id, created_at desc);

create policy "dungeon_activity_member_select" on dungeon_activity
  as permissive for select to authenticated
  using (is_dungeon_member(dungeon_id));

create policy "dungeon_activity_member_insert" on dungeon_activity
  as permissive for insert to authenticated
  with check (
    is_dungeon_member(dungeon_id)
    and (user_id = auth.uid() or user_id is null)
  );
