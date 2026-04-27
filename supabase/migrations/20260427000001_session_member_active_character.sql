-- Track each member's currently selected character so the party panel
-- can show the right character even when they're offline.
ALTER TABLE public.session_members
  ADD COLUMN IF NOT EXISTS active_character_id uuid
  REFERENCES public.characters(id) ON DELETE SET NULL;
