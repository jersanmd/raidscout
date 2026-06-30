-- Add index on activity_instances(activity_id) to fix slow nextspawn command
-- The bot queries activity_instances by activity_id batch on every nextspawn
-- Without this index, Postgres does a sequential scan of the entire table
CREATE INDEX IF NOT EXISTS idx_activity_instances_activity_id ON public.activity_instances(activity_id, start_time DESC);
