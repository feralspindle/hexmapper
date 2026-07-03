
  create table if not exists "public"."bug_reports" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "user_id" uuid,
    "display_name" text,
    "description" text not null,
    "screenshot_path" text,
    "metadata" jsonb not null default '{}'::jsonb
      );


alter table "public"."bug_reports" enable row level security;


  create table if not exists "public"."characters" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid,
    "user_id" uuid not null,
    "data" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."characters" enable row level security;


  create table if not exists "public"."chat_messages" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "user_id" uuid not null,
    "display_name" text not null,
    "body" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."chat_messages" enable row level security;


  create table if not exists "public"."dice_roll_annotations" (
    "id" uuid not null default gen_random_uuid(),
    "roll_id" uuid not null,
    "session_id" uuid not null,
    "user_id" uuid,
    "display_name" text not null,
    "body" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."dice_roll_annotations" enable row level security;


  create table if not exists "public"."dice_rolls" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "user_id" uuid not null,
    "display_name" text not null default 'Adventurer'::text,
    "pending" jsonb not null default '{}'::jsonb,
    "modifier" integer not null default 0,
    "results" jsonb not null default '[]'::jsonb,
    "total" integer not null,
    "created_at" timestamp with time zone not null default now(),
    "label" text,
    "character_id" uuid
      );


alter table "public"."dice_rolls" enable row level security;


  create table if not exists "public"."dungeon_corridors" (
    "id" uuid not null default gen_random_uuid(),
    "dungeon_id" uuid not null,
    "session_id" uuid not null,
    "x1" integer not null,
    "y1" integer not null,
    "x2" integer not null,
    "y2" integer not null,
    "label" text,
    "width" integer not null default 1,
    "source_client" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."dungeon_corridors" enable row level security;


  create table if not exists "public"."dungeon_element_notes" (
    "id" uuid not null default gen_random_uuid(),
    "element_id" uuid not null,
    "element_type" text not null,
    "session_id" uuid not null,
    "user_id" uuid not null,
    "display_name" text not null default 'Adventurer'::text,
    "body" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."dungeon_element_notes" enable row level security;


  create table if not exists "public"."dungeon_rooms" (
    "id" uuid not null default gen_random_uuid(),
    "dungeon_id" uuid not null,
    "session_id" uuid not null,
    "origin_x" integer not null,
    "origin_y" integer not null,
    "width" integer not null,
    "height" integer not null,
    "label" text,
    "notes" text,
    "color" text,
    "source_client" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "items" jsonb default '[]'::jsonb,
    "doors" jsonb default '[]'::jsonb,
    "shape" text not null default 'rect'::text,
    "points" jsonb not null default '[]'::jsonb
      );


alter table "public"."dungeon_rooms" enable row level security;


  create table if not exists "public"."dungeons" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "hex_id" uuid not null,
    "name" text not null default 'Unnamed Dungeon'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "torch_running" boolean not null default false,
    "torch_elapsed_ms" bigint not null default 0,
    "torch_started_at" timestamp with time zone
      );


alter table "public"."dungeons" enable row level security;


  create table if not exists "public"."hex_cells" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "q" integer not null,
    "r" integer not null,
    "label" text,
    "notes" text,
    "terrain_type" text,
    "color" text,
    "has_dungeon" boolean not null default false,
    "source_client" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "revealed" boolean not null default false,
    "map_id" uuid,
    "marker_color" text,
    "marker_label" text
      );


