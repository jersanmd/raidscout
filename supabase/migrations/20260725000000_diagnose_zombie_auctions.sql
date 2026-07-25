-- Diagnostic: Find zombie auctions with resolved status but missing proper bid data
-- Run this on production to identify affected auctions

-- 1. Auctions resolved but with NO won bid
SELECT 
  a.id AS auction_id,
  a.item_id,
  a.status,
  a.dkp_cost,
  a.created_at,
  a.bid_end_time,
  i.name AS item_name,
  (SELECT COUNT(*) FROM public.dkp_bids b WHERE b.auction_id = a.id AND b.status = 'won') AS won_bids,
  (SELECT COUNT(*) FROM public.dkp_bids b WHERE b.auction_id = a.id AND b.status = 'active') AS active_bids,
  (SELECT COUNT(*) FROM public.dkp_bids b WHERE b.auction_id = a.id) AS total_bids
FROM public.dkp_auctions a
JOIN public.items i ON i.id = a.item_id
WHERE a.status = 'resolved'
  AND a.created_at > now() - interval '14 days'
  AND NOT EXISTS (SELECT 1 FROM public.dkp_bids b WHERE b.auction_id = a.id AND b.status = 'won')
ORDER BY a.created_at DESC;

-- 2. Auctions with active bids but already resolved (zombie state)
SELECT
  a.id AS auction_id,
  a.item_id,
  a.status,
  i.name AS item_name,
  b.id AS bid_id,
  b.status AS bid_status,
  b.bid_amount,
  m.name AS bidder
FROM public.dkp_auctions a
JOIN public.items i ON i.id = a.item_id
JOIN public.dkp_bids b ON b.auction_id = a.id AND b.status = 'active'
JOIN public.members m ON m.id = b.member_id
WHERE a.status IN ('resolved', 'cancelled')
ORDER BY a.created_at DESC;
