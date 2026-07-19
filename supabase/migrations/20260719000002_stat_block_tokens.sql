-- monster tokens on the dungeon grid: a dungeon token now links to a character
-- or a stat block, exactly one of the two. same one-token-per-subject-per-
-- dungeon rule as characters - "3 goblins" is three duplicated stat blocks,
-- each with its own hp pool and token.

alter table public.stat_blocks
  add constraint stat_blocks_id_session_id_key unique (id, session_id);

alter table public.dungeon_tokens
  alter column character_id drop not null;

alter table public.dungeon_tokens
  add column stat_block_id uuid references public.stat_blocks(id) on delete cascade;

-- same tenancy proof the character link carries: a token cannot stitch
-- together a dungeon and a stat block from different sessions
alter table public.dungeon_tokens
  add constraint dungeon_tokens_statblock_session_fkey
  foreign key (stat_block_id, session_id)
  references public.stat_blocks(id, session_id) on delete cascade;

alter table public.dungeon_tokens
  add constraint dungeon_tokens_one_subject_check
  check (num_nonnulls(character_id, stat_block_id) = 1);

create unique index dungeon_tokens_dungeon_statblock_key
  on public.dungeon_tokens (dungeon_id, stat_block_id)
  where stat_block_id is not null;
