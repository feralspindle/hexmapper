-- per-user visibility toggles for the hex map marker layer and the dungeon
-- room-item layer
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS hex_show_markers   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dungeon_show_items boolean NOT NULL DEFAULT true;
