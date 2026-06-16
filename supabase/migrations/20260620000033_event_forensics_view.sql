-- Forensic view over the event log: flattens the metadata envelope into columns and
-- derives `actor_role` (gm = session owner, member = joined, else none) by joining
-- sessions/session_members. Deriving keeps it accurate retroactively (all existing
-- events too) without a 53-handler change, and session ownership is stable so it
-- matches what a write-time capture would record. Idempotent (create or replace).
--
-- security_invoker = on: the view enforces the *querying* role's RLS (not the
-- owner's), so it can't leak the whole event log through PostgREST. It's an
-- admin/forensic tool anyway, so we also revoke it from the API roles — only
-- service_role / a direct admin connection should read it.

create or replace view event_forensics with (security_invoker = on) as
select
    e.id,
    e.created_at,
    e.aggregate_type,
    e.aggregate_id,
    e.session_id,
    e.event_type,
    e.sequence,
    (e.metadata->>'user_id')::uuid              as user_id,
    e.metadata->>'display_name'                 as display_name,
    case
        when e.session_id is null then null
        when s.owner_id = (e.metadata->>'user_id')::uuid then 'gm'
        when exists (
            select 1 from session_members m
            where m.session_id = e.session_id
              and m.user_id = (e.metadata->>'user_id')::uuid
        ) then 'member'
        else 'none'
    end                                          as actor_role,
    e.metadata->>'intent'                        as intent,
    e.metadata->>'route'                         as route,
    e.metadata->>'client_id'                     as client_id,
    e.metadata->>'app_version'                   as app_version,
    e.metadata->>'request_id'                    as request_id,
    e.metadata->>'trace_id'                      as trace_id,
    (e.metadata->>'genesis')::boolean            as genesis,
    e.payload,
    e.metadata
from events e
left join sessions s on s.id = e.session_id;

-- Keep the forensic view off the end-user API surface (revoke the default grants
-- Supabase hands new public objects). Admin/service_role access is unaffected.
revoke all on public.event_forensics from anon, authenticated;
