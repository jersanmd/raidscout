-- 150: Add member_claim_requests to Realtime publication so claim notifications are instant
ALTER PUBLICATION supabase_realtime ADD TABLE public.member_claim_requests;
ALTER TABLE public.member_claim_requests REPLICA IDENTITY FULL;
