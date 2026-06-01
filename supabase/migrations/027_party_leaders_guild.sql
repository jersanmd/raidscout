ALTER TABLE public.death_records ADD COLUMN IF NOT EXISTS party_leaders JSONB DEFAULT '{}';
-- party_leaders format: {"guild_id": "member_id", ...}
-- Maps guild IDs to party leader member IDs
