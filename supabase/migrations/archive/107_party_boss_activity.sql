-- 107_party_boss_activity: Link static parties to specific bosses or activities

-- Add optional boss/activity foreign keys
ALTER TABLE public.static_parties
  ADD COLUMN IF NOT EXISTS boss_id UUID REFERENCES public.bosses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL;

-- Drop old unique constraint and recreate with new columns
ALTER TABLE public.static_parties
  DROP CONSTRAINT IF EXISTS static_parties_server_id_guild_id_name_key;

-- Allow same party name across different bosses/activities
CREATE UNIQUE INDEX IF NOT EXISTS idx_static_parties_unique
  ON public.static_parties(server_id, COALESCE(guild_id, '00000000-0000-0000-0000-000000000000'), name, COALESCE(boss_id, '00000000-0000-0000-0000-000000000000'), COALESCE(activity_id, '00000000-0000-0000-0000-000000000000'));

-- Drop and recreate create_static_party RPC with new params
DROP FUNCTION IF EXISTS public.create_static_party(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.create_static_party(
  p_server_id UUID, p_name TEXT, p_guild_id UUID DEFAULT NULL,
  p_boss_id UUID DEFAULT NULL, p_activity_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.static_parties (server_id, guild_id, name, boss_id, activity_id)
  VALUES (p_server_id, p_guild_id, p_name, p_boss_id, p_activity_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- Update fetch_static_parties to return boss/activity info
DROP FUNCTION IF EXISTS public.fetch_static_parties(UUID);

CREATE OR REPLACE FUNCTION public.fetch_static_parties(p_server_id UUID)
RETURNS TABLE(
  id UUID, name TEXT, guild_id UUID, guild_name TEXT,
  boss_id UUID, boss_name TEXT,
  activity_id UUID, activity_name TEXT,
  member_ids UUID[], member_names TEXT[]
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    sp.id, sp.name, sp.guild_id,
    g.name AS guild_name,
    sp.boss_id,
    b.name AS boss_name,
    sp.activity_id,
    a.name AS activity_name,
    COALESCE(array_agg(spm.member_id) FILTER (WHERE spm.member_id IS NOT NULL), '{}') AS member_ids,
    COALESCE(array_agg(m.name) FILTER (WHERE m.name IS NOT NULL), '{}') AS member_names
  FROM public.static_parties sp
  LEFT JOIN public.guilds g ON g.id = sp.guild_id
  LEFT JOIN public.bosses b ON b.id = sp.boss_id
  LEFT JOIN public.activities a ON a.id = sp.activity_id
  LEFT JOIN public.static_party_members spm ON spm.party_id = sp.id
  LEFT JOIN public.members m ON m.id = spm.member_id
  WHERE sp.server_id = p_server_id
  GROUP BY sp.id, sp.name, sp.guild_id, g.name, sp.boss_id, b.name, sp.activity_id, a.name
  ORDER BY sp.name;
$$;
