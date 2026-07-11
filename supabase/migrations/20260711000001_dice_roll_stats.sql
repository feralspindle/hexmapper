-- dice_rolls carries the server-computed distribution stats (mean, std_dev,
-- percentile rank, above/average/below category) so clients read exact dice
-- math instead of rederiving it. the roll_dice handler already records stats
-- in the dice_roll.rolled event payload; this projects it into the read model.

alter table dice_rolls add column if not exists stats jsonb;

-- backfill from the event log where the payload already recorded stats.
-- nullif keeps rows with a json-null stats (engine failed for that notation)
-- as sql null rather than 'null'::jsonb
update dice_rolls dr
set stats = nullif(e.payload->'stats', 'null'::jsonb)
from events e
where e.aggregate_type = 'dice_roll'
  and e.event_type = 'dice_roll.rolled'
  and e.aggregate_id = dr.id
  and e.payload ? 'stats'
  and dr.stats is null;
