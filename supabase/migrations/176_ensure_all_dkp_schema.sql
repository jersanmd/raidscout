-- 176: Ensure ALL DKP schema objects exist on remote (tables, views, all RPCs)
-- Some objects from migration 099/100 may have been dropped or never applied

-- ── Tables (if not exists) ──
CREATE TABLE IF NOT EXISTS public.dkp_config (
  server_id UUID PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  dkp_multiplier REAL DEFAULT 1.0,
  bid_mode_default TEXT DEFAULT 'silent',
  bid_duration_minutes INTEGER DEFAULT 30,
  hide_from_players BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dkp_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  auction_id UUID REFERENCES public.dkp_auctions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  discord_user_id TEXT,
  bid_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  auction_round INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.dkp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  reason TEXT,
  reference_id UUID,
  reference_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dkp_auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  dkp_cost INTEGER NOT NULL DEFAULT 1,
  bid_end_time TIMESTAMPTZ,
  guild_id UUID REFERENCES public.guilds(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'resolved')),
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dkp_distributed (
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  auction_round INTEGER NOT NULL DEFAULT 1,
  auction_id UUID,
  distributed_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (item_id, auction_round, auction_id)
);

-- ── Views ──
CREATE OR REPLACE VIEW public.dkp_balances AS
SELECT member_id, server_id, COALESCE(SUM(amount), 0) AS balance
FROM public.dkp_transactions GROUP BY member_id, server_id;

-- ── Core RPCs ──
-- award_dkp_on_kill (idempotent boss kill DKP)
CREATE OR REPLACE FUNCTION public.award_dkp_on_kill(p_death_record_id UUID)
RETURNS SETOF UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_server_id UUID; v_boss_points INTEGER; v_multiplier REAL; v_amount INTEGER;
  v_attendee RECORD; v_existing RECORD; v_txn_id UUID;
BEGIN
  SELECT dr.server_id, COALESCE(b.boss_points, 1) INTO v_server_id, v_boss_points
  FROM public.death_records dr JOIN public.bosses b ON b.id = dr.boss_id WHERE dr.id = p_death_record_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(dkp_multiplier, 1.0) INTO v_multiplier FROM public.dkp_config WHERE server_id = v_server_id;
  IF NOT FOUND OR v_multiplier = 0 THEN RETURN; END IF;
  v_amount := ROUND(v_boss_points * v_multiplier);
  FOR v_attendee IN SELECT ar.member_id FROM public.attendance_records ar WHERE ar.death_record_id = p_death_record_id
  LOOP
    SELECT id INTO v_existing FROM public.dkp_transactions
    WHERE reference_id = p_death_record_id AND reference_type = 'death_record' AND member_id = v_attendee.member_id AND type = 'earn_kill' LIMIT 1;
    IF v_existing.id IS NULL THEN
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_attendee.member_id, v_amount, 'earn_kill', 'Boss kill', p_death_record_id, 'death_record') RETURNING id INTO v_txn_id;
      RETURN NEXT v_txn_id;
    END IF;
  END LOOP;
  FOR v_existing IN SELECT dt.id, dt.member_id, dt.amount FROM public.dkp_transactions dt
    WHERE dt.reference_id = p_death_record_id AND dt.reference_type = 'death_record' AND dt.type = 'earn_kill'
    AND dt.member_id NOT IN (SELECT ar.member_id FROM public.attendance_records ar WHERE ar.death_record_id = p_death_record_id)
  LOOP
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_existing.member_id, -v_existing.amount, 'earn_adjustment', 'Removed from attendance', p_death_record_id, 'death_record')
    RETURNING id INTO v_txn_id; RETURN NEXT v_txn_id;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_dkp_on_kill(UUID) TO authenticated;

-- adjust_member_dkp
CREATE OR REPLACE FUNCTION public.adjust_member_dkp(p_member_id UUID, p_server_id UUID, p_amount INTEGER, p_reason TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_txn_id UUID;
BEGIN
  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_type)
  VALUES (p_server_id, p_member_id, p_amount, 'earn_adjustment', p_reason, 'manual') RETURNING id INTO v_txn_id;
  RETURN v_txn_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.adjust_member_dkp(UUID, UUID, INTEGER, TEXT) TO authenticated;

-- get_member_dkp
CREATE OR REPLACE FUNCTION public.get_member_dkp(p_member_id UUID, p_server_id UUID)
RETURNS TABLE(balance BIGINT, earned_total BIGINT, spent_total BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(SUM(amount), 0)::BIGINT AS balance,
    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::BIGINT AS earned_total,
    COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0)::BIGINT AS spent_total
  FROM public.dkp_transactions WHERE member_id = p_member_id AND server_id = p_server_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_member_dkp(UUID, UUID) TO authenticated;

