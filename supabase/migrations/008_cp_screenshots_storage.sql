-- Migration: CP Screenshots Storage Bucket
-- Creates a public storage bucket for permanent CP update screenshots.
-- Run this in Supabase SQL Editor.

-- Create the bucket (public read, restricted write via RLS)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cp-screenshots',
  'cp-screenshots',
  true,
  10485760,  -- 10 MB max
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: anyone can read (public bucket)
CREATE POLICY "Public read cp-screenshots" ON storage.objects
  FOR SELECT USING (bucket_id = 'cp-screenshots');

-- RLS: only service role can insert (bot uploads via edge function)
CREATE POLICY "Service can insert cp-screenshots" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'cp-screenshots' AND auth.role() = 'service_role');
