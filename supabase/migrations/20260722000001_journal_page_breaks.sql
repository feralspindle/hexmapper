-- journal pages: a page_break entry marks where one page ends and the next
-- begins. no new table, breaks live in the same chronological stream.

alter table public.journal_entries
  drop constraint journal_entries_kind_check;

alter table public.journal_entries
  add constraint journal_entries_kind_check check (kind in ('prose', 'pin', 'page_break'));
