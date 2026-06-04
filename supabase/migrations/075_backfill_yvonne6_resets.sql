-- Backfill leaderboard_reset_at from existing snapshots for Yvonne 6
-- These were saved but the app_settings RLS blocked the reset date upsert.

INSERT INTO app_settings (key, value, server_id)
VALUES 
  ('leaderboard_reset_at:PARAK', '2026-05-31T13:55:07.140702+00', 'b0379776-df4b-4b47-9cc3-52cbb7142948')
ON CONFLICT (key, server_id) DO UPDATE SET value = EXCLUDED.value;
