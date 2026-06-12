ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