-- get_server_dkp_rankings
CREATE OR REPLACE FUNCTION public.get_server_dkp_rankings(p_server_id UUID)
RETURNS TABLE(member_id UUID, member_name TEXT, balance BIGINT, rank INTEGER, guild_name TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT m.id AS member_id, m.name AS member_name, COALESCE(db.balance, 0)::BIGINT AS balance,
    ROW_NUMBER() OVER (ORDER BY COALESCE(db.balance, 0) DESC)::INTEGER AS rank, g.name AS guild_name
  FROM public.members m
  LEFT JOIN public.dkp_balances db ON db.member_id = m.id AND db.server_id = p_server_id
  LEFT JOIN public.guilds g ON g.id = m.guild_id
  WHERE m.server_id = p_server_id ORDER BY COALESCE(db.balance, 0) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_server_dkp_rankings(UUID) TO authenticated;

-- get_member_dkp_history (latest from 154)
CREATE OR REPLACE FUNCTION public.get_member_dkp_history(p_member_id UUID, p_server_id UUID, p_limit INTEGER DEFAULT 20, p_cursor TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE(id UUID, amount INTEGER, type TEXT, reason TEXT, created_at TIMESTAMPTZ, boss_name TEXT, death_time TIMESTAMPTZ, guild_name TEXT, item_name TEXT, item_rarity TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT dt.id, dt.amount, dt.type, dt.reason, dt.created_at,
    b.name AS boss_name, dr.death_time, g.name AS guild_name, i.name AS item_name, i.rarity AS item_rarity
  FROM public.dkp_transactions dt
  LEFT JOIN public.death_records dr ON dr.id = dt.reference_id AND dt.reference_type = 'death_record'
  LEFT JOIN public.bosses b ON b.id = dr.boss_id
  LEFT JOIN public.guilds g ON g.id = COALESCE(dr.display_owner_guild_id, dr.owner_guild_id)
  LEFT JOIN public.dkp_bids db ON db.id = dt.reference_id AND dt.reference_type = 'bid'
  LEFT JOIN public.items i ON i.id = db.item_id
  WHERE dt.member_id = p_member_id AND dt.server_id = p_server_id
    AND (p_cursor IS NULL OR dt.created_at < p_cursor)
  ORDER BY dt.created_at DESC LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_member_dkp_history(UUID, UUID, INTEGER, TIMESTAMPTZ) TO authenticated;

-- RLS on dkp_config
ALTER TABLE public.dkp_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read dkp config" ON public.dkp_config;
CREATE POLICY "Anyone can read dkp config" ON public.dkp_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owner and mods can update dkp config" ON public.dkp_config;
DROP POLICY IF EXISTS "Owner and mods can manage dkp config" ON public.dkp_config;
CREATE POLICY "Owner and mods can manage dkp config" ON public.dkp_config
  FOR ALL USING (EXISTS (SELECT 1 FROM public.server_members WHERE server_id = dkp_config.server_id AND user_id = auth.uid() AND role IN ('owner', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.server_members WHERE server_id = dkp_config.server_id AND user_id = auth.uid() AND role IN ('owner', 'moderator')));

-- RLS on dkp_bids
ALTER TABLE public.dkp_bids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read own bids" ON public.dkp_bids;
CREATE POLICY "Members read own bids" ON public.dkp_bids FOR SELECT USING (EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.user_id = auth.uid()));
DROP POLICY IF EXISTS "Staff manage bids" ON public.dkp_bids;
CREATE POLICY "Staff manage bids" ON public.dkp_bids FOR ALL USING (EXISTS (SELECT 1 FROM public.server_members WHERE server_id = dkp_bids.server_id AND user_id = auth.uid() AND role IN ('owner', 'moderator')));

-- RLS on dkp_transactions
ALTER TABLE public.dkp_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read own transactions" ON public.dkp_transactions;
CREATE POLICY "Members read own transactions" ON public.dkp_transactions FOR SELECT USING (EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.user_id = auth.uid()));
DROP POLICY IF EXISTS "Staff manage dkp transactions" ON public.dkp_transactions;
CREATE POLICY "Staff manage dkp transactions" ON public.dkp_transactions FOR ALL USING (EXISTS (SELECT 1 FROM public.server_members WHERE server_id = dkp_transactions.server_id AND user_id = auth.uid() AND role IN ('owner', 'moderator')));
