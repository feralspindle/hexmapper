-- user_preferences: per-user dungeon display settings persisted across sessions
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id              uuid         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dungeon_map_style    text         NOT NULL DEFAULT 'classic',
  dungeon_density      text         NOT NULL DEFAULT 'regular',
  dungeon_palette      text         NOT NULL DEFAULT 'candle',
  dungeon_icon_style   text         NOT NULL DEFAULT 'filled',
  dungeon_panel_layout text         NOT NULL DEFAULT 'right',
  dungeon_show_cursors boolean      NOT NULL DEFAULT true,
  updated_at           timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only read and write their own row
drop policy if exists "user_preferences: select own" on public.user_preferences;
CREATE POLICY "user_preferences: select own"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);
drop policy if exists "user_preferences: insert own" on public.user_preferences;

CREATE POLICY "user_preferences: insert own"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);
drop policy if exists "user_preferences: update own" on public.user_preferences;

CREATE POLICY "user_preferences: update own"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
