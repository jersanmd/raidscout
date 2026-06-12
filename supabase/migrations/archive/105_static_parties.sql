-- 105_static_parties: Pre-defined member groups for quick attendance selection

-- Parties table (server-wide or guild-scoped)
CREATE TABLE IF NOT EXISTS public.static_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  guild_id UUID REFERENCES public.guilds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, guild_id, name)
);

CREATE INDEX IF NOT EXISTS idx_static_parties_server ON static_parties(server_id);

-- Party members (exclusive: one party per member)
CREATE TABLE IF NOT EXISTS public.static_party_members (
  party_id UUID NOT NULL REFERENCES public.static_parties(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  PRIMARY KEY (party_id, member_id),
  UNIQUE(member_id)  -- exclusive membership
);

CREATE INDEX IF NOT EXISTS idx_static_party_members_member ON static_party_members(member_id);

ALTER TABLE public.static_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.static_party_members ENABLE ROW LEVEL SECURITY;

-- RLS: server members can read parties
CREATE POLICY "Server members can read static parties" ON public.static_parties
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = static_parties.server_id AND user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Server members can read party members" ON public.static_party_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.static_parties sp
      JOIN public.server_members sm ON sm.server_id = sp.server_id AND sm.user_id = auth.uid()
      WHERE sp.id = static_party_members.party_id)
    OR public.is_admin()
  );

-- RPC: Create a party
CREATE OR REPLACE FUNCTION public.create_static_party(
  p_server_id UUID, p_name TEXT, p_guild_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.static_parties (server_id, guild_id, name)
  VALUES (p_server_id, p_guild_id, p_name)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- RPC: Delete a party
CREATE OR REPLACE FUNCTION public.delete_static_party(p_party_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.static_parties WHERE id = p_party_id;
END; $$;

-- RPC: Add a member to a party (removes from any existing party first)
CREATE OR REPLACE FUNCTION public.add_member_to_party(
  p_party_id UUID, p_member_id UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Remove from any other party first (exclusive)
  DELETE FROM public.static_party_members WHERE member_id = p_member_id;
  -- Add to target party
  INSERT INTO public.static_party_members (party_id, member_id)
  VALUES (p_party_id, p_member_id);
END; $$;

-- RPC: Remove a member from their party
CREATE OR REPLACE FUNCTION public.remove_member_from_party(p_member_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.static_party_members WHERE member_id = p_member_id;
END; $$;

-- RPC: Fetch all parties with member lists for a server
CREATE OR REPLACE FUNCTION public.fetch_static_parties(p_server_id UUID)
RETURNS TABLE(
  id UUID, name TEXT, guild_id UUID, guild_name TEXT,
  member_ids UUID[], member_names TEXT[]
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    sp.id, sp.name, sp.guild_id,
    g.name AS guild_name,
    COALESCE(array_agg(spm.member_id) FILTER (WHERE spm.member_id IS NOT NULL), '{}') AS member_ids,
    COALESCE(array_agg(m.name) FILTER (WHERE m.name IS NOT NULL), '{}') AS member_names
  FROM public.static_parties sp
  LEFT JOIN public.guilds g ON g.id = sp.guild_id
  LEFT JOIN public.static_party_members spm ON spm.party_id = sp.id
  LEFT JOIN public.members m ON m.id = spm.member_id
  WHERE sp.server_id = p_server_id
  GROUP BY sp.id, sp.name, sp.guild_id, g.name
  ORDER BY sp.name;
$$;
