alter table dungeons
  add column if not exists fog_mode         boolean not null default false,
  add column if not exists fog_reveal_all   boolean not null default false,
  add column if not exists map_offset_locked boolean not null default false;