alter table "public"."hex_cells" enable row level security;


  create table if not exists "public"."hex_notes" (
    "id" uuid not null default gen_random_uuid(),
    "hex_cell_id" uuid not null,
    "session_id" uuid not null,
    "user_id" uuid not null,
    "display_name" text not null default 'Adventurer'::text,
    "body" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."hex_notes" enable row level security;


  create table if not exists "public"."map_drafts" (
    "map_id" uuid not null,
    "session_id" uuid not null,
    "draft_data" jsonb not null default '{}'::jsonb,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."map_drafts" enable row level security;


  create table if not exists "public"."maps" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "name" text not null default 'Untitled Map'::text,
    "map_type" text not null default 'hex'::text,
    "map_image_path" text,
    "map_hex_width" integer not null default 96,
    "map_hex_height" integer,
    "map_image_rotation" integer not null default 0,
    "map_grid_rotation" integer not null default 0,
    "map_image_offset_x" integer not null default 0,
    "map_image_offset_y" integer not null default 0,
    "map_grid_offset_x" integer not null default 0,
    "map_grid_offset_y" integer not null default 0,
    "map_offset_locked" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."maps" enable row level security;


  create table if not exists "public"."session_members" (
    "session_id" uuid not null,
    "user_id" uuid not null,
    "joined_at" timestamp with time zone not null default now(),
    "last_seen_at" timestamp with time zone not null default now()
      );


alter table "public"."session_members" enable row level security;


  create table if not exists "public"."sessions" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null default 'Untitled Campaign'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "owner_id" uuid,
    "map_hex_size" integer not null default 48,
    "active_map_id" uuid
      );


alter table "public"."sessions" enable row level security;

CREATE INDEX IF NOT EXISTS bug_reports_created_at_idx ON public.bug_reports USING btree (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS bug_reports_pkey ON public.bug_reports USING btree (id);

CREATE INDEX IF NOT EXISTS bug_reports_user_id_idx ON public.bug_reports USING btree (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS characters_pkey ON public.characters USING btree (id);

CREATE INDEX IF NOT EXISTS characters_session_idx ON public.characters USING btree (session_id);

CREATE INDEX IF NOT EXISTS characters_user_idx ON public.characters USING btree (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_pkey ON public.chat_messages USING btree (id);

CREATE INDEX IF NOT EXISTS chat_messages_session_created ON public.chat_messages USING btree (session_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS dice_roll_annotations_pkey ON public.dice_roll_annotations USING btree (id);

CREATE INDEX IF NOT EXISTS dice_roll_annotations_roll_id_created_at_idx ON public.dice_roll_annotations USING btree (roll_id, created_at);

CREATE INDEX IF NOT EXISTS dice_roll_annotations_session_id_idx ON public.dice_roll_annotations USING btree (session_id);

CREATE INDEX IF NOT EXISTS dice_rolls_character_idx ON public.dice_rolls USING btree (character_id);

CREATE UNIQUE INDEX IF NOT EXISTS dice_rolls_pkey ON public.dice_rolls USING btree (id);

CREATE INDEX IF NOT EXISTS dice_rolls_session_idx ON public.dice_rolls USING btree (session_id);

CREATE INDEX IF NOT EXISTS dice_rolls_user_idx ON public.dice_rolls USING btree (user_id);

CREATE INDEX IF NOT EXISTS dungeon_corridors_dungeon_idx ON public.dungeon_corridors USING btree (dungeon_id);

CREATE UNIQUE INDEX IF NOT EXISTS dungeon_corridors_pkey ON public.dungeon_corridors USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS dungeon_element_notes_pkey ON public.dungeon_element_notes USING btree (id);

CREATE INDEX IF NOT EXISTS dungeon_notes_element_idx ON public.dungeon_element_notes USING btree (element_id);

CREATE INDEX IF NOT EXISTS dungeon_notes_session_idx ON public.dungeon_element_notes USING btree (session_id);

CREATE INDEX IF NOT EXISTS dungeon_rooms_dungeon_idx ON public.dungeon_rooms USING btree (dungeon_id);

CREATE UNIQUE INDEX IF NOT EXISTS dungeon_rooms_pkey ON public.dungeon_rooms USING btree (id);

CREATE INDEX IF NOT EXISTS dungeons_hex_idx ON public.dungeons USING btree (hex_id);

CREATE UNIQUE INDEX IF NOT EXISTS dungeons_pkey ON public.dungeons USING btree (id);

CREATE INDEX IF NOT EXISTS dungeons_session_idx ON public.dungeons USING btree (session_id);

CREATE UNIQUE INDEX IF NOT EXISTS hex_cells_map_id_q_r_key ON public.hex_cells USING btree (map_id, q, r);

CREATE UNIQUE INDEX IF NOT EXISTS hex_cells_pkey ON public.hex_cells USING btree (id);

CREATE INDEX IF NOT EXISTS hex_cells_session_idx ON public.hex_cells USING btree (session_id);

CREATE INDEX IF NOT EXISTS hex_notes_hex_idx ON public.hex_notes USING btree (hex_cell_id);

CREATE UNIQUE INDEX IF NOT EXISTS hex_notes_pkey ON public.hex_notes USING btree (id);

CREATE INDEX IF NOT EXISTS hex_notes_session_idx ON public.hex_notes USING btree (session_id);

CREATE UNIQUE INDEX IF NOT EXISTS map_drafts_pkey ON public.map_drafts USING btree (map_id);

CREATE UNIQUE INDEX IF NOT EXISTS maps_pkey ON public.maps USING btree (id);

CREATE INDEX IF NOT EXISTS maps_session_idx ON public.maps USING btree (session_id);

CREATE UNIQUE INDEX IF NOT EXISTS session_members_pkey ON public.session_members USING btree (session_id, user_id);

CREATE INDEX IF NOT EXISTS session_members_user_idx ON public.session_members USING btree (user_id);

CREATE INDEX IF NOT EXISTS sessions_owner_idx ON public.sessions USING btree (owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_pkey ON public.sessions USING btree (id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bug_reports_pkey'
      and conrelid = 'public.bug_reports'::regclass
  ) then
    alter table "public"."bug_reports" add constraint "bug_reports_pkey" PRIMARY KEY using index "bug_reports_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'characters_pkey'
      and conrelid = 'public.characters'::regclass
  ) then
    alter table "public"."characters" add constraint "characters_pkey" PRIMARY KEY using index "characters_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_pkey'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table "public"."chat_messages" add constraint "chat_messages_pkey" PRIMARY KEY using index "chat_messages_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dice_roll_annotations_pkey'
      and conrelid = 'public.dice_roll_annotations'::regclass
  ) then
    alter table "public"."dice_roll_annotations" add constraint "dice_roll_annotations_pkey" PRIMARY KEY using index "dice_roll_annotations_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dice_rolls_pkey'
      and conrelid = 'public.dice_rolls'::regclass
  ) then
    alter table "public"."dice_rolls" add constraint "dice_rolls_pkey" PRIMARY KEY using index "dice_rolls_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_corridors_pkey'
      and conrelid = 'public.dungeon_corridors'::regclass
  ) then
    alter table "public"."dungeon_corridors" add constraint "dungeon_corridors_pkey" PRIMARY KEY using index "dungeon_corridors_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_element_notes_pkey'
      and conrelid = 'public.dungeon_element_notes'::regclass
  ) then
    alter table "public"."dungeon_element_notes" add constraint "dungeon_element_notes_pkey" PRIMARY KEY using index "dungeon_element_notes_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_rooms_pkey'
      and conrelid = 'public.dungeon_rooms'::regclass
  ) then
    alter table "public"."dungeon_rooms" add constraint "dungeon_rooms_pkey" PRIMARY KEY using index "dungeon_rooms_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeons_pkey'
      and conrelid = 'public.dungeons'::regclass
  ) then
    alter table "public"."dungeons" add constraint "dungeons_pkey" PRIMARY KEY using index "dungeons_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hex_cells_pkey'
      and conrelid = 'public.hex_cells'::regclass
  ) then
    alter table "public"."hex_cells" add constraint "hex_cells_pkey" PRIMARY KEY using index "hex_cells_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hex_notes_pkey'
      and conrelid = 'public.hex_notes'::regclass
  ) then
    alter table "public"."hex_notes" add constraint "hex_notes_pkey" PRIMARY KEY using index "hex_notes_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'map_drafts_pkey'
      and conrelid = 'public.map_drafts'::regclass
  ) then
    alter table "public"."map_drafts" add constraint "map_drafts_pkey" PRIMARY KEY using index "map_drafts_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maps_pkey'
      and conrelid = 'public.maps'::regclass
  ) then
    alter table "public"."maps" add constraint "maps_pkey" PRIMARY KEY using index "maps_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'session_members_pkey'
      and conrelid = 'public.session_members'::regclass
  ) then
    alter table "public"."session_members" add constraint "session_members_pkey" PRIMARY KEY using index "session_members_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_pkey'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table "public"."sessions" add constraint "sessions_pkey" PRIMARY KEY using index "sessions_pkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bug_reports_user_id_fkey'
      and conrelid = 'public.bug_reports'::regclass
  ) then
    alter table "public"."bug_reports" add constraint "bug_reports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'bug_reports_user_id_fkey'
      and conrelid = 'public.bug_reports'::regclass
  ) then
    alter table "public"."bug_reports" validate constraint "bug_reports_user_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'characters_user_id_fkey'
      and conrelid = 'public.characters'::regclass
  ) then
    alter table "public"."characters" add constraint "characters_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'characters_user_id_fkey'
      and conrelid = 'public.characters'::regclass
  ) then
    alter table "public"."characters" validate constraint "characters_user_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_session_id_fkey'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table "public"."chat_messages" add constraint "chat_messages_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_session_id_fkey'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table "public"."chat_messages" validate constraint "chat_messages_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_user_id_fkey'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table "public"."chat_messages" add constraint "chat_messages_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_user_id_fkey'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table "public"."chat_messages" validate constraint "chat_messages_user_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dice_roll_annotations_body_check'
      and conrelid = 'public.dice_roll_annotations'::regclass
  ) then
    alter table "public"."dice_roll_annotations" add constraint "dice_roll_annotations_body_check" CHECK ((char_length(body) <= 500)) not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dice_roll_annotations_body_check'
      and conrelid = 'public.dice_roll_annotations'::regclass
  ) then
    alter table "public"."dice_roll_annotations" validate constraint "dice_roll_annotations_body_check";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dice_roll_annotations_roll_id_fkey'
      and conrelid = 'public.dice_roll_annotations'::regclass
  ) then
    alter table "public"."dice_roll_annotations" add constraint "dice_roll_annotations_roll_id_fkey" FOREIGN KEY (roll_id) REFERENCES public.dice_rolls(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dice_roll_annotations_roll_id_fkey'
      and conrelid = 'public.dice_roll_annotations'::regclass
  ) then
    alter table "public"."dice_roll_annotations" validate constraint "dice_roll_annotations_roll_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dice_roll_annotations_session_id_fkey'
      and conrelid = 'public.dice_roll_annotations'::regclass
  ) then
    alter table "public"."dice_roll_annotations" add constraint "dice_roll_annotations_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dice_roll_annotations_session_id_fkey'
      and conrelid = 'public.dice_roll_annotations'::regclass
  ) then
    alter table "public"."dice_roll_annotations" validate constraint "dice_roll_annotations_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dice_roll_annotations_user_id_fkey'
      and conrelid = 'public.dice_roll_annotations'::regclass
  ) then
    alter table "public"."dice_roll_annotations" add constraint "dice_roll_annotations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dice_roll_annotations_user_id_fkey'
      and conrelid = 'public.dice_roll_annotations'::regclass
  ) then
    alter table "public"."dice_roll_annotations" validate constraint "dice_roll_annotations_user_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dice_rolls_character_id_fkey'
      and conrelid = 'public.dice_rolls'::regclass
  ) then
    alter table "public"."dice_rolls" add constraint "dice_rolls_character_id_fkey" FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE SET NULL not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dice_rolls_character_id_fkey'
      and conrelid = 'public.dice_rolls'::regclass
  ) then
    alter table "public"."dice_rolls" validate constraint "dice_rolls_character_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dice_rolls_session_id_fkey'
      and conrelid = 'public.dice_rolls'::regclass
  ) then
    alter table "public"."dice_rolls" add constraint "dice_rolls_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dice_rolls_session_id_fkey'
      and conrelid = 'public.dice_rolls'::regclass
  ) then
    alter table "public"."dice_rolls" validate constraint "dice_rolls_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dice_rolls_user_id_fkey'
      and conrelid = 'public.dice_rolls'::regclass
  ) then
    alter table "public"."dice_rolls" add constraint "dice_rolls_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dice_rolls_user_id_fkey'
      and conrelid = 'public.dice_rolls'::regclass
  ) then
    alter table "public"."dice_rolls" validate constraint "dice_rolls_user_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_corridors_dungeon_id_fkey'
      and conrelid = 'public.dungeon_corridors'::regclass
  ) then
    alter table "public"."dungeon_corridors" add constraint "dungeon_corridors_dungeon_id_fkey" FOREIGN KEY (dungeon_id) REFERENCES public.dungeons(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_corridors_dungeon_id_fkey'
      and conrelid = 'public.dungeon_corridors'::regclass
  ) then
    alter table "public"."dungeon_corridors" validate constraint "dungeon_corridors_dungeon_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_corridors_session_id_fkey'
      and conrelid = 'public.dungeon_corridors'::regclass
  ) then
    alter table "public"."dungeon_corridors" add constraint "dungeon_corridors_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_corridors_session_id_fkey'
      and conrelid = 'public.dungeon_corridors'::regclass
  ) then
    alter table "public"."dungeon_corridors" validate constraint "dungeon_corridors_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_element_notes_element_type_check'
      and conrelid = 'public.dungeon_element_notes'::regclass
  ) then
    alter table "public"."dungeon_element_notes" add constraint "dungeon_element_notes_element_type_check" CHECK ((element_type = ANY (ARRAY['room'::text, 'corridor'::text]))) not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_element_notes_element_type_check'
      and conrelid = 'public.dungeon_element_notes'::regclass
  ) then
    alter table "public"."dungeon_element_notes" validate constraint "dungeon_element_notes_element_type_check";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_element_notes_session_id_fkey'
      and conrelid = 'public.dungeon_element_notes'::regclass
  ) then
    alter table "public"."dungeon_element_notes" add constraint "dungeon_element_notes_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_element_notes_session_id_fkey'
      and conrelid = 'public.dungeon_element_notes'::regclass
  ) then
    alter table "public"."dungeon_element_notes" validate constraint "dungeon_element_notes_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_element_notes_user_id_fkey'
      and conrelid = 'public.dungeon_element_notes'::regclass
  ) then
    alter table "public"."dungeon_element_notes" add constraint "dungeon_element_notes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_element_notes_user_id_fkey'
      and conrelid = 'public.dungeon_element_notes'::regclass
  ) then
    alter table "public"."dungeon_element_notes" validate constraint "dungeon_element_notes_user_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_rooms_dungeon_id_fkey'
      and conrelid = 'public.dungeon_rooms'::regclass
  ) then
    alter table "public"."dungeon_rooms" add constraint "dungeon_rooms_dungeon_id_fkey" FOREIGN KEY (dungeon_id) REFERENCES public.dungeons(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_rooms_dungeon_id_fkey'
      and conrelid = 'public.dungeon_rooms'::regclass
  ) then
    alter table "public"."dungeon_rooms" validate constraint "dungeon_rooms_dungeon_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_rooms_session_id_fkey'
      and conrelid = 'public.dungeon_rooms'::regclass
  ) then
    alter table "public"."dungeon_rooms" add constraint "dungeon_rooms_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dungeon_rooms_session_id_fkey'
      and conrelid = 'public.dungeon_rooms'::regclass
  ) then
    alter table "public"."dungeon_rooms" validate constraint "dungeon_rooms_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeons_hex_id_fkey'
      and conrelid = 'public.dungeons'::regclass
  ) then
    alter table "public"."dungeons" add constraint "dungeons_hex_id_fkey" FOREIGN KEY (hex_id) REFERENCES public.hex_cells(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dungeons_hex_id_fkey'
      and conrelid = 'public.dungeons'::regclass
  ) then
    alter table "public"."dungeons" validate constraint "dungeons_hex_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dungeons_session_id_fkey'
      and conrelid = 'public.dungeons'::regclass
  ) then
    alter table "public"."dungeons" add constraint "dungeons_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dungeons_session_id_fkey'
      and conrelid = 'public.dungeons'::regclass
  ) then
    alter table "public"."dungeons" validate constraint "dungeons_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hex_cells_map_id_fkey'
      and conrelid = 'public.hex_cells'::regclass
  ) then
    alter table "public"."hex_cells" add constraint "hex_cells_map_id_fkey" FOREIGN KEY (map_id) REFERENCES public.maps(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'hex_cells_map_id_fkey'
      and conrelid = 'public.hex_cells'::regclass
  ) then
    alter table "public"."hex_cells" validate constraint "hex_cells_map_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hex_cells_map_id_q_r_key'
      and conrelid = 'public.hex_cells'::regclass
  ) then
    alter table "public"."hex_cells" add constraint "hex_cells_map_id_q_r_key" UNIQUE using index "hex_cells_map_id_q_r_key";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hex_cells_session_id_fkey'
      and conrelid = 'public.hex_cells'::regclass
  ) then
    alter table "public"."hex_cells" add constraint "hex_cells_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'hex_cells_session_id_fkey'
      and conrelid = 'public.hex_cells'::regclass
  ) then
    alter table "public"."hex_cells" validate constraint "hex_cells_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hex_notes_hex_cell_id_fkey'
      and conrelid = 'public.hex_notes'::regclass
  ) then
    alter table "public"."hex_notes" add constraint "hex_notes_hex_cell_id_fkey" FOREIGN KEY (hex_cell_id) REFERENCES public.hex_cells(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'hex_notes_hex_cell_id_fkey'
      and conrelid = 'public.hex_notes'::regclass
  ) then
    alter table "public"."hex_notes" validate constraint "hex_notes_hex_cell_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hex_notes_session_id_fkey'
      and conrelid = 'public.hex_notes'::regclass
  ) then
    alter table "public"."hex_notes" add constraint "hex_notes_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'hex_notes_session_id_fkey'
      and conrelid = 'public.hex_notes'::regclass
  ) then
    alter table "public"."hex_notes" validate constraint "hex_notes_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hex_notes_user_id_fkey'
      and conrelid = 'public.hex_notes'::regclass
  ) then
    alter table "public"."hex_notes" add constraint "hex_notes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'hex_notes_user_id_fkey'
      and conrelid = 'public.hex_notes'::regclass
  ) then
    alter table "public"."hex_notes" validate constraint "hex_notes_user_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'map_drafts_map_id_fkey'
      and conrelid = 'public.map_drafts'::regclass
  ) then
    alter table "public"."map_drafts" add constraint "map_drafts_map_id_fkey" FOREIGN KEY (map_id) REFERENCES public.maps(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'map_drafts_map_id_fkey'
      and conrelid = 'public.map_drafts'::regclass
  ) then
    alter table "public"."map_drafts" validate constraint "map_drafts_map_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'map_drafts_session_id_fkey'
      and conrelid = 'public.map_drafts'::regclass
  ) then
    alter table "public"."map_drafts" add constraint "map_drafts_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'map_drafts_session_id_fkey'
      and conrelid = 'public.map_drafts'::regclass
  ) then
    alter table "public"."map_drafts" validate constraint "map_drafts_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maps_session_id_fkey'
      and conrelid = 'public.maps'::regclass
  ) then
    alter table "public"."maps" add constraint "maps_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'maps_session_id_fkey'
      and conrelid = 'public.maps'::regclass
  ) then
    alter table "public"."maps" validate constraint "maps_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'session_members_session_id_fkey'
      and conrelid = 'public.session_members'::regclass
  ) then
    alter table "public"."session_members" add constraint "session_members_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'session_members_session_id_fkey'
      and conrelid = 'public.session_members'::regclass
  ) then
    alter table "public"."session_members" validate constraint "session_members_session_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'session_members_user_id_fkey'
      and conrelid = 'public.session_members'::regclass
  ) then
    alter table "public"."session_members" add constraint "session_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'session_members_user_id_fkey'
      and conrelid = 'public.session_members'::regclass
  ) then
    alter table "public"."session_members" validate constraint "session_members_user_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_active_map_id_fkey'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table "public"."sessions" add constraint "sessions_active_map_id_fkey" FOREIGN KEY (active_map_id) REFERENCES public.maps(id) ON DELETE SET NULL not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'sessions_active_map_id_fkey'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table "public"."sessions" validate constraint "sessions_active_map_id_fkey";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_owner_id_fkey'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table "public"."sessions" add constraint "sessions_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'sessions_owner_id_fkey'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table "public"."sessions" validate constraint "sessions_owner_id_fkey";
  end if;
