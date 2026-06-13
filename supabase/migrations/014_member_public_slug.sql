-- Migration 014: Add public_slug to members for masked public profile URLs
-- Used by the Discord bot to share masked member profile links

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS public_slug TEXT UNIQUE;

-- Generate slugs for existing members (random 12-char alphanumeric)
UPDATE public.members
  SET public_slug = substr(md5(random()::text || id::text), 1, 12)
  WHERE public_slug IS NULL;

-- Make the column NOT NULL and add a default for new members
ALTER TABLE public.members
  ALTER COLUMN public_slug SET NOT NULL,
  ALTER COLUMN public_slug SET DEFAULT substr(md5(random()::text || gen_random_uuid()::text), 1, 12);
