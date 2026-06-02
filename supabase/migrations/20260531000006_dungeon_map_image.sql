alter table dungeons
  add column if not exists map_image_path      text,
  add column if not exists map_image_offset_x  integer not null default 0,
  add column if not exists map_image_offset_y  integer not null default 0,
  add column if not exists map_image_scale     float   not null default 1.0,
  add column if not exists map_image_rotation  integer not null default 0;