end $$;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

grant delete on table "public"."bug_reports" to "anon";

grant insert on table "public"."bug_reports" to "anon";

grant references on table "public"."bug_reports" to "anon";

grant select on table "public"."bug_reports" to "anon";

grant trigger on table "public"."bug_reports" to "anon";

grant truncate on table "public"."bug_reports" to "anon";

grant update on table "public"."bug_reports" to "anon";

grant delete on table "public"."bug_reports" to "authenticated";

grant insert on table "public"."bug_reports" to "authenticated";

grant references on table "public"."bug_reports" to "authenticated";

grant select on table "public"."bug_reports" to "authenticated";

grant trigger on table "public"."bug_reports" to "authenticated";

grant truncate on table "public"."bug_reports" to "authenticated";

grant update on table "public"."bug_reports" to "authenticated";

grant delete on table "public"."bug_reports" to "service_role";

grant insert on table "public"."bug_reports" to "service_role";

grant references on table "public"."bug_reports" to "service_role";

grant select on table "public"."bug_reports" to "service_role";

grant trigger on table "public"."bug_reports" to "service_role";

grant truncate on table "public"."bug_reports" to "service_role";

grant update on table "public"."bug_reports" to "service_role";

grant delete on table "public"."characters" to "anon";

grant insert on table "public"."characters" to "anon";

