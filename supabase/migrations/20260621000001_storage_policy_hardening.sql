-- Qualifying `name` through a sessions alias made the dungeon-image policies
-- parse the session's display name as a UUID instead of reading the object path.
-- Use the existing SECURITY DEFINER session helpers for all private/GM buckets.

drop policy if exists "dungeon_images_gm_insert" on storage.objects;
drop policy if exists "dungeon_images_gm_delete" on storage.objects;
drop policy if exists "dungeon_images_gm_insert" on storage.objects;

create policy "dungeon_images_gm_insert"
  on storage.objects as permissive for insert to authenticated
  with check (
    bucket_id = 'dungeon-images'
    and public.is_session_gm(((storage.foldername(name))[1])::uuid)
  );
drop policy if exists "dungeon_images_gm_delete" on storage.objects;

create policy "dungeon_images_gm_delete"
  on storage.objects as permissive for delete to authenticated
  using (
    bucket_id = 'dungeon-images'
    and public.is_session_gm(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "session_maps_insert" on storage.objects;
drop policy if exists "session_maps_delete" on storage.objects;
drop policy if exists "session_maps_insert" on storage.objects;

create policy "session_maps_insert"
  on storage.objects as permissive for insert to authenticated
  with check (
    bucket_id = 'session-maps'
    and public.is_session_gm(((storage.foldername(name))[1])::uuid)
  );
drop policy if exists "session_maps_delete" on storage.objects;

create policy "session_maps_delete"
  on storage.objects as permissive for delete to authenticated
  using (
    bucket_id = 'session-maps'
    and public.is_session_gm(((storage.foldername(name))[1])::uuid)
  );
