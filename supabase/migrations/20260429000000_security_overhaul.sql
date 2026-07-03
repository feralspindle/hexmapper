-- =============================================================================
-- SECURITY OVERHAUL: Replace open "using (true)" policies with session-scoped
-- membership checks. The trust boundary is session_members; GM = sessions.owner_id.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- HELPER FUNCTIONS (security definer so they can bypass RLS on sessions /
-- session_members when called from inside other policies)
-- ---------------------------------------------------------------------------

create or replace function is_session_member(p_session_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from sessions where id = p_session_id and owner_id = auth.uid()
    union all
    select 1 from session_members where session_id = p_session_id and user_id = auth.uid()
  );
end $$;

create or replace function is_session_gm(p_session_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from sessions where id = p_session_id and owner_id = auth.uid()
  );
end $$;

-- ---------------------------------------------------------------------------
-- join_session RPC: allows a user to join a session by UUID without needing
-- SELECT on sessions (which is now restricted to existing members/owners).
-- The function is security definer so it can bypass RLS to verify the session
-- exists and insert the membership row.
-- ---------------------------------------------------------------------------

create or replace function join_session(p_session_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_session sessions;
begin
  select * into v_session from sessions where id = p_session_id;
  if not found then
    raise exception 'session_not_found' using hint = 'No session with that ID exists.';
  end if;

  insert into session_members (session_id, user_id, last_seen_at)
  values (p_session_id, auth.uid(), now())
  on conflict (session_id, user_id) do update set last_seen_at = now();

  return json_build_object(
    'id',            v_session.id,
    'name',          v_session.name,
    'owner_id',      v_session.owner_id,
    'active_map_id', v_session.active_map_id
  );
end $$;

-- ---------------------------------------------------------------------------
-- fill_display_name TRIGGER: populates display_name from auth.users metadata
-- instead of trusting the client-supplied value. Prevents impersonation.
-- ---------------------------------------------------------------------------

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

-- Apply trigger to all tables that accept a client-supplied display_name
drop trigger if exists trg_fill_display_name_chat      on chat_messages;
drop trigger if exists trg_fill_display_name_dice      on dice_rolls;
drop trigger if exists trg_fill_display_name_annot     on dice_roll_annotations;
drop trigger if exists trg_fill_display_name_hex_notes on hex_notes;
drop trigger if exists trg_fill_display_name_dun_notes on dungeon_element_notes;
drop trigger if exists trg_fill_display_name_bug       on bug_reports;
drop trigger if exists trg_fill_display_name_chat on chat_messages;

create trigger trg_fill_display_name_chat
  before insert on chat_messages
  for each row execute function fill_display_name();
drop trigger if exists trg_fill_display_name_dice on dice_rolls;

create trigger trg_fill_display_name_dice
  before insert on dice_rolls
  for each row execute function fill_display_name();
drop trigger if exists trg_fill_display_name_annot on dice_roll_annotations;

create trigger trg_fill_display_name_annot
  before insert on dice_roll_annotations
  for each row execute function fill_display_name();
drop trigger if exists trg_fill_display_name_hex_notes on hex_notes;

create trigger trg_fill_display_name_hex_notes
  before insert on hex_notes
  for each row execute function fill_display_name();
drop trigger if exists trg_fill_display_name_dun_notes on dungeon_element_notes;

create trigger trg_fill_display_name_dun_notes
  before insert on dungeon_element_notes
  for each row execute function fill_display_name();
drop trigger if exists trg_fill_display_name_bug on bug_reports;

create trigger trg_fill_display_name_bug
  before insert on bug_reports
  for each row execute function fill_display_name();

-- ---------------------------------------------------------------------------
-- Fix torch RPCs: add GM ownership check so any authenticated user cannot
-- start/pause/reset a torch on a dungeon they don't own.
-- ---------------------------------------------------------------------------

create or replace function torch_start(p_dungeon_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from dungeons d
    join sessions s on s.id = d.session_id
    where d.id = p_dungeon_id and s.owner_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update dungeons
  set torch_running    = true,
      torch_started_at = now()
  where id = p_dungeon_id;
end $$;

create or replace function torch_pause(p_dungeon_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from dungeons d
    join sessions s on s.id = d.session_id
    where d.id = p_dungeon_id and s.owner_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update dungeons
  set torch_elapsed_ms = least(
        3600000,
        torch_elapsed_ms + (extract(epoch from (now() - torch_started_at)) * 1000)::bigint
      ),
      torch_running    = false,
      torch_started_at = null
  where id = p_dungeon_id
    and torch_running = true
    and torch_started_at is not null;
end $$;

create or replace function torch_reset(p_dungeon_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from dungeons d
    join sessions s on s.id = d.session_id
    where d.id = p_dungeon_id and s.owner_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update dungeons
  set torch_elapsed_ms = 0,
      torch_started_at = case when torch_running then now() else null end
  where id = p_dungeon_id;
end $$;

-- ---------------------------------------------------------------------------
-- Revoke TRUNCATE from non-superuser roles (Supabase dashboard default grants
-- it, but neither anon nor authenticated should ever be able to truncate tables)
-- ---------------------------------------------------------------------------

do $$ declare
  t text;
begin
  for t in select unnest(array[
    'sessions','session_members','hex_cells','maps','map_drafts',
    'dungeons','dungeon_rooms','dungeon_corridors','dungeon_fog_cells',
    'dice_rolls','dice_roll_annotations','chat_messages','characters',
    'hex_notes','dungeon_element_notes','reference_photos','photo_broadcasts',
    'bug_reports'
  ]) loop
    -- Skip tables that haven't been created yet (e.g. dungeon_fog_cells)
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('revoke truncate on %I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- CHECK CONSTRAINTS: server-side length/size limits
-- ---------------------------------------------------------------------------

alter table chat_messages
  drop constraint if exists chat_body_length,
  add  constraint chat_body_length check (char_length(body) <= 2000);

alter table dice_roll_annotations
  drop constraint if exists annotation_body_length,
  add  constraint annotation_body_length check (char_length(body) <= 2000);

alter table bug_reports
  drop constraint if exists bug_description_length,
  add  constraint bug_description_length check (char_length(description) <= 4000);

alter table characters
  drop constraint if exists character_data_size,
  add  constraint character_data_size check (pg_column_size(data) < 65536);

-- active_character_id must belong to the session member who owns it.
-- CHECK constraints can't use subqueries in Postgres, so this is a trigger.
create or replace function check_active_char_belongs_to_user()
returns trigger language plpgsql as $$
begin
  if new.active_character_id is not null then
    if not exists (
      select 1 from characters
      where id = new.active_character_id
        and user_id = new.user_id
    ) then
      raise exception 'active_character_id must belong to the session member (user_id mismatch)';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_check_active_char on session_members;
create trigger trg_check_active_char
  before insert or update on session_members
  for each row execute function check_active_char_belongs_to_user();

-- =============================================================================
-- RLS POLICY OVERHAUL
-- Drop all existing policies that are open (using true) or role-incorrect,
-- then create properly scoped replacements.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------

drop policy if exists "sessions_select"      on sessions;
-- sessions_insert, sessions_update, sessions_delete are already correct — keep them
drop policy if exists "sessions_select" on sessions;

create policy "sessions_select" on sessions
  as permissive for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from session_members sm
      where sm.session_id = sessions.id and sm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- session_members: add DELETE policy (missing = players can never leave/be kicked)
-- Also allow GMs to select all members of their sessions (CharacterPicker needs this)
-- ---------------------------------------------------------------------------

drop policy if exists "session_members_select" on session_members;
drop policy if exists "session_members_delete" on session_members;

create policy "session_members_select" on session_members
  as permissive for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from sessions s
      where s.id = session_members.session_id and s.owner_id = auth.uid()
    )
  );

create policy "session_members_delete" on session_members
  as permissive for delete to authenticated
  using (
    -- self-leave OR GM kick
    user_id = auth.uid()
    or exists (
      select 1 from sessions s
      where s.id = session_members.session_id and s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- hex_cells: scope to session membership; players only see revealed cells
-- ---------------------------------------------------------------------------

drop policy if exists "hex_cells_auth" on hex_cells;

-- GMs see all cells in their sessions
drop policy if exists "hex_cells_gm_all" on hex_cells;
create policy "hex_cells_gm_all" on hex_cells
  as permissive for all to authenticated
  using  (is_session_gm(session_id))
  with check (is_session_gm(session_id));

-- Players see only revealed cells in sessions they belong to
drop policy if exists "hex_cells_player_select" on hex_cells;
create policy "hex_cells_player_select" on hex_cells
  as permissive for select to authenticated
  using (
    revealed = true
    and exists (
      select 1 from session_members sm
      where sm.session_id = hex_cells.session_id and sm.user_id = auth.uid()
    )
  );

-- Players can upsert markers on revealed cells (marker_color, marker_label)
drop policy if exists "hex_cells_player_marker" on hex_cells;
create policy "hex_cells_player_marker" on hex_cells
  as permissive for insert to authenticated
  with check (
    exists (
      select 1 from session_members sm
      where sm.session_id = hex_cells.session_id and sm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- maps: existing policies are largely correct; maps_select already does member
-- join. Only need to ensure SELECT uses is_session_member pattern.
-- maps_insert, maps_update, maps_delete are already GM-scoped — leave them.
-- ---------------------------------------------------------------------------

-- (no changes needed to maps policies)

-- ---------------------------------------------------------------------------
-- map_drafts: already GM-scoped but targets `public` role — change to authenticated
-- ---------------------------------------------------------------------------

drop policy if exists "session owner manages map drafts" on map_drafts;
drop policy if exists "map_drafts_gm" on map_drafts;

create policy "map_drafts_gm" on map_drafts
  as permissive for all to authenticated
  using  (is_session_gm(session_id))
  with check (is_session_gm(session_id));

-- ---------------------------------------------------------------------------
-- dungeons: replace open policy with member-read, GM-write
-- ---------------------------------------------------------------------------

drop policy if exists "dungeons_auth" on dungeons;
drop policy if exists "dungeons_member_select" on dungeons;

create policy "dungeons_member_select" on dungeons
  as permissive for select to authenticated
  using (is_session_member(session_id));
drop policy if exists "dungeons_gm_write" on dungeons;

create policy "dungeons_gm_write" on dungeons
  as permissive for all to authenticated
  using  (is_session_gm(session_id))
  with check (is_session_gm(session_id));

-- ---------------------------------------------------------------------------
-- dungeon_rooms: replace open policy with member-read, GM-write
-- ---------------------------------------------------------------------------

drop policy if exists "dungeon_rooms_auth" on dungeon_rooms;
drop policy if exists "dungeon_rooms_member_select" on dungeon_rooms;

create policy "dungeon_rooms_member_select" on dungeon_rooms
  as permissive for select to authenticated
  using (
    exists (
      select 1 from dungeons d where d.id = dungeon_rooms.dungeon_id and is_session_member(d.session_id)
    )
  );
drop policy if exists "dungeon_rooms_gm_write" on dungeon_rooms;

create policy "dungeon_rooms_gm_write" on dungeon_rooms
  as permissive for all to authenticated
  using (
    exists (
      select 1 from dungeons d where d.id = dungeon_rooms.dungeon_id and is_session_gm(d.session_id)
    )
  )
  with check (
    exists (
      select 1 from dungeons d where d.id = dungeon_rooms.dungeon_id and is_session_gm(d.session_id)
    )
  );

-- ---------------------------------------------------------------------------
-- dungeon_corridors: same as rooms
-- ---------------------------------------------------------------------------

drop policy if exists "dungeon_corridors_auth" on dungeon_corridors;
drop policy if exists "dungeon_corridors_member_select" on dungeon_corridors;

create policy "dungeon_corridors_member_select" on dungeon_corridors
  as permissive for select to authenticated
  using (
    exists (
      select 1 from dungeons d where d.id = dungeon_corridors.dungeon_id and is_session_member(d.session_id)
    )
  );
drop policy if exists "dungeon_corridors_gm_write" on dungeon_corridors;

create policy "dungeon_corridors_gm_write" on dungeon_corridors
  as permissive for all to authenticated
  using (
    exists (
      select 1 from dungeons d where d.id = dungeon_corridors.dungeon_id and is_session_gm(d.session_id)
    )
  )
  with check (
    exists (
      select 1 from dungeons d where d.id = dungeon_corridors.dungeon_id and is_session_gm(d.session_id)
    )
  );

-- dungeon_fog_cells policies are created in 20260429000003_dungeon_fog_cells.sql
-- which also creates the table itself.

-- ---------------------------------------------------------------------------
-- dice_rolls: scope SELECT to session members (was using (true) globally)
-- ---------------------------------------------------------------------------

drop policy if exists "dice_rolls_select" on dice_rolls;
drop policy if exists "dice_rolls_member_select" on dice_rolls;

create policy "dice_rolls_member_select" on dice_rolls
  as permissive for select to authenticated
  using (is_session_member(session_id));

-- dice_rolls_insert already checks user_id = auth.uid() — also add session check
drop policy if exists "dice_rolls_insert" on dice_rolls;

create policy "dice_rolls_insert" on dice_rolls
  as permissive for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_session_member(session_id)
  );

-- ---------------------------------------------------------------------------
-- dice_roll_annotations: change role from `public` to `authenticated`
-- ---------------------------------------------------------------------------

drop policy if exists "session members insert own annotations" on dice_roll_annotations;
drop policy if exists "session members read annotations"       on dice_roll_annotations;
drop policy if exists "dice_annot_member_select" on dice_roll_annotations;

create policy "dice_annot_member_select" on dice_roll_annotations
  as permissive for select to authenticated
  using (is_session_member(session_id));
drop policy if exists "dice_annot_member_insert" on dice_roll_annotations;

create policy "dice_annot_member_insert" on dice_roll_annotations
  as permissive for insert to authenticated
  with check (
    auth.uid() = user_id
    and is_session_member(session_id)
  );

-- ---------------------------------------------------------------------------
-- chat_messages: change role from `public` to `authenticated`
-- ---------------------------------------------------------------------------

drop policy if exists "session members read chat" on chat_messages;
drop policy if exists "session members send chat" on chat_messages;
drop policy if exists "chat_member_select" on chat_messages;

create policy "chat_member_select" on chat_messages
  as permissive for select to authenticated
  using (is_session_member(session_id));
drop policy if exists "chat_member_insert" on chat_messages;

create policy "chat_member_insert" on chat_messages
  as permissive for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_session_member(session_id)
  );

-- ---------------------------------------------------------------------------
-- characters: require session membership on insert (prevents cross-session injection)
-- ---------------------------------------------------------------------------

drop policy if exists "characters_select" on characters;
drop policy if exists "characters_insert" on characters;

-- Players see their own characters; GMs see all characters in their sessions
create policy "characters_select" on characters
  as permissive for select to authenticated
  using (
    user_id = auth.uid()
    or (
      session_id is not null
      and is_session_gm(session_id::uuid)
    )
  );

-- Insert requires user_id = self AND (no session OR is a member of that session)
create policy "characters_insert" on characters
  as permissive for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      session_id is null
      or is_session_member(session_id::uuid)
    )
  );

-- characters_update and characters_delete already check user_id = auth.uid() — keep them

-- ---------------------------------------------------------------------------
-- hex_notes: replace open SELECT with session-member scope
-- ---------------------------------------------------------------------------

drop policy if exists "hex_notes_select" on hex_notes;
drop policy if exists "hex_notes_insert" on hex_notes;
drop policy if exists "hex_notes_delete" on hex_notes;
drop policy if exists "hex_notes_update" on hex_notes;
drop policy if exists "hex_notes_member_select" on hex_notes;

create policy "hex_notes_member_select" on hex_notes
  as permissive for select to authenticated
  using (is_session_member(session_id));
drop policy if exists "hex_notes_member_insert" on hex_notes;

create policy "hex_notes_member_insert" on hex_notes
  as permissive for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_session_member(session_id)
  );
drop policy if exists "hex_notes_owner_update" on hex_notes;

create policy "hex_notes_owner_update" on hex_notes
  as permissive for update to authenticated
  using (
    user_id = auth.uid()
    or is_session_gm(session_id)
  );
drop policy if exists "hex_notes_owner_delete" on hex_notes;

create policy "hex_notes_owner_delete" on hex_notes
  as permissive for delete to authenticated
  using (
    user_id = auth.uid()
    or is_session_gm(session_id)
  );

-- ---------------------------------------------------------------------------
-- dungeon_element_notes: replace open SELECT with session-member scope
-- ---------------------------------------------------------------------------

drop policy if exists "dungeon_notes_select" on dungeon_element_notes;
drop policy if exists "dungeon_notes_insert" on dungeon_element_notes;
drop policy if exists "dungeon_notes_delete" on dungeon_element_notes;
drop policy if exists "dungeon_notes_update" on dungeon_element_notes;
drop policy if exists "dun_notes_member_select" on dungeon_element_notes;

create policy "dun_notes_member_select" on dungeon_element_notes
  as permissive for select to authenticated
  using (is_session_member(session_id));
drop policy if exists "dun_notes_member_insert" on dungeon_element_notes;

create policy "dun_notes_member_insert" on dungeon_element_notes
  as permissive for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_session_member(session_id)
  );
drop policy if exists "dun_notes_owner_update" on dungeon_element_notes;

create policy "dun_notes_owner_update" on dungeon_element_notes
  as permissive for update to authenticated
  using (
    user_id = auth.uid()
    or is_session_gm(session_id)
  );
drop policy if exists "dun_notes_owner_delete" on dungeon_element_notes;

create policy "dun_notes_owner_delete" on dungeon_element_notes
  as permissive for delete to authenticated
  using (
    user_id = auth.uid()
    or is_session_gm(session_id)
  );

-- ---------------------------------------------------------------------------
-- reference_photos: scope to session membership; broadcast requires GM
-- ---------------------------------------------------------------------------

drop policy if exists "anyone can view reference photos"  on reference_photos;
drop policy if exists "owner can insert reference photos" on reference_photos;
drop policy if exists "owner can delete reference photos" on reference_photos;
drop policy if exists "ref_photos_member_select" on reference_photos;

create policy "ref_photos_member_select" on reference_photos
  as permissive for select to authenticated
  using (is_session_member(session_id::uuid));
drop policy if exists "ref_photos_member_insert" on reference_photos;

create policy "ref_photos_member_insert" on reference_photos
  as permissive for insert to authenticated
  with check (
    auth.uid() = user_id
    and is_session_member(session_id::uuid)
  );
drop policy if exists "ref_photos_owner_delete" on reference_photos;

create policy "ref_photos_owner_delete" on reference_photos
  as permissive for delete to authenticated
  using (
    auth.uid() = user_id
    or is_session_gm(session_id::uuid)
  );

-- ---------------------------------------------------------------------------
-- photo_broadcasts: SELECT scoped to members; INSERT restricted to GM
-- (was: any authenticated user could pop a fullscreen modal on any session)
-- ---------------------------------------------------------------------------

drop policy if exists "anyone can view photo broadcasts"       on photo_broadcasts;
drop policy if exists "authenticated users can broadcast photos" on photo_broadcasts;
drop policy if exists "photo_broadcasts_member_select" on photo_broadcasts;

create policy "photo_broadcasts_member_select" on photo_broadcasts
  as permissive for select to authenticated
  using (is_session_member(session_id::uuid));
drop policy if exists "photo_broadcasts_gm_insert" on photo_broadcasts;

create policy "photo_broadcasts_gm_insert" on photo_broadcasts
  as permissive for insert to authenticated
  with check (
    auth.uid() = user_id
    and is_session_gm(session_id::uuid)
  );

-- ---------------------------------------------------------------------------
-- bug_reports: remove `OR user_id IS NULL` bypass; require authenticated self-insert
-- ---------------------------------------------------------------------------

drop policy if exists "authenticated users can insert bug reports" on bug_reports;
drop policy if exists "users can read own bug reports"             on bug_reports;
drop policy if exists "bug_reports_insert" on bug_reports;

create policy "bug_reports_insert" on bug_reports
  as permissive for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "bug_reports_select" on bug_reports;

create policy "bug_reports_select" on bug_reports
  as permissive for select to authenticated
  using (auth.uid() = user_id);