grant references on table "public"."characters" to "anon";

grant select on table "public"."characters" to "anon";

grant trigger on table "public"."characters" to "anon";

grant truncate on table "public"."characters" to "anon";

grant update on table "public"."characters" to "anon";

grant delete on table "public"."characters" to "authenticated";

grant insert on table "public"."characters" to "authenticated";

grant references on table "public"."characters" to "authenticated";

grant select on table "public"."characters" to "authenticated";

grant trigger on table "public"."characters" to "authenticated";

grant truncate on table "public"."characters" to "authenticated";

grant update on table "public"."characters" to "authenticated";

grant delete on table "public"."characters" to "service_role";

grant insert on table "public"."characters" to "service_role";

grant references on table "public"."characters" to "service_role";

grant select on table "public"."characters" to "service_role";

grant trigger on table "public"."characters" to "service_role";

grant truncate on table "public"."characters" to "service_role";

grant update on table "public"."characters" to "service_role";

grant delete on table "public"."chat_messages" to "anon";

grant insert on table "public"."chat_messages" to "anon";

grant references on table "public"."chat_messages" to "anon";

grant select on table "public"."chat_messages" to "anon";

grant trigger on table "public"."chat_messages" to "anon";

grant truncate on table "public"."chat_messages" to "anon";

grant update on table "public"."chat_messages" to "anon";

