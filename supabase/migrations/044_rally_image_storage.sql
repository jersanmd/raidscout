-- 015_rally_image_storage.sql
-- Create storage bucket for rally screenshots

-- Create the bucket (public access for reading)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rally-images', 'rally-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read rally images
DROP POLICY IF EXISTS "Public read rally images" ON storage.objects;
CREATE POLICY "Public read rally images" ON storage.objects
  FOR SELECT USING (bucket_id = 'rally-images');

-- Allow authenticated users to upload
DROP POLICY IF EXISTS "Authenticated insert rally images" ON storage.objects;
CREATE POLICY "Authenticated insert rally images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rally-images');

-- Allow authenticated users to update/delete their own uploads
DROP POLICY IF EXISTS "Authenticated update rally images" ON storage.objects;
CREATE POLICY "Authenticated update rally images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'rally-images');

DROP POLICY IF EXISTS "Authenticated delete rally images" ON storage.objects;
CREATE POLICY "Authenticated delete rally images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'rally-images');
