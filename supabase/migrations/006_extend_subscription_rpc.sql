-- RPC: Extend server subscription by N days.
-- Called by PayPal IPN edge function and AdminPanel "Extend +30d" button.
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
BEGIN
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
