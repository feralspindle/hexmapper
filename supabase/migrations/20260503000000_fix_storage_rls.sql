-- session_maps_select was using an inline LEFT JOIN on sessions + session_members
-- (both with RLS active), which triggers the same recursive policy evaluation
-- fixed elsewhere. Replace with is_session_member() security definer helper.
-- Path convention: {session_id}/filename

drop policy if exists "session_maps_select" on storage.objects;
drop policy if exists "session_maps_select" on storage.objects;

create policy "session_maps_select"
  on storage.objects as permissive for select to authenticated
  using (
    bucket_id = 'session-maps'
    and is_session_member((storage.foldername(name))[1]::uuid)
  );
