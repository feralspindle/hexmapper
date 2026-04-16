-- Reference photos library
create table if not exists reference_photos (
  id           uuid primary key default gen_random_uuid(),
  session_id   text not null,
  user_id      uuid references auth.users(id),
  name         text not null default '',
  storage_path text not null,
  created_at   timestamptz default now()
);

alter table reference_photos enable row level security;

do $$ begin
  create policy "anyone can view reference photos"
    on reference_photos for select using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "owner can insert reference photos"
    on reference_photos for insert with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "owner can delete reference photos"
    on reference_photos for delete using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- Photo broadcast events (realtime trigger for all clients)
create table if not exists photo_broadcasts (
  id         uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id    uuid references auth.users(id),
  photo_id   uuid references reference_photos(id) on delete set null,
  photo_url  text not null,
  photo_name text not null default '',
  created_at timestamptz default now()
);

alter table photo_broadcasts enable row level security;

do $$ begin
  create policy "anyone can view photo broadcasts"
    on photo_broadcasts for select using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated users can broadcast photos"
    on photo_broadcasts for insert with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- Enable realtime for broadcast events
alter publication supabase_realtime add table photo_broadcasts;
