-- 159: Add notifications table to Realtime publication + set REPLICA IDENTITY
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
