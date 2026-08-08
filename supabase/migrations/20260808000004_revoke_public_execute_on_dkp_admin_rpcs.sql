-- Follow-up to 20260808000003. That migration's `REVOKE EXECUTE ... FROM anon`
-- lines were ineffective: Postgres grants EXECUTE to PUBLIC by default on every
-- function, and anon inherits from PUBLIC, so revoking from anon specifically
-- left the inherited grant in place. Verified post-apply:
-- has_function_privilege('anon', ...) still returned true for all five RPCs.
--
-- The in-function auth.uid() + server_members staff checks added in ...0003 are
-- the real boundary and DID take effect (an anon caller gets 'Staff access
-- required'), so this is defense-in-depth rather than the primary fix -- but the
-- grants should still say what they mean.
--
-- Explicit grants to authenticated/service_role survive a PUBLIC revoke, so
-- legitimate callers (staff via the UI, the bot via the service-role key) are
-- unaffected.

REVOKE EXECUTE ON FUNCTION public.mark_item_for_bid(UUID, INTEGER, TIMESTAMPTZ, INTEGER, UUID, INTEGER, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.adjust_member_dkp(UUID, UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_auction(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_resolve_auction(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_auction_round(UUID, INTEGER) FROM PUBLIC;

-- Re-assert the intended grants (no-ops if already present, but keeps this
-- migration self-contained if replayed against a fresh database).
GRANT EXECUTE ON FUNCTION public.mark_item_for_bid(UUID, INTEGER, TIMESTAMPTZ, INTEGER, UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_member_dkp(UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_auction(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_resolve_auction(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_auction_round(UUID, INTEGER) TO authenticated;
