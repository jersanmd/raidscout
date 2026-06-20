-- 090: Add image_url column to bosses and activities tables

ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS image_url TEXT;
