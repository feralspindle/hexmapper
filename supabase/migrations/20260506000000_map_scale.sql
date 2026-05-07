alter table maps
  add column if not exists map_scale      numeric,
  add column if not exists map_scale_unit text not null default 'miles';
