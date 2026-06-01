-- ── Custom Command Aliases ────────────────────────────────
ALTER TABLE discord_configs ADD COLUMN IF NOT EXISTS command_aliases JSONB DEFAULT '{}'::jsonb;
