-- seed.sql
-- LordNine Boss Timer — seed data for all 48 bosses

insert into bosses (name, spawn_type, respawn_hours, schedule) values
-- ── Fixed Hours (22 bosses) ─────────────────────────────────
('Venatus',         'fixed_hours', 10, null),
('Viorent',         'fixed_hours', 10, null),
('Ego',             'fixed_hours', 21, null),
('Livera',          'fixed_hours', 24, null),
('Araneo',          'fixed_hours', 24, null),
('Undomiel',        'fixed_hours', 24, null),
('Lady Dalia',      'fixed_hours', 18, null),
('General Aquleus', 'fixed_hours', 29, null),
('Amentis',         'fixed_hours', 29, null),
('Baron',           'fixed_hours', 32, null),
('Wannitas',        'fixed_hours', 48, null),
('Metus',           'fixed_hours', 48, null),
('Duplican',        'fixed_hours', 48, null),
('Shuliar',         'fixed_hours', 35, null),
('Gareth',          'fixed_hours', 32, null),
('Titore',          'fixed_hours', 37, null),
('Larba',           'fixed_hours', 35, null),
('Catena',          'fixed_hours', 35, null),
('Secreta',         'fixed_hours', 62, null),
('Ordo',            'fixed_hours', 62, null),
('Asta',            'fixed_hours', 62, null),
('Supore',          'fixed_hours', 62, null),

-- ── Fixed Schedule, Single Slot (8 bosses) ───────────────────
('Milavy',         'fixed_schedule', null, '[{"day":6,"time":"15:00"}]'),
('Ringor',         'fixed_schedule', null, '[{"day":6,"time":"17:00"}]'),
('Roderick',       'fixed_schedule', null, '[{"day":5,"time":"19:00"}]'),
('Chaiflock',      'fixed_schedule', null, '[{"day":0,"time":"15:00"}]'),
('Benji',          'fixed_schedule', null, '[{"day":0,"time":"21:00"}]'),
('Nevaeh',         'fixed_schedule', null, '[{"day":0,"time":"22:00"}]'),
('Tumier',         'fixed_schedule', null, '[{"day":0,"time":"19:00"}]'),
('Lucus',          'fixed_schedule', null, '[{"day":6,"time":"22:00"}]'),

-- ── Fixed Schedule, Split Multi-Slot (18 bosses) ─────────────
('Clemantis · Mon', 'fixed_schedule', null, '[{"day":1,"time":"11:30"}]'),
('Clemantis · Thu', 'fixed_schedule', null, '[{"day":4,"time":"19:00"}]'),
('Saphirus · Sun',  'fixed_schedule', null, '[{"day":0,"time":"17:00"}]'),
('Saphirus · Tue',  'fixed_schedule', null, '[{"day":2,"time":"11:30"}]'),
('Neutro · Tue',    'fixed_schedule', null, '[{"day":2,"time":"19:00"}]'),
('Neutro · Thu',    'fixed_schedule', null, '[{"day":4,"time":"11:30"}]'),
('Thymele · Mon',   'fixed_schedule', null, '[{"day":1,"time":"19:00"}]'),
('Thymele · Wed',   'fixed_schedule', null, '[{"day":3,"time":"11:30"}]'),
('Auraq · Wed',     'fixed_schedule', null, '[{"day":3,"time":"21:00"}]'),
('Auraq · Fri',     'fixed_schedule', null, '[{"day":5,"time":"22:00"}]'),
('Libitina · Mon',  'fixed_schedule', null, '[{"day":1,"time":"21:00"}]'),
('Libitina · Sat',  'fixed_schedule', null, '[{"day":6,"time":"21:00"}]'),
('Rakajeth · Sun',  'fixed_schedule', null, '[{"day":0,"time":"19:00"}]'),
('Rakajeth · Tue',  'fixed_schedule', null, '[{"day":2,"time":"22:00"}]'),
('Icaruthia · Tue', 'fixed_schedule', null, '[{"day":2,"time":"21:00"}]'),
('Icaruthia · Fri', 'fixed_schedule', null, '[{"day":5,"time":"21:00"}]'),
('Motti · Wed',     'fixed_schedule', null, '[{"day":3,"time":"19:00"}]'),
('Motti · Sat',     'fixed_schedule', null, '[{"day":6,"time":"19:00"}]')
on conflict (name) do nothing;
