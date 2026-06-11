-- 105_activity_realtime.sql
-- Enable realtime for activity tables so UI updates instantly when bot records kills.

ALTER PUBLICATION supabase_realtime ADD TABLE activity_instances;
ALTER PUBLICATION supabase_realtime ADD TABLE activities;
