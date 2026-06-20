-- Player SELECT access to hex_cells exposed unrevealed rows and gm_markers.
-- Player reads now go through the Rust API, which returns only revealed rows
-- and removes GM-only fields. GMs retain access through hex_cells_gm_all.

drop policy if exists "hex_cells_player_select" on public.hex_cells;

-- Hex-cell event payloads contain complete snapshots, so the event log would
-- otherwise remain an alternate path to hidden cells and gm_markers.
drop policy if exists "events_select" on public.events;

create policy "events_select" on public.events
  as permissive for select to authenticated
  using (
    session_id is null
    or (
      session_id is not null
      and (
        (aggregate_type = 'hex_cell' and is_session_gm(session_id))
        or
        (aggregate_type <> 'hex_cell' and is_session_member(session_id))
      )
    )
  );