grant delete on table "public"."chat_messages" to "authenticated";

grant insert on table "public"."chat_messages" to "authenticated";

grant references on table "public"."chat_messages" to "authenticated";

grant select on table "public"."chat_messages" to "authenticated";

grant trigger on table "public"."chat_messages" to "authenticated";

grant truncate on table "public"."chat_messages" to "authenticated";

grant update on table "public"."chat_messages" to "authenticated";

grant delete on table "public"."chat_messages" to "service_role";

grant insert on table "public"."chat_messages" to "service_role";

grant references on table "public"."chat_messages" to "service_role";

grant select on table "public"."chat_messages" to "service_role";

grant trigger on table "public"."chat_messages" to "service_role";

grant truncate on table "public"."chat_messages" to "service_role";

grant update on table "public"."chat_messages" to "service_role";

grant delete on table "public"."dice_roll_annotations" to "anon";

grant insert on table "public"."dice_roll_annotations" to "anon";

grant references on table "public"."dice_roll_annotations" to "anon";

grant select on table "public"."dice_roll_annotations" to "anon";

grant trigger on table "public"."dice_roll_annotations" to "anon";

grant truncate on table "public"."dice_roll_annotations" to "anon";

grant update on table "public"."dice_roll_annotations" to "anon";

grant delete on table "public"."dice_roll_annotations" to "authenticated";

grant insert on table "public"."dice_roll_annotations" to "authenticated";

grant references on table "public"."dice_roll_annotations" to "authenticated";

grant select on table "public"."dice_roll_annotations" to "authenticated";

grant trigger on table "public"."dice_roll_annotations" to "authenticated";

grant truncate on table "public"."dice_roll_annotations" to "authenticated";

grant update on table "public"."dice_roll_annotations" to "authenticated";

grant delete on table "public"."dice_roll_annotations" to "service_role";

grant insert on table "public"."dice_roll_annotations" to "service_role";

grant references on table "public"."dice_roll_annotations" to "service_role";

grant select on table "public"."dice_roll_annotations" to "service_role";

grant trigger on table "public"."dice_roll_annotations" to "service_role";

grant truncate on table "public"."dice_roll_annotations" to "service_role";

grant update on table "public"."dice_roll_annotations" to "service_role";

grant delete on table "public"."dice_rolls" to "anon";

grant insert on table "public"."dice_rolls" to "anon";

grant references on table "public"."dice_rolls" to "anon";

grant select on table "public"."dice_rolls" to "anon";

grant trigger on table "public"."dice_rolls" to "anon";

grant truncate on table "public"."dice_rolls" to "anon";

grant update on table "public"."dice_rolls" to "anon";

grant delete on table "public"."dice_rolls" to "authenticated";

grant insert on table "public"."dice_rolls" to "authenticated";

grant references on table "public"."dice_rolls" to "authenticated";

grant select on table "public"."dice_rolls" to "authenticated";

grant trigger on table "public"."dice_rolls" to "authenticated";

grant truncate on table "public"."dice_rolls" to "authenticated";

grant update on table "public"."dice_rolls" to "authenticated";

grant delete on table "public"."dice_rolls" to "service_role";

grant insert on table "public"."dice_rolls" to "service_role";

grant references on table "public"."dice_rolls" to "service_role";

grant select on table "public"."dice_rolls" to "service_role";

grant trigger on table "public"."dice_rolls" to "service_role";

grant truncate on table "public"."dice_rolls" to "service_role";

grant update on table "public"."dice_rolls" to "service_role";

grant delete on table "public"."dungeon_corridors" to "anon";

grant insert on table "public"."dungeon_corridors" to "anon";

grant references on table "public"."dungeon_corridors" to "anon";

grant select on table "public"."dungeon_corridors" to "anon";

grant trigger on table "public"."dungeon_corridors" to "anon";

grant truncate on table "public"."dungeon_corridors" to "anon";

grant update on table "public"."dungeon_corridors" to "anon";

grant delete on table "public"."dungeon_corridors" to "authenticated";

grant insert on table "public"."dungeon_corridors" to "authenticated";

grant references on table "public"."dungeon_corridors" to "authenticated";

grant select on table "public"."dungeon_corridors" to "authenticated";

grant trigger on table "public"."dungeon_corridors" to "authenticated";

grant truncate on table "public"."dungeon_corridors" to "authenticated";

grant update on table "public"."dungeon_corridors" to "authenticated";

grant delete on table "public"."dungeon_corridors" to "service_role";

grant insert on table "public"."dungeon_corridors" to "service_role";

grant references on table "public"."dungeon_corridors" to "service_role";

grant select on table "public"."dungeon_corridors" to "service_role";

grant trigger on table "public"."dungeon_corridors" to "service_role";

grant truncate on table "public"."dungeon_corridors" to "service_role";

grant update on table "public"."dungeon_corridors" to "service_role";

grant delete on table "public"."dungeon_element_notes" to "anon";

grant insert on table "public"."dungeon_element_notes" to "anon";

grant references on table "public"."dungeon_element_notes" to "anon";

grant select on table "public"."dungeon_element_notes" to "anon";

grant trigger on table "public"."dungeon_element_notes" to "anon";

grant truncate on table "public"."dungeon_element_notes" to "anon";

grant update on table "public"."dungeon_element_notes" to "anon";

grant delete on table "public"."dungeon_element_notes" to "authenticated";

grant insert on table "public"."dungeon_element_notes" to "authenticated";

grant references on table "public"."dungeon_element_notes" to "authenticated";

grant select on table "public"."dungeon_element_notes" to "authenticated";

grant trigger on table "public"."dungeon_element_notes" to "authenticated";

grant truncate on table "public"."dungeon_element_notes" to "authenticated";

grant update on table "public"."dungeon_element_notes" to "authenticated";

grant delete on table "public"."dungeon_element_notes" to "service_role";

