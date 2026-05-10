CREATE TABLE IF NOT EXISTS public.dice_macros (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label      text        NOT NULL,
  pending    jsonb       NOT NULL,
  modifier   int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dice_macros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dice_macros: select own"
  ON public.dice_macros FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "dice_macros: insert own"
  ON public.dice_macros FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "dice_macros: delete own"
  ON public.dice_macros FOR DELETE
  USING (auth.uid() = user_id);
