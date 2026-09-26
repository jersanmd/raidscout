-- Fix PayPal payments that were captured but never credited, and close the
-- billing holes that let a server get paid time without paying.
--
-- THE INCIDENT: since 2026-06-22 no PayPal payment has been credited. The
-- paypal-ipn edge function's Smart Button path returns 500 ("PayPal API
-- credentials not configured") AFTER the browser has already captured the
-- money, and PayPal's own IPN retries -- the only backup -- are rejected at
-- the gateway with 401 because the function was deployed with verify_jwt on.
-- The last payments row is 2026-06-22 01:11Z; there are none since.
--
-- Setting the missing secrets is not enough on its own, which is why this
-- migration ships first:
--
--   * The edge function extended the subscription and THEN inserted the
--     payments row, writing a paypal_capture_id column that did not exist.
--     The insert always failed (only logged), so the idempotency lookup never
--     found the order and one paid order could be replayed for +30 days each
--     time. The column is added here, and crediting moves into
--     record_paypal_payment(), which inserts the row and extends in ONE
--     transaction, keyed on unique capture/order ids.
--
--   * payments had an INSERT policy "TO public WITH CHECK (true)" -- meant for
--     the service role, which bypasses RLS anyway -- so anyone holding the
--     anon key could forge payment rows, including one carrying a real order
--     id that would make paypal-ipn skip that order as "already processed".
--
--   * extend_server_subscription let the server owner through, and let anon
--     through too: for anon, auth.uid() is NULL, so `auth.uid() != owner` is
--     NULL, `NULL AND NOT false` is NULL, and IF NULL skips the RAISE. Anon
--     and PUBLIC held EXECUTE. p_days was unbounded (negative values could
--     expire a competitor).
--
--   * servers is table-wide UPDATE-able by its owner through PostgREST, so an
--     owner could PATCH subscription_ends_at directly.
--
-- Nothing legitimate loses access: the only callers of
-- extend_server_subscription are paypal-ipn (service_role) and the Admin
-- Panel (platform admin). No client code writes the billing columns
-- directly; server creation goes through create_server_with_bosses, which is
-- SECURITY DEFINER and so runs as its owner, not as `authenticated`.
--
-- SIGNATURE DISCIPLINE: extend_server_subscription keeps its deployed argument
-- list (p_server_id uuid, p_days integer) byte-for-byte, so CREATE OR REPLACE
-- replaces it rather than adding an overload. CREATE OR REPLACE also keeps the
-- existing ACL, which is why the REVOKE below is explicit.

-- ── payments: capture id + real idempotency keys ────────────────────────────

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS paypal_capture_id text;

