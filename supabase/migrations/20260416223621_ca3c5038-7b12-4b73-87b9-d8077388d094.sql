-- Make bucket private to avoid public listing
UPDATE storage.buckets SET public = false WHERE id = 'whatsapp-media';

-- Replace broad SELECT policy with owner-only access
DROP POLICY IF EXISTS "Public read whatsapp-media" ON storage.objects;

CREATE POLICY "Users read own whatsapp-media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);