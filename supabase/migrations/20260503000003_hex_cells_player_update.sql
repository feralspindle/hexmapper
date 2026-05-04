-- Players had an INSERT policy (hex_cells_player_marker) but no UPDATE policy.
-- upsertHex uses ON CONFLICT DO UPDATE, so writing to an existing cell became
-- an UPDATE and hit a USING-expression RLS violation. Add the matching policy.

create policy "hex_cells_player_update" on hex_cells
  as permissive for update to authenticated
  using  (is_session_member(session_id))
  with check (is_session_member(session_id));