-- Partial, so legacy rows with no id don't collide. The 6 existing rows have
-- 6 distinct paypal_order_ids (checked before writing this).
CREATE UNIQUE INDEX IF NOT EXISTS payments_paypal_order_id_key
  ON public.payments (paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_paypal_capture_id_key
  ON public.payments (paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;

-- Only the service role writes payments, and it bypasses RLS. This policy
-- opened INSERT to anon and authenticated, nothing else.
DROP POLICY IF EXISTS "Service role can insert payments" ON public.payments;
REVOKE ALL ON public.payments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.payments FROM authenticated;

-- The Admin Panel's payments tab selects every row, but the only SELECT
-- policy is owner-scoped, so the admin saw just their own servers' payments.
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
CREATE POLICY "Admins can view all payments" ON public.payments
  FOR SELECT TO authenticated USING (public.is_admin());

-- ── extend_server_subscription: service_role or platform admin only ─────────

CREATE OR REPLACE FUNCTION public.extend_server_subscription(p_server_id uuid, p_days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub_end timestamptz;
  v_trial_end timestamptz;
  v_base timestamptz;
BEGIN
  -- IS DISTINCT FROM, not !=: a NULL role (no JWT at all) must fail closed
  -- instead of evaluating to NULL and skipping the RAISE. is_admin() is an
  -- EXISTS, so it is never NULL either. Owners are deliberately excluded --
  -- this function grants paid time.
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to extend subscription';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 366 THEN
    RAISE EXCEPTION 'p_days must be between 1 and 366';
  END IF;

  -- Row lock: two credits for the same server (e.g. the Smart Button call and
  -- the IPN for a different order landing together) must stack, not race.
  -- NO KEY UPDATE, not UPDATE: record_paypal_payment's payments INSERT holds a
  -- KEY SHARE lock on this row (the FK check), which FOR UPDATE would wait on
  -- -- two concurrent credits would deadlock. Only subscription_ends_at changes.
  SELECT subscription_ends_at, trial_ends_at
  INTO v_sub_end, v_trial_end
  FROM public.servers
  WHERE id = p_server_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Server not found';
  END IF;

  IF v_sub_end > now() THEN
    v_base := v_sub_end;          -- Active subscription: stack
  ELSIF v_trial_end > now() THEN
    v_base := v_trial_end;        -- Active trial: start from trial end
  ELSE
    v_base := now();              -- Neither active: start now
  END IF;

  UPDATE public.servers
  SET subscription_ends_at = v_base + make_interval(days => p_days)
  WHERE id = p_server_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.extend_server_subscription(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_server_subscription(uuid, integer) TO authenticated, service_role;

-- ── record_paypal_payment: the one way a PayPal payment becomes time ────────

-- Records the payment and credits the server in a single transaction. The
-- unique indexes make it idempotent: the Smart Button call, PayPal's IPN for
-- the same capture, IPN retries and a manual reconciliation re-run all land
-- here, and only the first one credits. Returns whether this call credited.
CREATE OR REPLACE FUNCTION public.record_paypal_payment(
  p_server_id uuid,
  p_order_id text,
  p_capture_id text,
  p_amount numeric,
  p_days integer,
  p_payer_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment_id uuid;
  v_ends_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized to record payments';
  END IF;
  IF p_capture_id IS NULL OR p_capture_id = '' THEN
    RAISE EXCEPTION 'capture id is required';
  END IF;

  INSERT INTO public.payments
    (server_id, paypal_order_id, paypal_capture_id, amount, days_added, status, payer_email)
  VALUES
    (p_server_id, NULLIF(p_order_id, ''), p_capture_id, p_amount, p_days, 'completed', p_payer_email)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_payment_id;

  IF v_payment_id IS NOT NULL THEN
    PERFORM public.extend_server_subscription(p_server_id, p_days);
  END IF;

  SELECT subscription_ends_at INTO v_ends_at FROM public.servers WHERE id = p_server_id;

  RETURN jsonb_build_object(
    'credited', v_payment_id IS NOT NULL,
    'subscription_ends_at', v_ends_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_paypal_payment(uuid, text, text, numeric, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_paypal_payment(uuid, text, text, numeric, integer, text) TO service_role;

-- ── servers: billing columns are not client-writable ───────────────────────

-- SECURITY INVOKER on purpose: for a direct PostgREST write current_user is
-- anon/authenticated, while inside a SECURITY DEFINER function (the two above,
-- create_server_with_bosses) it is the function owner, which stays free to set
-- these columns. A column-level REVOKE would not work here: the table-level
-- UPDATE grant already covers every column.
CREATE OR REPLACE FUNCTION public.guard_server_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.subscription_ends_at IS NOT NULL
       OR NEW.trial_ends_at IS NOT NULL
       OR NEW.paypal_subscription_id IS NOT NULL THEN
      RAISE EXCEPTION 'Billing fields cannot be set directly';
    END IF;
  ELSIF NEW.subscription_ends_at IS DISTINCT FROM OLD.subscription_ends_at
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.paypal_subscription_id IS DISTINCT FROM OLD.paypal_subscription_id THEN
    RAISE EXCEPTION 'Billing fields cannot be changed directly';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_server_billing_columns ON public.servers;
CREATE TRIGGER trg_guard_server_billing_columns
  BEFORE INSERT OR UPDATE ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.guard_server_billing_columns();
