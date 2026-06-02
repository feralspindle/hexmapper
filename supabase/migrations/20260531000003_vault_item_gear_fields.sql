alter table party_vault_items
  add column if not exists slots     integer not null default 1,
  add column if not exists item_type text    not null default 'sundry';
