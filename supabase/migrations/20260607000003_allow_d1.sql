create or replace function roll_dice(
  p_session_id   uuid,
  p_pending      jsonb,
  p_modifier     int  default 0,
  p_label        text default null,
  p_character_id uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_allowed_dice text[]  := array['d1','d4','d6','d8','d10','d12','d20','d100'];
  v_die          text;
  v_sides        int;
  v_count        int;
  v_i            int;
  v_value        int;
  v_results      jsonb   := '[]'::jsonb;
  v_total        int     := coalesce(p_modifier, 0);
  v_total_dice   int     := 0;
  v_row          dice_rolls;
begin
  if not is_session_member(p_session_id) then
    raise exception 'not a session member';
  end if;

  if p_character_id is not null
    and not exists (
      select 1 from characters
      where id = p_character_id and user_id = auth.uid()
    )
  then
    raise exception 'character does not belong to caller';
  end if;

  for v_die, v_count in
    select key, value::int
    from jsonb_each_text(p_pending)
    where value::int > 0
  loop
    if v_die != all(v_allowed_dice) then
      raise exception 'invalid die type: %', v_die;
    end if;
    if v_count > 20 then
      raise exception 'max 20 of any one die type (got % %)', v_count, v_die;
    end if;

    v_total_dice := v_total_dice + v_count;
    if v_total_dice > 40 then
      raise exception 'max 40 total dice per roll';
    end if;

    v_sides := substring(v_die from 2)::int;

    for v_i in 1..v_count loop
      v_value   := 1 + floor(random() * v_sides)::int;
      v_results := v_results || jsonb_build_array(jsonb_build_object('die', v_die, 'value', v_value));
      v_total   := v_total + v_value;
    end loop;
  end loop;

  if v_total_dice = 0 then
    raise exception 'no dice to roll';
  end if;

  insert into dice_rolls
    (session_id, user_id, display_name, character_id, pending, modifier, results, total, label)
  values
    (p_session_id, auth.uid(), '', p_character_id,
     p_pending, coalesce(p_modifier, 0), v_results, v_total, p_label)
  returning * into v_row;

  return to_jsonb(v_row);
end $$;
