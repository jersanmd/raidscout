-- Fix Thymele schedule times across all servers
-- Monday 7:00 PM GMT+8 = 11:00 UTC (day 1 = Monday)
-- Wednesday 11:30 AM GMT+8 = 03:30 UTC (day 3 = Wednesday)
UPDATE bosses
SET schedule = '[{"day":1,"time":"11:00"},{"day":3,"time":"03:30"}]'::jsonb
WHERE name = 'Thymele'
  AND spawn_type = 'fixed_schedule';