grant insert on table "public"."dungeon_element_notes" to "service_role";

grant references on table "public"."dungeon_element_notes" to "service_role";

grant select on table "public"."dungeon_element_notes" to "service_role";

grant trigger on table "public"."dungeon_element_notes" to "service_role";

grant truncate on table "public"."dungeon_element_notes" to "service_role";

grant update on table "public"."dungeon_element_notes" to "service_role";

grant delete on table "public"."dungeon_rooms" to "anon";

grant insert on table "public"."dungeon_rooms" to "anon";

grant references on table "public"."dungeon_rooms" to "anon";

grant select on table "public"."dungeon_rooms" to "anon";

grant trigger on table "public"."dungeon_rooms" to "anon";

grant truncate on table "public"."dungeon_rooms" to "anon";

grant update on table "public"."dungeon_rooms" to "anon";

grant delete on table "public"."dungeon_rooms" to "authenticated";

grant insert on table "public"."dungeon_rooms" to "authenticated";

grant references on table "public"."dungeon_rooms" to "authenticated";

grant select on table "public"."dungeon_rooms" to "authenticated";

grant trigger on table "public"."dungeon_rooms" to "authenticated";

grant truncate on table "public"."dungeon_rooms" to "authenticated";

grant update on table "public"."dungeon_rooms" to "authenticated";

grant delete on table "public"."dungeon_rooms" to "service_role";

grant insert on table "public"."dungeon_rooms" to "service_role";

grant references on table "public"."dungeon_rooms" to "service_role";

grant select on table "public"."dungeon_rooms" to "service_role";

grant trigger on table "public"."dungeon_rooms" to "service_role";

grant truncate on table "public"."dungeon_rooms" to "service_role";

grant update on table "public"."dungeon_rooms" to "service_role";

grant delete on table "public"."dungeons" to "anon";

grant insert on table "public"."dungeons" to "anon";

grant references on table "public"."dungeons" to "anon";

grant select on table "public"."dungeons" to "anon";

grant trigger on table "public"."dungeons" to "anon";

grant truncate on table "public"."dungeons" to "anon";

grant update on table "public"."dungeons" to "anon";

grant delete on table "public"."dungeons" to "authenticated";

grant insert on table "public"."dungeons" to "authenticated";

grant references on table "public"."dungeons" to "authenticated";

grant select on table "public"."dungeons" to "authenticated";

grant trigger on table "public"."dungeons" to "authenticated";

grant truncate on table "public"."dungeons" to "authenticated";

grant update on table "public"."dungeons" to "authenticated";

grant delete on table "public"."dungeons" to "service_role";

grant insert on table "public"."dungeons" to "service_role";

grant references on table "public"."dungeons" to "service_role";

grant select on table "public"."dungeons" to "service_role";

grant trigger on table "public"."dungeons" to "service_role";

grant truncate on table "public"."dungeons" to "service_role";

grant update on table "public"."dungeons" to "service_role";

grant delete on table "public"."hex_cells" to "anon";

grant insert on table "public"."hex_cells" to "anon";

grant references on table "public"."hex_cells" to "anon";

grant select on table "public"."hex_cells" to "anon";

grant trigger on table "public"."hex_cells" to "anon";

grant truncate on table "public"."hex_cells" to "anon";

grant update on table "public"."hex_cells" to "anon";

grant delete on table "public"."hex_cells" to "authenticated";

grant insert on table "public"."hex_cells" to "authenticated";

grant references on table "public"."hex_cells" to "authenticated";

grant select on table "public"."hex_cells" to "authenticated";

grant trigger on table "public"."hex_cells" to "authenticated";

grant truncate on table "public"."hex_cells" to "authenticated";

grant update on table "public"."hex_cells" to "authenticated";

grant delete on table "public"."hex_cells" to "service_role";

grant insert on table "public"."hex_cells" to "service_role";

grant references on table "public"."hex_cells" to "service_role";

grant select on table "public"."hex_cells" to "service_role";

grant trigger on table "public"."hex_cells" to "service_role";

grant truncate on table "public"."hex_cells" to "service_role";

grant update on table "public"."hex_cells" to "service_role";

grant delete on table "public"."hex_notes" to "anon";

grant insert on table "public"."hex_notes" to "anon";

grant references on table "public"."hex_notes" to "anon";

grant select on table "public"."hex_notes" to "anon";

grant trigger on table "public"."hex_notes" to "anon";

grant truncate on table "public"."hex_notes" to "anon";

grant update on table "public"."hex_notes" to "anon";

grant delete on table "public"."hex_notes" to "authenticated";

grant insert on table "public"."hex_notes" to "authenticated";

grant references on table "public"."hex_notes" to "authenticated";

grant select on table "public"."hex_notes" to "authenticated";

grant trigger on table "public"."hex_notes" to "authenticated";

grant truncate on table "public"."hex_notes" to "authenticated";

grant update on table "public"."hex_notes" to "authenticated";

grant delete on table "public"."hex_notes" to "service_role";

grant insert on table "public"."hex_notes" to "service_role";

grant references on table "public"."hex_notes" to "service_role";

grant select on table "public"."hex_notes" to "service_role";

grant trigger on table "public"."hex_notes" to "service_role";

grant truncate on table "public"."hex_notes" to "service_role";

grant update on table "public"."hex_notes" to "service_role";

grant delete on table "public"."map_drafts" to "anon";

grant insert on table "public"."map_drafts" to "anon";

grant references on table "public"."map_drafts" to "anon";

grant select on table "public"."map_drafts" to "anon";

grant trigger on table "public"."map_drafts" to "anon";

grant truncate on table "public"."map_drafts" to "anon";

grant update on table "public"."map_drafts" to "anon";

grant delete on table "public"."map_drafts" to "authenticated";

grant insert on table "public"."map_drafts" to "authenticated";

grant references on table "public"."map_drafts" to "authenticated";

grant select on table "public"."map_drafts" to "authenticated";

grant trigger on table "public"."map_drafts" to "authenticated";

grant truncate on table "public"."map_drafts" to "authenticated";

grant update on table "public"."map_drafts" to "authenticated";

grant delete on table "public"."map_drafts" to "service_role";

grant insert on table "public"."map_drafts" to "service_role";

grant references on table "public"."map_drafts" to "service_role";

grant select on table "public"."map_drafts" to "service_role";

grant trigger on table "public"."map_drafts" to "service_role";

grant truncate on table "public"."map_drafts" to "service_role";

grant update on table "public"."map_drafts" to "service_role";

grant delete on table "public"."maps" to "anon";

grant insert on table "public"."maps" to "anon";

