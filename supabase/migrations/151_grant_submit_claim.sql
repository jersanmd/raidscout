-- 151: Grant execute on submit_claim_request to authenticated (may have been lost during migration 138)
GRANT EXECUTE ON FUNCTION public.submit_claim_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_claim_request(UUID, TEXT) TO anon;
