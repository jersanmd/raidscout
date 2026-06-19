-- Seed audit log for "Yvonne 6" — runs as service_role to bypass RLS
BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_server_id UUID;
BEGIN
  SELECT id INTO v_server_id FROM servers WHERE name ILIKE '%Yvonne 6%' LIMIT 1;
  IF v_server_id IS NULL THEN RAISE EXCEPTION 'Server not found'; END IF;

  -- Boss Kill
  PERFORM write_audit_entry('boss_kill', v_server_id, NULL, NULL, '{"boss_name":"Ancient Dragon","attendees":5,"guild":"Red Dragons"}');
  PERFORM write_audit_entry('boss_kill', v_server_id, NULL, NULL, '{"boss_name":"Shadow Lord","attendees":12,"guild":"Blue Moon"}');
  PERFORM write_audit_entry('boss_kill', v_server_id, NULL, NULL, '{"boss_name":"Frost Wyrm","attendees":3}');

  -- Attendance Copy
  PERFORM write_audit_entry('attendance_copy', v_server_id, NULL, NULL, '{"copied":28,"skipped":2,"source_boss":"Ancient Dragon","target_boss":"Shadow Lord"}');
  PERFORM write_audit_entry('attendance_copy', v_server_id, NULL, NULL, '{"copied":5,"skipped":0,"source_boss":"Frost Wyrm","target_boss":"Iron Golem"}');
  PERFORM write_audit_entry('attendance_copy', v_server_id, NULL, NULL, '{"copied":14,"skipped":3,"source_boss":"Shadow Lord","target_boss":"Dark Knight"}');

  -- Member CP Add
  PERFORM write_audit_entry('member_cp_add', v_server_id, NULL, NULL, '{"player_name":"PressX","new_cp":113021}');
  PERFORM write_audit_entry('member_cp_add', v_server_id, NULL, NULL, '{"player_name":"DarkKnight99","new_cp":87500}');
  PERFORM write_audit_entry('member_cp_add', v_server_id, NULL, NULL, '{"player_name":"HealerQueen","new_cp":92450}');

  -- Member CP Update
  PERFORM write_audit_entry('member_cp_update', v_server_id, NULL, NULL, '{"player_name":"PressX","old_cp":100000,"new_cp":113021}');
  PERFORM write_audit_entry('member_cp_update', v_server_id, NULL, NULL, '{"player_name":"DarkKnight99","old_cp":82000,"new_cp":87500}');
  PERFORM write_audit_entry('member_cp_update', v_server_id, NULL, NULL, '{"player_name":"HealerQueen","old_cp":90000,"new_cp":92450}');

  -- Member CP Delete
  PERFORM write_audit_entry('member_cp_delete', v_server_id, NULL, NULL, '{"player_name":"OldPlayer"}');

  -- Moderator Add
  PERFORM write_audit_entry('moderator_add', v_server_id, NULL, NULL, '{"target_email":"alice@example.com"}');
  PERFORM write_audit_entry('moderator_add', v_server_id, NULL, NULL, '{"target_email":"bob@example.com"}');
  PERFORM write_audit_entry('moderator_add', v_server_id, NULL, NULL, '{"target_email":"charlie@example.com"}');

  -- Moderator Remove
  PERFORM write_audit_entry('moderator_remove', v_server_id, NULL, NULL, '{"target_email":"oldmod@example.com"}');

  -- Mod Perms Update
  PERFORM write_audit_entry('mod_perms_update', v_server_id, NULL, NULL, '{"target_email":"alice@example.com","can_record_death":true,"can_manage_members":false}');

  -- Ownership Transfer
  PERFORM write_audit_entry('ownership_transfer', v_server_id, NULL, NULL, '{"old_owner_id":"11111111-1111-1111-1111-111111111111","new_owner_id":"22222222-2222-2222-2222-222222222222"}');
  PERFORM write_audit_entry('ownership_transfer', v_server_id, NULL, NULL, '{"old_owner_id":"22222222-2222-2222-2222-222222222222","new_owner_id":"33333333-3333-3333-3333-333333333333"}');

  -- Settings Update
  PERFORM write_audit_entry('settings_update', v_server_id, NULL, NULL, '{"setting":"notification_channel"}');
  PERFORM write_audit_entry('settings_update', v_server_id, NULL, NULL, '{"setting":"command_channel"}');
  PERFORM write_audit_entry('settings_update', v_server_id, NULL, NULL, '{"setting":"thread_channel"}');
  PERFORM write_audit_entry('settings_update', v_server_id, NULL, NULL, '{"setting":"server_name","value":"Yvonne 6 Reloaded"}');

  -- Server Create / Restore
  PERFORM write_audit_entry('server_create', v_server_id, NULL, NULL, '{"server_name":"Yvonne 6"}');
  PERFORM write_audit_entry('server_restore', v_server_id, NULL, NULL, '{"server_name":"Yvonne 6"}');

  -- Boss Create / Update / Delete / Toggle
  PERFORM write_audit_entry('boss_create', v_server_id, NULL, NULL, '{"boss_name":"Iron Golem"}');
  PERFORM write_audit_entry('boss_update', v_server_id, NULL, NULL, '{"boss_name":"Iron Golem","respawn_hours":48}');
  PERFORM write_audit_entry('boss_delete', v_server_id, NULL, NULL, '{"boss_name":"Old Boss"}');
  PERFORM write_audit_entry('boss_toggle', v_server_id, NULL, NULL, '{"boss_name":"Ancient Dragon","enabled":false}');
  PERFORM write_audit_entry('boss_toggle', v_server_id, NULL, NULL, '{"boss_name":"Shadow Lord","enabled":true}');

  -- Boss Time Edit
  PERFORM write_audit_entry('boss_time_edit', v_server_id, NULL, NULL, '{"boss_name":"Ancient Dragon","new_time":"14:30"}');
  PERFORM write_audit_entry('boss_time_edit', v_server_id, NULL, NULL, '{"boss_name":"Frost Wyrm","new_time":"09:15"}');
  PERFORM write_audit_entry('boss_time_edit', v_server_id, NULL, NULL, '{"activity_name":"Raid Practice","new_time":"18:00"}');

  -- Activity Create / Update / Delete / Toggle
  PERFORM write_audit_entry('activity_create', v_server_id, NULL, NULL, '{"activity_name":"Guild War"}');
  PERFORM write_audit_entry('activity_update', v_server_id, NULL, NULL, '{"activity_name":"Guild War","points":50}');
  PERFORM write_audit_entry('activity_delete', v_server_id, NULL, NULL, '{"activity_name":"Old Activity"}');
  PERFORM write_audit_entry('activity_toggle', v_server_id, NULL, NULL, '{"activity_name":"Guild War","enabled":false}');
  PERFORM write_audit_entry('activity_toggle', v_server_id, NULL, NULL, '{"activity_name":"Raid Practice","enabled":false,"reason":"one_time_completed"}');

  -- Activity Finalize / Guilds / Rotation
  PERFORM write_audit_entry('activity_finalize', v_server_id, NULL, NULL, '{"activity_name":"Guild War"}');
  PERFORM write_audit_entry('activity_finalize', v_server_id, NULL, NULL, '{"activity_name":"Raid Practice"}');
  PERFORM write_audit_entry('activity_guilds_set', v_server_id, NULL, NULL, '{"activity_name":"Guild War"}');
  PERFORM write_audit_entry('activity_rotation_advance', v_server_id, NULL, NULL, '{"activity_name":"Guild War"}');

  -- Member Add / Remove
  PERFORM write_audit_entry('member_add', v_server_id, NULL, NULL, '{"member_name":"NewPlayer123"}');
  PERFORM write_audit_entry('member_add', v_server_id, NULL, NULL, '{"member_name":"ArcherPro"}');
  PERFORM write_audit_entry('member_remove', v_server_id, NULL, NULL, '{"member_name":"InactiveUser"}');

  -- Member Notes
  PERFORM write_audit_entry('member_note_add', v_server_id, NULL, NULL, '{"note_preview":"Excellent attendance. Promote to core team."}');
  PERFORM write_audit_entry('member_note_add', v_server_id, NULL, NULL, '{"note_preview":"Missed 3 raids. Warning issued."}');
  PERFORM write_audit_entry('member_note_delete', v_server_id, NULL, NULL, '{}');

  -- Gear
  PERFORM write_audit_entry('gear_equip', v_server_id, NULL, NULL, '{"slot_id":"abc12345-1234-5678-9abc-def012345678","enhancement":5}');
  PERFORM write_audit_entry('gear_equip', v_server_id, NULL, NULL, '{"slot_id":"def67890-5678-1234-abcd-ef0123456789"}');
  PERFORM write_audit_entry('gear_unequip', v_server_id, NULL, NULL, '{"slot_id":"ghi11111-2222-3333-4444-555555555555"}');

  -- Items
  PERFORM write_audit_entry('item_create', v_server_id, NULL, NULL, '{"item_name":"Rune Blade","type":"gear_catalog"}');
  PERFORM write_audit_entry('item_update', v_server_id, NULL, NULL, '{"item_name":"Rune Blade","rarity":"legendary"}');
  PERFORM write_audit_entry('item_delete', v_server_id, NULL, NULL, '{"item_name":"Old Sword"}');
  PERFORM write_audit_entry('item_distribute', v_server_id, NULL, NULL, '{"item_name":"Rune Blade","player_name":"PressX","quantity":1}');
  PERFORM write_audit_entry('item_distribute', v_server_id, NULL, NULL, '{"item_name":"Health Potion","player_name":"DarkKnight99","quantity":5}');
  PERFORM write_audit_entry('item_approve', v_server_id, NULL, NULL, '{"item_name":"Magic Staff"}');
  PERFORM write_audit_entry('item_reject', v_server_id, NULL, NULL, '{"item_name":"Broken Shield"}');

  -- Leaderboard
  PERFORM write_audit_entry('leaderboard_finalize', v_server_id, NULL, NULL, '{"period":"weekly","rankings":28}');
  PERFORM write_audit_entry('leaderboard_finalize', v_server_id, NULL, NULL, '{"period":"monthly","rankings":45}');

  -- Regens
  PERFORM write_audit_entry('invite_regenerate', v_server_id, NULL, NULL, '{}');
  PERFORM write_audit_entry('viewer_key_regenerate', v_server_id, NULL, NULL, '{}');

  -- Seed from Game
  PERFORM write_audit_entry('seed_from_game', v_server_id, NULL, NULL, '{"game_name":"LordNine","bosses":22,"activities":5}');
  PERFORM write_audit_entry('seed_from_game', v_server_id, NULL, NULL, '{"game_name":"CustomGame","bosses":10,"activities":3}');

  -- Force Spawn
  PERFORM write_audit_entry('force_spawn', v_server_id, NULL, NULL, '{"boss_name":"Ancient Dragon"}');
  PERFORM write_audit_entry('force_spawn', v_server_id, NULL, NULL, '{"boss_count":22}');

  -- Subscription
  PERFORM write_audit_entry('subscription_extend', v_server_id, NULL, NULL, '{"days":30,"server_name":"Yvonne 6"}');

  -- Rally
  PERFORM write_audit_entry('rally_image_delete', v_server_id, NULL, NULL, '{}');

  -- Discord bot commands (use RPC as admin)
  PERFORM write_audit_entry('boss_kill', v_server_id, NULL, NULL, '{"boss_name":"Fire Drake","guild":"Red Dragons","discord_user":"DarkLord42"}');
  PERFORM write_audit_entry('force_spawn', v_server_id, NULL, NULL, '{"boss_name":"Lightning Bird","discord_user":"AdminBot"}');
  PERFORM write_audit_entry('settings_update', v_server_id, NULL, NULL, '{"setting":"notification_channel","discord_user":"DarkLord42"}');
  PERFORM write_audit_entry('boss_time_edit', v_server_id, NULL, NULL, '{"boss_name":"Fire Drake","new_time":"16:45","discord_user":"ModSara"}');
  PERFORM write_audit_entry('member_cp_update', v_server_id, NULL, NULL, '{"player_name":"PressX","new_cp":114500,"discord_user":"PressX"}');

  RAISE NOTICE 'Seeded ~80 audit entries for server %', v_server_id;
END $$;

RESET ROLE;
COMMIT;
