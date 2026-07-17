-- reference-photos was public with an anon SELECT policy, so anyone could
-- list campaign images and harvest the session uuids embedded in object
-- paths (a session uuid doubles as a join invite). Make the bucket private
-- and scope reads to current session membership; clients switch to
-- short-lived signed urls.

update storage.buckets set public = false where id = 'reference-photos';

drop policy if exists "anyone can read reference photos" on storage.objects;
drop policy if exists "ref_photos_member_select" on storage.objects;

create policy "ref_photos_member_select"
  on storage.objects as permissive for select to authenticated
  using (
    bucket_id = 'reference-photos'
    and is_session_member((storage.foldername(name))[1]::uuid)
  );
