create table if not exists events (
  id              bigint generated always as identity primary key,
  event_id        uuid not null default gen_random_uuid(),
  aggregate_type  text not null,
  aggregate_id    uuid not null,
  session_id      uuid,
  sequence        bigint not null,
  event_type      text not null,
  payload         jsonb not null,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),

  unique (aggregate_type, aggregate_id, sequence)
);

create index if not exists events_aggregate_idx on events(aggregate_type, aggregate_id, sequence);
create index if not exists events_session_idx   on events(session_id, created_at);
create index if not exists events_type_idx      on events(event_type);

alter table events enable row level security;

-- Read-only for authenticated users, scoped to sessions they belong to (activity feed).
-- Only the service role (used by the Rust event-sourcing server) can write.
create policy "events_select" on events
  as permissive for select to authenticated
  using (session_id is null or is_session_member(session_id));
