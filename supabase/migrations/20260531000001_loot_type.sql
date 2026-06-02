-- Loot type and currency for pending loot entries
alter table party_vault_loot
  add column if not exists loot_type text not null default 'item',
  add column if not exists currency  text;           -- 'gold' | 'silver' | 'copper', null for items

-- Structured multi-reward array on quests (replaces single reward text field)
alter table party_quests
  add column if not exists rewards jsonb not null default '[]';
