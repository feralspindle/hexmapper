-- torch_start: sets torch_running=true with a server-side timestamp
CREATE OR REPLACE FUNCTION torch_start(p_dungeon_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE dungeons
  SET torch_running    = true,
      torch_started_at = NOW()
  WHERE id = p_dungeon_id;
$$;

-- torch_pause: accumulates elapsed ms server-side so no client clock is involved
CREATE OR REPLACE FUNCTION torch_pause(p_dungeon_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE dungeons
  SET torch_elapsed_ms = LEAST(
        3600000,
        torch_elapsed_ms + (EXTRACT(EPOCH FROM (NOW() - torch_started_at)) * 1000)::bigint
      ),
      torch_running    = false,
      torch_started_at = NULL
  WHERE id = p_dungeon_id
    AND torch_running = true
    AND torch_started_at IS NOT NULL;
$$;

-- torch_reset: zeroes elapsed ms; if running, sets a fresh server-side started_at
CREATE OR REPLACE FUNCTION torch_reset(p_dungeon_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE dungeons
  SET torch_elapsed_ms = 0,
      torch_started_at = CASE WHEN torch_running THEN NOW() ELSE NULL END
  WHERE id = p_dungeon_id;
$$;
