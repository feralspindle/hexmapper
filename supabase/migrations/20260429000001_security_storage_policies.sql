-- =============================================================================
-- STORAGE SECURITY: Fix bucket policies so users are scoped to their own
-- folders and session-level access requires membership.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- bug-screenshots: scope uploads to per-user folder (auth.uid() as first segment)
-- ---------------------------------------------------------------------------

drop policy if exists "authenticated upload to bug-screenshots" on storage.objects;
drop policy if exists "bug_screenshots_insert" on storage.objects;

create policy "bug_screenshots_insert"
  on storage.objects as permissive for insert to authenticated
  with check (
    bucket_id = 'bug-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- The existing per-user SELECT policy is correct — keep it:
-- "owner can read own screenshots": using (bucket_id = 'bug-screenshots' AND uid()::text = foldername[1])

-- ---------------------------------------------------------------------------
-- dungeon-images: restrict upload and delete to the session GM.
-- Path convention: {session_id}/{dungeon_id}/filename
-- ---------------------------------------------------------------------------

drop policy if exists "Authenticated users can upload dungeon images" on storage.objects;
drop policy if exists "Authenticated users can delete dungeon images" on storage.objects;
-- "Public access to dungeon images" SELECT policy stays: images need to be
-- embeddable via <img src> without auth headers.
drop policy if exists "dungeon_images_gm_insert" on storage.objects;

create policy "dungeon_images_gm_insert"
  on storage.objects as permissive for insert to authenticated
  with check (
    bucket_id = 'dungeon-images'
    and exists (
      select 1 from public.sessions s
      where s.id = (storage.foldername(name))[1]::uuid
        and s.owner_id = auth.uid()
    )
  );
drop policy if exists "dungeon_images_gm_delete" on storage.objects;

create policy "dungeon_images_gm_delete"
  on storage.objects as permissive for delete to authenticated
  using (
    bucket_id = 'dungeon-images'
    and exists (
      select 1 from public.sessions s
      where s.id = (storage.foldername(name))[1]::uuid
        and s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- reference-photos: restrict uploads to per-user folder within session
-- Path convention: {session_id}/{uuid}.{ext}  (set by photoStore.uploadPhoto)
-- The bucket is public so the SELECT policy from the bucket-level suffices.
-- ---------------------------------------------------------------------------

drop policy if exists "authenticated users can upload reference photos" on storage.objects;
drop policy if exists "owner can delete reference photos from storage"  on storage.objects;
-- "anyone can read reference photos" stays: public bucket, img src needs no auth.
drop policy if exists "ref_photos_member_insert" on storage.objects;

create policy "ref_photos_member_insert"
  on storage.objects as permissive for insert to authenticated
  with check (
    bucket_id = 'reference-photos'
    and exists (
      select 1 from public.sessions s
      left join public.session_members sm
        on sm.session_id = s.id and sm.user_id = auth.uid()
      where s.id = (storage.foldername(name))[1]::uuid
        and (s.owner_id = auth.uid() or sm.user_id is not null)
    )
  );
drop policy if exists "ref_photos_owner_delete" on storage.objects;

create policy "ref_photos_owner_delete"
  on storage.objects as permissive for delete to authenticated
  using (
    bucket_id = 'reference-photos'
    and auth.uid() = owner
  );

-- ---------------------------------------------------------------------------
-- session-maps: restrict SELECT to session members (was open to all authenticated)
-- ---------------------------------------------------------------------------

drop policy if exists "session_maps_select" on storage.objects;
drop policy if exists "session_maps_select" on storage.objects;

create policy "session_maps_select"
  on storage.objects as permissive for select to authenticated
  using (
    bucket_id = 'session-maps'
    and exists (
      select 1 from public.sessions s
      left join public.session_members sm
        on sm.session_id = s.id and sm.user_id = auth.uid()
      where s.id = (storage.foldername(name))[1]::uuid
        and (s.owner_id = auth.uid() or sm.user_id is not null)
    )
  );
