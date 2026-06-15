-- RPC: Extend server subscription by N days.
-- Called by PayPal IPN edge function and AdminPanel "Extend +30d" button.
-- If subscription_ends_at is already in the future, stack on top.
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
  v_current timestamptz;
BEGIN
  SELECT subscription_ends_at INTO v_current
  FROM servers
  WHERE id = p_server_id;

  UPDATE servers
  SET subscription_ends_at =
    CASE
      WHEN v_current IS NOT NULL AND v_current > now() THEN v_current + (p_days || ' days')::interval
      ELSE now() + (p_days || ' days')::interval
    END
  WHERE id = p_server_id;
END;
$$;
