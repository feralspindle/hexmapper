create or replace function notify_hexmap_event()
returns trigger
language plpgsql
as $$
begin
  perform pg_notify('hexmap_events', new.id::text);
  return new;
end;
$$;

drop trigger if exists events_notify_realtime on events;
create trigger events_notify_realtime
after insert on events
for each row execute function notify_hexmap_event();
