-- 017_find_daily_slot: Helper function for daily-recurring activities

CREATE OR REPLACE FUNCTION public.find_next_daily_slot(
  p_last_time TIMESTAMPTZ,
  p_time_str TEXT -- "HH:MM"
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  hh INTEGER;
  mm INTEGER;
  result TIMESTAMPTZ;
BEGIN
  hh := split_part(p_time_str, ':', 1)::INTEGER;
  mm := split_part(p_time_str, ':', 2)::INTEGER;
  
  -- Next day at the specified time
  result := date_trunc('day', p_last_time) + INTERVAL '1 day' + (hh || ' hours')::INTERVAL + (mm || ' minutes')::INTERVAL;
  
  RETURN result;
END;
$$;
