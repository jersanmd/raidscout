-- 110: Fix activity schedule_type constraint + add schedule_tz column
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_schedule_type_check;

ALTER TABLE public.activities ADD CONSTRAINT activities_schedule_type_check 
  CHECK (schedule_type IN ('fixed_hours', 'fixed_schedule', 'one_time'));

ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS schedule_tz TEXT;
