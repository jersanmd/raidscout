-- Payments table for tracking one-time PayPal transactions.
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  paypal_order_id TEXT,
  amount DECIMAL(10,2) NOT NULL DEFAULT 9.99,
  days_added INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded')),
  payer_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Server owners and moderators can view payments
DROP POLICY IF EXISTS "Server staff can view payments" ON public.payments;
CREATE POLICY "Server staff can view payments" ON public.payments
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT sm.user_id FROM public.server_members sm
      WHERE sm.server_id = payments.server_id
    )
    OR
    auth.uid() IN (
      SELECT s.owner_id FROM public.servers s WHERE s.id = payments.server_id
    )
  );

-- Only service_role can insert (via edge functions)
DROP POLICY IF EXISTS "Service role can insert payments" ON public.payments;
CREATE POLICY "Service role can insert payments" ON public.payments
  FOR INSERT
  WITH CHECK (true);
