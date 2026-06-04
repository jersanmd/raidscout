UPDATE bosses SET schedule = '[{"day": 2, "time": "11:00"}, {"day": 4, "time": "03:30"}]'::jsonb WHERE name = 'Neutro' AND spawn_type = 'fixed_schedule';
