-- Seed audit log for "Yvonne 6"
-- auth.role() reads JWT, so use direct INSERT with SET ROLE to bypass RLS

SET ROLE service_role;

DO $$
DECLARE
  v_server_id UUID;
BEGIN
  SELECT id INTO v_server_id FROM servers WHERE name ILIKE '%Yvonne 6%' LIMIT 1;
  IF v_server_id IS NULL THEN RAISE EXCEPTION 'Server not found'; END IF;

  -- Boss Kill
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('boss_kill', v_server_id, '{"boss_name":"Ancient Dragon","attendees":5,"guild":"Red Dragons"}', now()),
  ('boss_kill', v_server_id, '{"boss_name":"Shadow Lord","attendees":12,"guild":"Blue Moon"}', now() - interval '10 min'),
  ('boss_kill', v_server_id, '{"boss_name":"Frost Wyrm","attendees":3}', now() - interval '20 min');

  -- Attendance Copy
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('attendance_copy', v_server_id, '{"copied":28,"skipped":2,"source_boss":"Ancient Dragon","target_boss":"Shadow Lord"}', now()),
  ('attendance_copy', v_server_id, '{"copied":5,"skipped":0,"source_boss":"Frost Wyrm","target_boss":"Iron Golem"}', now() - interval '10 min'),
  ('attendance_copy', v_server_id, '{"copied":14,"skipped":3,"source_boss":"Shadow Lord","target_boss":"Dark Knight"}', now() - interval '20 min');

  -- Member CP Add
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('member_cp_add', v_server_id, '{"player_name":"PressX","new_cp":113021}', now()),
  ('member_cp_add', v_server_id, '{"player_name":"DarkKnight99","new_cp":87500}', now() - interval '10 min'),
  ('member_cp_add', v_server_id, '{"player_name":"HealerQueen","new_cp":92450}', now() - interval '20 min');

  -- Member CP Update
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('member_cp_update', v_server_id, '{"player_name":"PressX","old_cp":100000,"new_cp":113021}', now()),
  ('member_cp_update', v_server_id, '{"player_name":"DarkKnight99","old_cp":82000,"new_cp":87500}', now() - interval '10 min'),
  ('member_cp_update', v_server_id, '{"player_name":"HealerQueen","old_cp":90000,"new_cp":92450}', now() - interval '20 min');

  -- Member CP Delete
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('member_cp_delete', v_server_id, '{"player_name":"OldPlayer"}', now());

  -- Moderator Add
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('moderator_add', v_server_id, '{"target_email":"alice@example.com"}', now()),
  ('moderator_add', v_server_id, '{"target_email":"bob@example.com"}', now() - interval '10 min'),
  ('moderator_add', v_server_id, '{"target_email":"charlie@example.com"}', now() - interval '20 min');

  -- Moderator Remove
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('moderator_remove', v_server_id, '{"target_email":"oldmod@example.com"}', now());

  -- Mod Perms Update
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('mod_perms_update', v_server_id, '{"target_email":"alice@example.com","can_record_death":true,"can_manage_members":false}', now());

  -- Ownership Transfer
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('ownership_transfer', v_server_id, '{"old_owner_id":"11111111-1111-1111-1111-111111111111","new_owner_id":"22222222-2222-2222-2222-222222222222"}', now()),
  ('ownership_transfer', v_server_id, '{"old_owner_id":"22222222-2222-2222-2222-222222222222","new_owner_id":"33333333-3333-3333-3333-333333333333"}', now() - interval '10 min');

  -- Settings Update
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('settings_update', v_server_id, '{"setting":"notification_channel"}', now()),
  ('settings_update', v_server_id, '{"setting":"command_channel"}', now() - interval '10 min'),
  ('settings_update', v_server_id, '{"setting":"thread_channel"}', now() - interval '20 min'),
  ('settings_update', v_server_id, '{"setting":"server_name","value":"Yvonne 6 Reloaded"}', now() - interval '30 min');

  -- Server Create / Restore
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('server_create', v_server_id, '{"server_name":"Yvonne 6"}', now() - interval '90 days'),
  ('server_restore', v_server_id, '{"server_name":"Yvonne 6"}', now() - interval '60 days');

  -- Boss Create / Update / Delete / Toggle
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('boss_create', v_server_id, '{"boss_name":"Iron Golem"}', now()),
  ('boss_update', v_server_id, '{"boss_name":"Iron Golem","respawn_hours":48}', now() - interval '5 min'),
  ('boss_delete', v_server_id, '{"boss_name":"Old Boss"}', now() - interval '10 min'),
  ('boss_toggle', v_server_id, '{"boss_name":"Ancient Dragon","enabled":false}', now() - interval '15 min'),
  ('boss_toggle', v_server_id, '{"boss_name":"Shadow Lord","enabled":true}', now() - interval '20 min');

  -- Boss Time Edit
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('boss_time_edit', v_server_id, '{"boss_name":"Ancient Dragon","new_time":"14:30"}', now()),
  ('boss_time_edit', v_server_id, '{"boss_name":"Frost Wyrm","new_time":"09:15"}', now() - interval '10 min'),
  ('boss_time_edit', v_server_id, '{"activity_name":"Raid Practice","new_time":"18:00"}', now() - interval '20 min');

  -- Activity Create / Update / Delete / Toggle
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('activity_create', v_server_id, '{"activity_name":"Guild War"}', now()),
  ('activity_update', v_server_id, '{"activity_name":"Guild War","points":50}', now() - interval '5 min'),
  ('activity_delete', v_server_id, '{"activity_name":"Old Activity"}', now() - interval '10 min'),
  ('activity_toggle', v_server_id, '{"activity_name":"Guild War","enabled":false}', now() - interval '15 min'),
  ('activity_toggle', v_server_id, '{"activity_name":"Raid Practice","enabled":false,"reason":"one_time_completed"}', now() - interval '20 min');

  -- Activity Finalize / Guilds / Rotation
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('activity_finalize', v_server_id, '{"activity_name":"Guild War"}', now()),
  ('activity_finalize', v_server_id, '{"activity_name":"Raid Practice"}', now() - interval '10 min'),
  ('activity_guilds_set', v_server_id, '{"activity_name":"Guild War"}', now() - interval '20 min'),
  ('activity_rotation_advance', v_server_id, '{"activity_name":"Guild War"}', now() - interval '30 min');

  -- Member Add / Remove
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('member_add', v_server_id, '{"member_name":"NewPlayer123"}', now()),
  ('member_add', v_server_id, '{"member_name":"ArcherPro"}', now() - interval '10 min'),
  ('member_remove', v_server_id, '{"member_name":"InactiveUser"}', now() - interval '20 min');

  -- Member Notes
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('member_note_add', v_server_id, '{"note_preview":"Excellent attendance. Promote to core team."}', now()),
  ('member_note_add', v_server_id, '{"note_preview":"Missed 3 raids. Warning issued."}', now() - interval '10 min'),
  ('member_note_delete', v_server_id, '{}', now() - interval '20 min');

  -- Gear
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('gear_equip', v_server_id, '{"slot_id":"abc12345-1234-5678-9abc-def012345678","enhancement":5}', now()),
  ('gear_equip', v_server_id, '{"slot_id":"def67890-5678-1234-abcd-ef0123456789"}', now() - interval '10 min'),
  ('gear_unequip', v_server_id, '{"slot_id":"ghi11111-2222-3333-4444-555555555555"}', now() - interval '20 min');

  -- Items
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('item_create', v_server_id, '{"item_name":"Rune Blade","type":"gear_catalog"}', now()),
  ('item_update', v_server_id, '{"item_name":"Rune Blade","rarity":"legendary"}', now() - interval '5 min'),
  ('item_delete', v_server_id, '{"item_name":"Old Sword"}', now() - interval '10 min'),
  ('item_distribute', v_server_id, '{"item_name":"Rune Blade","player_name":"PressX","quantity":1}', now() - interval '15 min'),
  ('item_distribute', v_server_id, '{"item_name":"Health Potion","player_name":"DarkKnight99","quantity":5}', now() - interval '20 min'),
  ('item_approve', v_server_id, '{"item_name":"Magic Staff"}', now() - interval '25 min'),
  ('item_reject', v_server_id, '{"item_name":"Broken Shield"}', now() - interval '30 min');

  -- Leaderboard
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('leaderboard_finalize', v_server_id, '{"period":"weekly","rankings":28}', now()),
  ('leaderboard_finalize', v_server_id, '{"period":"monthly","rankings":45}', now() - interval '1 day');

  -- Regens
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('invite_regenerate', v_server_id, '{}', now()),
  ('viewer_key_regenerate', v_server_id, '{}', now() - interval '10 min');

  -- Seed from Game
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('seed_from_game', v_server_id, '{"game_name":"LordNine","bosses":22,"activities":5}', now()),
  ('seed_from_game', v_server_id, '{"game_name":"CustomGame","bosses":10,"activities":3}', now() - interval '10 min');

  -- Force Spawn
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('force_spawn', v_server_id, '{"boss_name":"Ancient Dragon"}', now()),
  ('force_spawn', v_server_id, '{"boss_count":22}', now() - interval '10 min');

  -- Subscription
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('subscription_extend', v_server_id, '{"days":30,"server_name":"Yvonne 6"}', now());

  -- Rally
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('rally_image_delete', v_server_id, '{}', now());

  -- Discord bot commands
  INSERT INTO admin_audit_log (action, server_id, details, created_at)
  VALUES ('boss_kill', v_server_id, '{"boss_name":"Fire Drake","guild":"Red Dragons","discord_user":"DarkLord42"}', now()),
  ('force_spawn', v_server_id, '{"boss_name":"Lightning Bird","discord_user":"AdminBot"}', now() - interval '5 min'),
  ('settings_update', v_server_id, '{"setting":"notification_channel","discord_user":"DarkLord42"}', now() - interval '10 min'),
  ('boss_time_edit', v_server_id, '{"boss_name":"Fire Drake","new_time":"16:45","discord_user":"ModSara"}', now() - interval '15 min'),
  ('member_cp_update', v_server_id, '{"player_name":"PressX","new_cp":114500,"discord_user":"PressX"}', now() - interval '20 min');

  RAISE NOTICE 'Seeded ~80 audit entries for server %', v_server_id;
END $$;

RESET ROLE;
