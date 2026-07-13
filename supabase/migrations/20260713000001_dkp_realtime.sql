-- Add DKP tables to supabase_realtime publication for live bidding updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.dkp_auctions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dkp_bids;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dkp_transactions;
