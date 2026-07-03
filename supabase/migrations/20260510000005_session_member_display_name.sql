ALTER TABLE public.session_members
  ADD COLUMN IF NOT EXISTS display_name text not null default 'Adventurer'::text;
drop trigger if exists trg_fill_display_name_session_members on public.session_members;

CREATE TRIGGER trg_fill_display_name_session_members
  BEFORE INSERT OR UPDATE ON public.session_members
  FOR EACH ROW EXECUTE FUNCTION fill_display_name();

-- Backfill existing rows through the trigger
UPDATE public.session_members SET last_seen_at = last_seen_at;
