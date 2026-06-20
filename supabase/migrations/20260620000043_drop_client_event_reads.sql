-- Raw event payloads and forensic metadata are server-internal. They can contain
-- GM-only fields, so authenticated clients must consume the authorized projection
-- produced by the Rust WebSocket server instead of querying events via PostgREST.
--
-- This migration intentionally sorts after 00042, which temporarily restores a
-- restricted events_select policy for the legacy Supabase Realtime rollout path.

drop policy if exists "events_select" on public.events;

-- RLS without a SELECT policy already denies rows. Revoke the table grants as a
-- second barrier and to keep the event log off the client-facing API contract.
revoke select on table public.events from anon, authenticated;
