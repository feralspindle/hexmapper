-- Enable REPLICA IDENTITY FULL on tables that use UPDATE/DELETE realtime events
-- so the full row (not just changed columns) is available in the event payload
ALTER TABLE public.hex_cells   REPLICA IDENTITY FULL;
ALTER TABLE public.maps        REPLICA IDENTITY FULL;
ALTER TABLE public.sessions    REPLICA IDENTITY FULL;
ALTER TABLE public.rooms       REPLICA IDENTITY FULL;
ALTER TABLE public.corridors   REPLICA IDENTITY FULL;
ALTER TABLE public.dungeons    REPLICA IDENTITY FULL;
ALTER TABLE public.map_drafts  REPLICA IDENTITY FULL;

-- Add all tables that need realtime to the supabase_realtime publication
-- Uses a DO block to skip tables already in the publication
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'chat_messages',
    'dice_rolls',
    'dice_roll_annotations',
    'hex_cells',
    'maps',
    'sessions',
    'rooms',
    'corridors',
    'dungeons',
    'hex_notes',
    'dungeon_element_notes',
    'map_drafts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
