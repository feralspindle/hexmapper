-- ref_photos_member_insert (storage.objects) was using the same inline LEFT JOIN
-- on sessions + session_members that was fixed for session_maps_select in
-- 20260503000000. Both tables have RLS active, which triggers recursive policy
-- evaluation. Replace with is_session_member() security definer helper.
-- Path convention: {session_id}/{uuid}.{ext}

drop policy if exists "ref_photos_member_insert" on storage.objects;
drop policy if exists "ref_photos_member_insert" on storage.objects;

create policy "ref_photos_member_insert"
  on storage.objects as permissive for insert to authenticated
  with check (
    bucket_id = 'reference-photos'
    and is_session_member((storage.foldername(name))[1]::uuid)
  );
