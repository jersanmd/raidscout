-- RPC: Extend server subscription by N days.
-- Called by PayPal IPN edge function (service_role) and AdminPanel "Extend +30d" button (owner/admin).
-- Auth: only service_role, server owner, or admin can extend.
-- If subscription is active, stack on top.
-- If trial is active, start from trial end date.
-- Otherwise, start from NOW().
CREATE OR REPLACE FUNCTION extend_server_subscription(
  p_server_id uuid,
  p_days integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub_end timestamptz;
  v_trial_end timestamptz;
  v_base timestamptz;
  v_owner_id uuid;
  v_is_admin boolean;
BEGIN
  -- Auth check: allow service_role (edge functions), server owner, or admin
  IF auth.role() != 'service_role' THEN
    SELECT owner_id INTO v_owner_id FROM public.servers WHERE id = p_server_id;
    SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') INTO v_is_admin;
    IF auth.uid() != v_owner_id AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Not authorized to extend subscription for this server';
    END IF;
  END IF;

  SELECT subscription_ends_at, trial_ends_at
  INTO v_sub_end, v_trial_end
  FROM public.servers
  WHERE id = p_server_id;

  -- Determine the base date to extend from
  IF v_sub_end IS NOT NULL AND v_sub_end > now() THEN
    v_base := v_sub_end;          -- Active subscription: stack
  ELSIF v_trial_end IS NOT NULL AND v_trial_end > now() THEN
    v_base := v_trial_end;        -- Active trial: start from trial end
  ELSE
    v_base := now();              -- Neither active: start now
  END IF;

  UPDATE public.servers
  SET subscription_ends_at = v_base + (p_days || ' days')::interval
  WHERE id = p_server_id;
END;
$$;
