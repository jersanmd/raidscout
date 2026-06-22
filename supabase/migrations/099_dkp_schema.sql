-- 099: DKP System Schema — transactions, bids, config, items extensions, views, RLS

-- 0. Add user_id to members (needed for claim system + DKP member ownership)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 1. DKP Transactions
CREATE TABLE IF NOT EXISTS public.dkp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,          -- positive = earn, negative = spend
  type TEXT NOT NULL,               -- 'earn_kill', 'earn_adjustment', 'earn_refund', 'spend_bid'
  reason TEXT,
  reference_id UUID,
  reference_type TEXT,              -- 'death_record', 'bid', 'manual'
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dkp_txns_server ON dkp_transactions(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dkp_txns_member ON dkp_transactions(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dkp_txns_ref ON dkp_transactions(reference_id, reference_type) WHERE reference_id IS NOT NULL;

ALTER TABLE public.dkp_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own dkp transactions" ON public.dkp_transactions;
CREATE POLICY "Members read own dkp transactions" ON public.dkp_transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff manage dkp transactions" ON public.dkp_transactions;
CREATE POLICY "Staff manage dkp transactions" ON public.dkp_transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = dkp_transactions.server_id AND user_id = auth.uid() AND role IN ('owner', 'moderator'))
  );

-- 2. DKP Balances View
CREATE OR REPLACE VIEW public.dkp_balances AS
SELECT member_id, server_id, COALESCE(SUM(amount), 0) AS balance
FROM public.dkp_transactions GROUP BY member_id, server_id;

-- 3. DKP Bids
CREATE TABLE IF NOT EXISTS public.dkp_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  discord_user_id TEXT,
  bid_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'won', 'lost', 'cancelled'
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dkp_bids_item ON dkp_bids(item_id, status);
CREATE INDEX IF NOT EXISTS idx_dkp_bids_member ON dkp_bids(member_id);

ALTER TABLE public.dkp_bids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own bids" ON public.dkp_bids;
CREATE POLICY "Members read own bids" ON public.dkp_bids
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff manage bids" ON public.dkp_bids;
CREATE POLICY "Staff manage bids" ON public.dkp_bids
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = dkp_bids.server_id AND user_id = auth.uid() AND role IN ('owner', 'moderator'))
  );

-- 4. DKP Config
CREATE TABLE IF NOT EXISTS public.dkp_config (
  server_id UUID PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  dkp_multiplier REAL DEFAULT 1.0,
  bid_mode_default TEXT DEFAULT 'silent',
  bid_duration_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.dkp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read dkp config" ON public.dkp_config;
CREATE POLICY "Anyone can read dkp config" ON public.dkp_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owner can update dkp config" ON public.dkp_config;
CREATE POLICY "Owner can update dkp config" ON public.dkp_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = dkp_config.server_id AND user_id = auth.uid() AND role = 'owner')
  );

-- 5. Items table extensions
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS is_up_for_bid BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS dkp_cost INTEGER;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS dkp_min_bid INTEGER DEFAULT 1;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS bid_end_time TIMESTAMPTZ;
