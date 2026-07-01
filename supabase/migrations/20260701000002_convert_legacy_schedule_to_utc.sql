-- Convert legacy seed boss schedule times from Asia/Manila (GMT+8) to UTC
-- Legacy bosses: is_custom=false, template_id IS NULL, spawn_type='fixed_schedule'
DO $$
DECLARE
  rec record;
  slot record;
  new_slots jsonb;
  old_h int; old_m int; total_min int;
  new_total int; new_h int; new_m int; day_offset int;
BEGIN
  FOR rec IN
    SELECT id, name, schedule FROM public.bosses
    WHERE spawn_type = 'fixed_schedule'
      AND is_custom IS NOT TRUE
      AND template_id IS NULL
      AND schedule IS NOT NULL
  LOOP
    new_slots := '[]'::jsonb;
    FOR slot IN SELECT * FROM jsonb_to_recordset(rec.schedule) AS s(day int, "time" text)
    LOOP
      -- Parse HH:MM
      old_h := split_part(slot."time", ':', 1)::int;
      old_m := split_part(slot."time", ':', 2)::int;
      -- Convert to minutes, subtract 8h (480 min), wrap around 24h
      total_min := old_h * 60 + old_m - 480;
      day_offset := 0;
      WHILE total_min < 0 LOOP
        total_min := total_min + 1440;
        day_offset := day_offset - 1;
      END LOOP;
      WHILE total_min >= 1440 LOOP
        total_min := total_min - 1440;
        day_offset := day_offset + 1;
      END LOOP;
      new_h := total_min / 60;
      new_m := total_min % 60;
      new_slots := new_slots || jsonb_build_object(
        'day', slot.day + day_offset,
        'time', lpad(new_h::text, 2, '0') || ':' || lpad(new_m::text, 2, '0')
      );
    END LOOP;
    UPDATE public.bosses SET schedule = new_slots WHERE id = rec.id;
    RAISE NOTICE 'Updated %: % → %', rec.name, rec.schedule, new_slots;
  END LOOP;
END;
$$;
