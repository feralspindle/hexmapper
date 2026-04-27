-- Ensure the reference-photos storage bucket exists and is public.
-- The previous migration only added RLS policies but never created the bucket,
-- so getPublicUrl() returns URLs that 403 on private/missing buckets.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reference-photos',
  'reference-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET public = true;
