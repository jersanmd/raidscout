-- Drop the old constraint and recreate with proper activity schedule types
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_schedule_type_check;

ALTER TABLE activities ADD CONSTRAINT activities_schedule_type_check 
  CHECK (schedule_type IN ('recurring', 'daily', 'weekly', 'fixed_schedule', 'one_time'));
