-- Migration: Add party hex location to sessions table
-- Run this in the Supabase SQL Editor for your project.
-- This adds columns to store the party's current location so all players can sync.

alter table sessions add column if not exists party_hex_q integer;
alter table sessions add column if not exists party_hex_r integer;

create index if not exists sessions_party_hex_idx on sessions(party_hex_q, party_hex_r);

-- Enable Realtime for sessions table (if not already added)
-- In Supabase Dashboard → Database → Replication, add this table
-- to the supabase_realtime publication. Or run:
alter publication supabase_realtime add table sessions;
