-- 091: Allow authenticated users to upload to game-icons bucket

-- Allow authenticated inserts
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'game-icons');

-- Allow public reads
CREATE POLICY "Allow public reads" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'game-icons');
