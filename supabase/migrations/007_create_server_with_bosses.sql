-- 006_create_server_with_bosses.sql
-- RPC that creates a new server and seeds all 39 bosses in a transaction.
-- Previously existed only in the database; now tracked here for source control.

CREATE OR REPLACE FUNCTION create_server_with_bosses(server_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  srv_id UUID;
  invite TEXT;
BEGIN
  invite := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
  
  INSERT INTO public.servers (name, owner_id, invite_code)
  VALUES (server_name, auth.uid(), invite)
  RETURNING id INTO srv_id;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (srv_id, auth.uid(), 'owner');

  -- Seed 39 default bosses (22 fixed_hours + 17 fixed_schedule)
  INSERT INTO public.bosses (server_id, name, spawn_type, respawn_hours, schedule)
  VALUES 
    (srv_id, 'Amentis', 'fixed_hours', 29, NULL),
    (srv_id, 'Araneo', 'fixed_hours', 24, NULL),
    (srv_id, 'Asta', 'fixed_hours', 62, NULL),
    (srv_id, 'Baron', 'fixed_hours', 32, NULL),
    (srv_id, 'Catena', 'fixed_hours', 35, NULL),
    (srv_id, 'Duplican', 'fixed_hours', 48, NULL),
    (srv_id, 'Ego', 'fixed_hours', 21, NULL),
    (srv_id, 'Gareth', 'fixed_hours', 32, NULL),
    (srv_id, 'General Aquleus', 'fixed_hours', 29, NULL),
    (srv_id, 'Lady Dalia', 'fixed_hours', 18, NULL),
    (srv_id, 'Larba', 'fixed_hours', 35, NULL),
    (srv_id, 'Livera', 'fixed_hours', 24, NULL),
    (srv_id, 'Metus', 'fixed_hours', 48, NULL),
    (srv_id, 'Ordo', 'fixed_hours', 62, NULL),
    (srv_id, 'Secreta', 'fixed_hours', 62, NULL),
    (srv_id, 'Shuliar', 'fixed_hours', 35, NULL),
    (srv_id, 'Supore', 'fixed_hours', 62, NULL),
    (srv_id, 'Titore', 'fixed_hours', 37, NULL),
    (srv_id, 'Undomiel', 'fixed_hours', 24, NULL),
    (srv_id, 'Venatus', 'fixed_hours', 10, NULL),
    (srv_id, 'Viorent', 'fixed_hours', 10, NULL),
    (srv_id, 'Wannitas', 'fixed_hours', 48, NULL),
    (srv_id, 'Auraq', 'fixed_schedule', NULL, '[{"day":5,"time":"22:00"},{"day":3,"time":"21:00"}]'::jsonb),
    (srv_id, 'Benji', 'fixed_schedule', NULL, '[{"day":0,"time":"21:00"}]'::jsonb),
    (srv_id, 'Chaiflock', 'fixed_schedule', NULL, '[{"day":0,"time":"15:00"}]'::jsonb),
    (srv_id, 'Clemantis', 'fixed_schedule', NULL, '[{"day":1,"time":"11:30"},{"day":4,"time":"19:00"}]'::jsonb),
    (srv_id, 'Icaruthia', 'fixed_schedule', NULL, '[{"day":2,"time":"21:00"},{"day":5,"time":"21:00"}]'::jsonb),
    (srv_id, 'Libitina', 'fixed_schedule', NULL, '[{"day":1,"time":"21:00"},{"day":6,"time":"21:00"}]'::jsonb),
    (srv_id, 'Lucus', 'fixed_schedule', NULL, '[{"day":6,"time":"22:00"}]'::jsonb),
    (srv_id, 'Milavy', 'fixed_schedule', NULL, '[{"day":6,"time":"15:00"}]'::jsonb),
    (srv_id, 'Motti', 'fixed_schedule', NULL, '[{"day":3,"time":"19:00"},{"day":6,"time":"19:00"}]'::jsonb),
    (srv_id, 'Neutro', 'fixed_schedule', NULL, '[{"day":2,"time":"19:00"},{"day":4,"time":"11:30"}]'::jsonb),
    (srv_id, 'Nevaeh', 'fixed_schedule', NULL, '[{"day":0,"time":"22:00"}]'::jsonb),
    (srv_id, 'Rakajeth', 'fixed_schedule', NULL, '[{"day":2,"time":"22:00"},{"day":0,"time":"19:00"}]'::jsonb),
    (srv_id, 'Ringor', 'fixed_schedule', NULL, '[{"day":6,"time":"17:00"}]'::jsonb),
    (srv_id, 'Roderick', 'fixed_schedule', NULL, '[{"day":5,"time":"19:00"}]'::jsonb),
    (srv_id, 'Saphirus', 'fixed_schedule', NULL, '[{"day":0,"time":"17:00"},{"day":2,"time":"11:30"}]'::jsonb),
    (srv_id, 'Thymele', 'fixed_schedule', NULL, '[{"day":1,"time":"11:00"},{"day":3,"time":"03:30"}]'::jsonb),
    (srv_id, 'Tumier', 'fixed_schedule', NULL, '[{"day":0,"time":"19:00"}]'::jsonb)
  ;

  RETURN jsonb_build_object('id', srv_id, 'name', server_name, 'invite_code', invite);
END;
$$;

GRANT EXECUTE ON FUNCTION create_server_with_bosses(text) TO authenticated;
