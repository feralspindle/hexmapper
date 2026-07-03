-- Map nesting and per-map party position columns used by the Rust map
-- projection and the current frontend map/hex stores.

alter table public.maps
  add column if not exists parent_map_id uuid references public.maps(id) on delete set null,
  add column if not exists parent_hex_id uuid references public.hex_cells(id) on delete set null,
  add column if not exists party_hex_q integer,
  add column if not exists party_hex_r integer;

create index if not exists maps_parent_map_id_idx
  on public.maps(parent_map_id);

create index if not exists maps_parent_hex_id_idx
  on public.maps(parent_hex_id);

create index if not exists maps_party_hex_idx
  on public.maps(party_hex_q, party_hex_r);
