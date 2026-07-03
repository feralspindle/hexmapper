insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'oracle_table',
       ot.id,
       ot.session_id,
       1,
       'oracle_table.created',
       jsonb_build_object(
         'name', ot.name,
         'description', ot.description,
         'mode', ot.mode
       ),
       jsonb_build_object('user_id', ot.created_by, 'genesis', true),
       ot.created_at
from oracle_tables ot
where not exists (
  select 1 from events e
  where e.aggregate_type = 'oracle_table'
    and e.aggregate_id = ot.id
);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'oracle_table_row',
       otr.id,
       ot.session_id,
       1,
       'oracle_table_row.created',
       jsonb_build_object(
         'table_id', otr.table_id,
         'weight', otr.weight,
         'range_min', otr.range_min,
         'range_max', otr.range_max,
         'result', otr.result,
         'notes', otr.notes,
         'position', otr.position
       ),
       jsonb_build_object('user_id', ot.created_by, 'genesis', true),
       otr.created_at
from oracle_table_rows otr
join oracle_tables ot on ot.id = otr.table_id
where not exists (
  select 1 from events e
  where e.aggregate_type = 'oracle_table_row'
    and e.aggregate_id = otr.id
);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'oracle_roll',
       orl.id,
       orl.session_id,
       1,
       'oracle.rolled',
       jsonb_build_object(
         'kind', orl.kind,
         'question', orl.question,
         'table_id', orl.table_id,
         'table_name', orl.table_name,
         'result', orl.result
       ),
       jsonb_build_object('user_id', orl.user_id, 'display_name', orl.display_name, 'genesis', true),
       orl.created_at
from oracle_rolls orl
where not exists (
  select 1 from events e
  where e.aggregate_type = 'oracle_roll'
    and e.aggregate_id = orl.id
);
