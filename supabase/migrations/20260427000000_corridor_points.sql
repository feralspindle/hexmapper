-- Add multi-point path support to corridors.
-- x1/y1/x2/y2 are kept for backward compatibility; points[] is the canonical
-- source when present (2+ entries).
ALTER TABLE public.dungeon_corridors
  ADD COLUMN IF NOT EXISTS points jsonb;
