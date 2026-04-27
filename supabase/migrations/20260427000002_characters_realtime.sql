ALTER TABLE public.characters REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;