grant references on table "public"."maps" to "anon";

grant select on table "public"."maps" to "anon";

grant trigger on table "public"."maps" to "anon";

grant truncate on table "public"."maps" to "anon";

grant update on table "public"."maps" to "anon";

grant delete on table "public"."maps" to "authenticated";

grant insert on table "public"."maps" to "authenticated";

grant references on table "public"."maps" to "authenticated";

grant select on table "public"."maps" to "authenticated";

grant trigger on table "public"."maps" to "authenticated";

grant truncate on table "public"."maps" to "authenticated";

grant update on table "public"."maps" to "authenticated";

grant delete on table "public"."maps" to "service_role";

grant insert on table "public"."maps" to "service_role";

grant references on table "public"."maps" to "service_role";

grant select on table "public"."maps" to "service_role";

grant trigger on table "public"."maps" to "service_role";

grant truncate on table "public"."maps" to "service_role";

grant update on table "public"."maps" to "service_role";

grant delete on table "public"."session_members" to "anon";

grant insert on table "public"."session_members" to "anon";

grant references on table "public"."session_members" to "anon";

grant select on table "public"."session_members" to "anon";

grant trigger on table "public"."session_members" to "anon";

grant truncate on table "public"."session_members" to "anon";

grant update on table "public"."session_members" to "anon";

grant delete on table "public"."session_members" to "authenticated";

grant insert on table "public"."session_members" to "authenticated";

grant references on table "public"."session_members" to "authenticated";

grant select on table "public"."session_members" to "authenticated";

grant trigger on table "public"."session_members" to "authenticated";

grant truncate on table "public"."session_members" to "authenticated";

grant update on table "public"."session_members" to "authenticated";

grant delete on table "public"."session_members" to "service_role";

grant insert on table "public"."session_members" to "service_role";

grant references on table "public"."session_members" to "service_role";

grant select on table "public"."session_members" to "service_role";

grant trigger on table "public"."session_members" to "service_role";

grant truncate on table "public"."session_members" to "service_role";

grant update on table "public"."session_members" to "service_role";

grant delete on table "public"."sessions" to "anon";

grant insert on table "public"."sessions" to "anon";

grant references on table "public"."sessions" to "anon";

grant select on table "public"."sessions" to "anon";

grant trigger on table "public"."sessions" to "anon";

grant truncate on table "public"."sessions" to "anon";

grant update on table "public"."sessions" to "anon";

grant delete on table "public"."sessions" to "authenticated";

grant insert on table "public"."sessions" to "authenticated";

grant references on table "public"."sessions" to "authenticated";

grant select on table "public"."sessions" to "authenticated";

grant trigger on table "public"."sessions" to "authenticated";

grant truncate on table "public"."sessions" to "authenticated";

grant update on table "public"."sessions" to "authenticated";

grant delete on table "public"."sessions" to "service_role";

grant insert on table "public"."sessions" to "service_role";

grant references on table "public"."sessions" to "service_role";

grant select on table "public"."sessions" to "service_role";

grant trigger on table "public"."sessions" to "service_role";

grant truncate on table "public"."sessions" to "service_role";

grant update on table "public"."sessions" to "service_role";
drop policy if exists "authenticated users can insert bug reports" on "public"."bug_reports";


  create policy "authenticated users can insert bug reports"
  on "public"."bug_reports"
  as permissive
  for insert
  to authenticated
with check (((auth.uid() = user_id) OR (user_id IS NULL)));
drop policy if exists "users can read own bug reports" on "public"."bug_reports";



  create policy "users can read own bug reports"
  on "public"."bug_reports"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));
drop policy if exists "characters_delete" on "public"."characters";



  create policy "characters_delete"
  on "public"."characters"
  as permissive
  for delete
  to authenticated
using ((user_id = auth.uid()));
drop policy if exists "characters_insert" on "public"."characters";



  create policy "characters_insert"
  on "public"."characters"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));
drop policy if exists "characters_select" on "public"."characters";



  create policy "characters_select"
  on "public"."characters"
  as permissive
  for select
  to authenticated
using (((user_id = auth.uid()) OR ((session_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.sessions
  WHERE ((sessions.id = characters.session_id) AND (sessions.owner_id = auth.uid())))))));
drop policy if exists "characters_update" on "public"."characters";



  create policy "characters_update"
  on "public"."characters"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()));
drop policy if exists "session members read chat" on "public"."chat_messages";



  create policy "session members read chat"
  on "public"."chat_messages"
  as permissive
  for select
  to public
using ((session_id IN ( SELECT session_members.session_id
   FROM public.session_members
  WHERE (session_members.user_id = auth.uid())
UNION
 SELECT sessions.id
   FROM public.sessions
  WHERE (sessions.owner_id = auth.uid()))));
drop policy if exists "session members send chat" on "public"."chat_messages";



  create policy "session members send chat"
  on "public"."chat_messages"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND (session_id IN ( SELECT session_members.session_id
   FROM public.session_members
  WHERE (session_members.user_id = auth.uid())
UNION
 SELECT sessions.id
   FROM public.sessions
  WHERE (sessions.owner_id = auth.uid())))));
drop policy if exists "session members insert own annotations" on "public"."dice_roll_annotations";



  create policy "session members insert own annotations"
  on "public"."dice_roll_annotations"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.session_members
  WHERE ((session_members.session_id = dice_roll_annotations.session_id) AND (session_members.user_id = auth.uid()))))));
drop policy if exists "session members read annotations" on "public"."dice_roll_annotations";



  create policy "session members read annotations"
  on "public"."dice_roll_annotations"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.session_members
  WHERE ((session_members.session_id = dice_roll_annotations.session_id) AND (session_members.user_id = auth.uid())))));
drop policy if exists "dice_rolls_insert" on "public"."dice_rolls";



  create policy "dice_rolls_insert"
  on "public"."dice_rolls"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));
drop policy if exists "dice_rolls_select" on "public"."dice_rolls";



  create policy "dice_rolls_select"
  on "public"."dice_rolls"
  as permissive
  for select
  to authenticated
using (true);
drop policy if exists "dungeon_corridors_auth" on "public"."dungeon_corridors";



  create policy "dungeon_corridors_auth"
  on "public"."dungeon_corridors"
  as permissive
  for all
  to authenticated
using (true)
with check (true);
drop policy if exists "dungeon_notes_delete" on "public"."dungeon_element_notes";



  create policy "dungeon_notes_delete"
  on "public"."dungeon_element_notes"
  as permissive
  for delete
  to authenticated
using ((user_id = auth.uid()));
drop policy if exists "dungeon_notes_insert" on "public"."dungeon_element_notes";



  create policy "dungeon_notes_insert"
  on "public"."dungeon_element_notes"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));
