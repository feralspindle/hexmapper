-- Restore fill_display_name() to its original form.
-- The previous migration (20260607000001) replaced this shared function with a
-- version that accessed NEW.character_id, which crashes on tables that don't
-- have that column (session_members, chat_messages, etc.).
-- The character-name logic now lives in fill_dice_display_name() (dice_rolls only).

create or replace function fill_display_name()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_name text;
begin
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
