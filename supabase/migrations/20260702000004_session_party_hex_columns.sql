-- Add party hex location to the sessions table so all players stay in sync.
-- (Renamed from a malformed, hand-run migration into the tracked history.)

alter table sessions add column if not exists party_hex_q integer;
alter table sessions add column if not exists party_hex_r integer;

create index if not exists sessions_party_hex_idx on sessions(party_hex_q, party_hex_r);

-- Enable Realtime without failing fresh replays where an earlier migration has
-- already added sessions to the publication.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
end
$$;
