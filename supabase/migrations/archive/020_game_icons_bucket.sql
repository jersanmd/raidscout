-- 020_game_icons_bucket: Storage bucket for game icon uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('game-icons', 'game-icons', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload game icons" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'game-icons');

-- Allow public read access
CREATE POLICY "Public can read game icons" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'game-icons');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete game icons" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'game-icons');
