-- issue #46: shared crawling-round counter with an automated encounter check.
-- lives on sessions so it rides the existing session realtime UPDATE path.
-- crawl_check_every = 0 turns the automatic check off.

alter table public.sessions
  add column if not exists crawl_round int not null default 0,
  add column if not exists crawl_check_every int not null default 3;
