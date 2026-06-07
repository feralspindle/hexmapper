-- When a dice roll is tied to a character, use the character's name as display_name.
--
-- IMPORTANT: fill_display_name() is shared across many tables (session_members,
-- chat_messages, etc.) and PL/pgSQL does not guarantee short-circuit evaluation
-- of AND conditions. Accessing NEW.character_id in the shared function would crash
-- on tables that don't have that column. Instead, we give dice_rolls its own
-- dedicated trigger function and leave fill_display_name() untouched.

create or replace function fill_dice_display_name()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_name      text;
  v_char_name text;
begin
  if new.character_id is not null then
    select data->>'name' into v_char_name
    from characters
    where id = new.character_id;
    if v_char_name is not null and v_char_name <> '' then
      new.display_name := v_char_name;
      return new;
    end if;
  end if;

  if new.user_id is null then
    new.display_name := coalesce(new.display_name, 'Adventurer');
    return new;
  end if;

  select coalesce(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'global_name',
    raw_user_meta_data->>'name',
    raw_user_meta_data->>'user_name',
    email,
    'Adventurer'
  ) into v_name
  from auth.users
  where id = new.user_id;

  new.display_name := coalesce(v_name, 'Adventurer');
  return new;
end $$;

drop trigger if exists trg_fill_display_name_dice on dice_rolls;

create trigger trg_fill_display_name_dice
  before insert on dice_rolls
  for each row execute function fill_dice_display_name();
