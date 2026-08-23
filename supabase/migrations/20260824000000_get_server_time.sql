-- Server-clock source for auction countdowns.
--
-- Countdowns were computed from the device clock; place_bid's deadline check
-- runs on the database clock. A device running 10-20s behind (verified from a
-- production report: rows showed 9s and 16s remaining while the server had
-- already passed the deadline) shows time that does not exist, and the player
-- gets AUCTION_CLOSED on a bid the UI invited. The client now samples this
-- once per DKP page visit (plus on reconnect and tab-return) and renders every
-- countdown in server time.

CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$ SELECT now(); $$;

REVOKE EXECUTE ON FUNCTION public.get_server_time() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO authenticated;
