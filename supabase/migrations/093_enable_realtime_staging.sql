-- Enable realtime replication for staging tables
-- Run this on the staging Supabase project (aavobydtkonccgyfxrmw)

-- Add tables to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_instances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bosses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.death_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.boss_guilds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_guilds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.servers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.guilds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.static_parties;
ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;

-- Enable REPLICA IDENTITY FULL so UPDATE/DELETE events include full row data
ALTER TABLE public.activity_instances REPLICA IDENTITY FULL;
ALTER TABLE public.death_records REPLICA IDENTITY FULL;
ALTER TABLE public.bosses REPLICA IDENTITY FULL;
ALTER TABLE public.activities REPLICA IDENTITY FULL;
ALTER TABLE public.servers REPLICA IDENTITY FULL;
ALTER TABLE public.guilds REPLICA IDENTITY FULL;