drop policy if exists "dungeon_notes_select" on "public"."dungeon_element_notes";



  create policy "dungeon_notes_select"
  on "public"."dungeon_element_notes"
  as permissive
  for select
  to authenticated
using (true);
drop policy if exists "dungeon_notes_update" on "public"."dungeon_element_notes";



  create policy "dungeon_notes_update"
  on "public"."dungeon_element_notes"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()));
drop policy if exists "dungeon_rooms_auth" on "public"."dungeon_rooms";



  create policy "dungeon_rooms_auth"
  on "public"."dungeon_rooms"
  as permissive
  for all
  to authenticated
using (true)
with check (true);
drop policy if exists "dungeons_auth" on "public"."dungeons";



  create policy "dungeons_auth"
  on "public"."dungeons"
  as permissive
  for all
  to authenticated
using (true)
with check (true);
drop policy if exists "hex_cells_auth" on "public"."hex_cells";



  create policy "hex_cells_auth"
  on "public"."hex_cells"
  as permissive
  for all
  to authenticated
using (true)
with check (true);
drop policy if exists "hex_notes_delete" on "public"."hex_notes";



  create policy "hex_notes_delete"
  on "public"."hex_notes"
  as permissive
  for delete
  to authenticated
using ((user_id = auth.uid()));
drop policy if exists "hex_notes_insert" on "public"."hex_notes";



  create policy "hex_notes_insert"
  on "public"."hex_notes"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));
drop policy if exists "hex_notes_select" on "public"."hex_notes";



  create policy "hex_notes_select"
  on "public"."hex_notes"
  as permissive
  for select
  to authenticated
using (true);
drop policy if exists "hex_notes_update" on "public"."hex_notes";



  create policy "hex_notes_update"
  on "public"."hex_notes"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()));
drop policy if exists "session owner manages map drafts" on "public"."map_drafts";



  create policy "session owner manages map drafts"
  on "public"."map_drafts"
  as permissive
  for all
  to public
using ((session_id IN ( SELECT sessions.id
   FROM public.sessions
  WHERE (sessions.owner_id = auth.uid()))))
with check ((session_id IN ( SELECT sessions.id
   FROM public.sessions
  WHERE (sessions.owner_id = auth.uid()))));
drop policy if exists "maps_delete" on "public"."maps";



  create policy "maps_delete"
  on "public"."maps"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.sessions
  WHERE ((sessions.id = maps.session_id) AND (sessions.owner_id = auth.uid())))));
drop policy if exists "maps_insert" on "public"."maps";



  create policy "maps_insert"
  on "public"."maps"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.sessions
  WHERE ((sessions.id = maps.session_id) AND (sessions.owner_id = auth.uid())))));
drop policy if exists "maps_select" on "public"."maps";



  create policy "maps_select"
  on "public"."maps"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM (public.sessions s
     LEFT JOIN public.session_members sm ON (((sm.session_id = s.id) AND (sm.user_id = auth.uid()))))
  WHERE ((s.id = maps.session_id) AND ((s.owner_id = auth.uid()) OR (sm.user_id IS NOT NULL))))));
drop policy if exists "maps_update" on "public"."maps";



  create policy "maps_update"
  on "public"."maps"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.sessions
  WHERE ((sessions.id = maps.session_id) AND (sessions.owner_id = auth.uid())))));
drop policy if exists "session_members_insert" on "public"."session_members";



  create policy "session_members_insert"
  on "public"."session_members"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));
drop policy if exists "session_members_select" on "public"."session_members";



  create policy "session_members_select"
  on "public"."session_members"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));
drop policy if exists "session_members_update" on "public"."session_members";



  create policy "session_members_update"
  on "public"."session_members"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()));
drop policy if exists "sessions_delete" on "public"."sessions";



  create policy "sessions_delete"
  on "public"."sessions"
  as permissive
  for delete
  to authenticated
using ((owner_id = auth.uid()));
drop policy if exists "sessions_insert" on "public"."sessions";



  create policy "sessions_insert"
  on "public"."sessions"
  as permissive
  for insert
  to authenticated
with check ((owner_id = auth.uid()));
drop policy if exists "sessions_select" on "public"."sessions";



  create policy "sessions_select"
  on "public"."sessions"
  as permissive
  for select
  to authenticated
using (true);
drop policy if exists "sessions_update" on "public"."sessions";



  create policy "sessions_update"
  on "public"."sessions"
  as permissive
  for update
  to authenticated
using ((owner_id = auth.uid()));


DROP TRIGGER IF EXISTS touch_characters ON public.characters;
CREATE TRIGGER touch_characters BEFORE UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_dungeon_corridors ON public.dungeon_corridors;
CREATE TRIGGER touch_dungeon_corridors BEFORE UPDATE ON public.dungeon_corridors FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_dungeon_element_notes ON public.dungeon_element_notes;
CREATE TRIGGER touch_dungeon_element_notes BEFORE UPDATE ON public.dungeon_element_notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_dungeon_rooms ON public.dungeon_rooms;
CREATE TRIGGER touch_dungeon_rooms BEFORE UPDATE ON public.dungeon_rooms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_dungeons ON public.dungeons;
CREATE TRIGGER touch_dungeons BEFORE UPDATE ON public.dungeons FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_hex_cells ON public.hex_cells;
CREATE TRIGGER touch_hex_cells BEFORE UPDATE ON public.hex_cells FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_hex_notes ON public.hex_notes;
CREATE TRIGGER touch_hex_notes BEFORE UPDATE ON public.hex_notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_sessions ON public.sessions;
CREATE TRIGGER touch_sessions BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
drop policy if exists "authenticated upload to bug-screenshots" on "storage"."objects";


  create policy "authenticated upload to bug-screenshots"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'bug-screenshots'::text));
drop policy if exists "owner can read own screenshots" on "storage"."objects";



  create policy "owner can read own screenshots"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'bug-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
drop policy if exists "session_maps_delete" on "storage"."objects";



  create policy "session_maps_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'session-maps'::text) AND ((storage.foldername(name))[1] IN ( SELECT (sessions.id)::text AS id
   FROM public.sessions
  WHERE (sessions.owner_id = auth.uid())))));
drop policy if exists "session_maps_insert" on "storage"."objects";



  create policy "session_maps_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'session-maps'::text) AND ((storage.foldername(name))[1] IN ( SELECT (sessions.id)::text AS id
   FROM public.sessions
  WHERE (sessions.owner_id = auth.uid())))));
drop policy if exists "session_maps_select" on "storage"."objects";



  create policy "session_maps_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'session-maps'::text));



