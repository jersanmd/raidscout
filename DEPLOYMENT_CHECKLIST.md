# 🚀 Production Deployment Checklist — v0.16.0 (DKP + Unlink)

## Pre-Deployment

- [ ] All changes committed and pushed to `master`
- [ ] `git status` is clean

## Database (Production Supabase `cjuacehmienztxrhwnlg`)

- [ ] Push migrations: `npx supabase db push --include-all`
- [ ] Verify migrations 099-154 applied
- [ ] Enable Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.member_claim_requests`
- [ ] Set replica identity: `ALTER TABLE public.member_claim_requests REPLICA IDENTITY FULL`
- [ ] Test RPCs: `get_active_auctions`, `place_bid`, `auto_resolve_auction`, `unlink_member`

## Frontend (Vercel)

- [ ] Build: `npx vite build`
- [ ] Deploy: `vercel deploy --prod`
- [ ] Verify landing page (DKP card, SEO tags, structured data)
- [ ] Verify `/join` (unlink banner)
- [ ] Verify DKP page (new header, sidebar order, settings tab order)
- [ ] Verify analytics tooltip
- [ ] Verify claims popup Load More

## Discord Bot (Fly.io `raidscout-bot`)

- [ ] Build: `npx esbuild scripts/discord-bot-gateway.ts --bundle --platform=node --target=node22 --outfile=dist/bot.cjs --external:ws --format=cjs`
- [ ] Deploy: `fly deploy`
- [ ] Verify: `fly status` shows healthy
- [ ] Test: `!bidstatus`, `!dkp`, `!spawn`, `!kill`

## E2E Smoke Test

- [ ] Create server → claim member → mark item → place bid
- [ ] Outbid test: second user bids higher → refund + notification
- [ ] Auto-resolve: let auction expire → highest bidder wins
- [ ] Auction history: each auction listed separately, bids filtered per auction
- [ ] Unlink member: confirm modal → notification → `/join` banner → re-claim → appears in popup
- [ ] Mobile: DKP page, settings tabs, sidebar

## Post-Deployment

- [ ] Monitor Fly logs: `fly logs`
- [ ] Verify `robots.txt`, `sitemap.xml`, `llms.txt` accessible
- [ ] Tag release: `git tag v0.16.0 && git push --tags`

---

# 🧪 Smoke Test: Member Claims & DKP Auctions

## Setup

- [ ] **Account A** (owner/mod) — create test server, enable DKP in Server Settings
- [ ] **Account B** (member) — sign up on a different browser/incognito

---

## A. Member Claims

### Claim a profile
1. [ ] As Account B, go to `/join`
2. [ ] Search for the test server name
3. [ ] Type an existing member name (must match exactly)
4. [ ] Click **Claim**
5. [ ] ✅ See "Pending approval" on the server result
6. [ ] ✅ See claim in "My Claims" section with "Pending" badge

### Approve the claim
7. [ ] As Account A, click the **Claims** button in header
8. [ ] ✅ See the claim in the popup with member name + email
9. [ ] Click **Accept**
10. [ ] ✅ Claim disappears from popup
11. [ ] ✅ Account B now sees server in sidebar (refresh page)
12. [ ] ✅ Members list shows "Claimed" badge next to the member

### Unlink a claimed member
13. [ ] As Account A, go to Members → find the claimed member
14. [ ] Click the **✕** next to "Claimed" badge
15. [ ] ✅ Confirmation modal appears asking for member name
16. [ ] Type the **wrong** name → ✅ Unlink button stays disabled
17. [ ] Type the **correct** name → click **Unlink**
18. [ ] ✅ Toast: `"Name" unlinked from user`
19. [ ] ✅ Claimed badge disappears from Members list

### Verify unlinked user experience
20. [ ] As Account B (refresh page)
21. [ ] ✅ Server is gone from sidebar
22. [ ] ✅ See "Profile Unlinked" amber banner on `/join` or NoServerView
23. [ ] ✅ Notification bell shows 🔓 "Member unlinked"
24. [ ] Click the notification → ✅ navigates to `/join`

### Re-claim after unlink
25. [ ] As Account B, submit a new claim for the same member
26. [ ] ✅ "Pending approval" appears
27. [ ] As Account A, click Claims button
28. [ ] ✅ New claim appears in popup (Realtime or within 30s)
29. [ ] Accept the claim → ✅ Account B regains server access

### Duplicate claim prevention
30. [ ] As Account B, try to submit another claim for the same server
31. [ ] ✅ Error: "You already have a pending claim for this server"

---

## B. DKP Auctions

### Enable DKP
1. [ ] As Account A, go to Server Settings → DKP tab
2. [ ] Toggle **Enable DKP** on
3. [ ] Set multiplier to 1.0, default duration to 30 min
4. [ ] Save → ✅ Config saves successfully

### Mark item for bid
5. [ ] Go to DKP page
6. [ ] Click **Mark Item for Bid**
7. [ ] Search for an item in the catalog
8. [ ] Select the item → ✅ item appears with rarity color
9. [ ] Set DKP Cost (e.g., 10), Quantity (e.g., 1)
10. [ ] Set end date/time (defaults to today 23:59 server time)
11. [ ] Click **Mark for Bid**
12. [ ] ✅ Item appears in Live Auction panel with countdown
13. [ ] ✅ DKP cost, quantity, end time visible
14. [ ] Click the item → ✅ Bids modal opens (0 bids)

### Place a bid (Account B)
15. [ ] As Account B, go to DKP page
16. [ ] Click the **Bid** button on the auction row
17. [ ] ✅ Bid modal shows item, DKP cost, presets, balance
18. [ ] Click a preset or type a bid amount
19. [ ] Click **Place Bid**
20. [ ] ✅ Toast: "Bid placed"
21. [ ] ✅ Live Auction row updates with bid count and highest bid

### Outbid test (Account A)
22. [ ] As Account A, place a higher bid
23. [ ] ✅ Account B receives "You were outbid!" notification
24. [ ] ✅ Account B's DKP is refunded (check balance)
25. [ ] ✅ Live Auction shows new highest bid

### Resolve auction (staff)
26. [ ] Click the **Cancel** button on the auction row
27. [ ] ✅ Resolve modal shows list of active bids
28. [ ] Pick a winner → click **Resolve**
29. [ ] ✅ Auction moves to Auction History
30. [ ] ✅ Winner sees "You won!" notification
31. [ ] ✅ Loser sees "Auction ended" notification with refund

### Auto-resolve (bot)
32. [ ] Mark a new item with a short duration (e.g., 5 min)
33. [ ] Place a bid from Account B
34. [ ] Wait for the auction to expire
35. [ ] ✅ Auction auto-resolves with highest bidder as winner
36. [ ] ✅ Auction appears in history with correct winner

### Auction History
37. [ ] Go to Auction History section
38. [ ] ✅ Each auction listed separately (not consolidated by item name)
39. [ ] ✅ Shows winner name, winning bid, bid count, time range
40. [ ] ✅ Today/Yesterday/This Week groups
41. [ ] ✅ Click an entry → Bids modal shows only that auction's bids
42. [ ] ✅ Load More button appears after 30 items

### Multi-auction same item
43. [ ] Mark the same item 3 times with different quantities
44. [ ] ✅ 3 separate auction rows appear in Live Auction
45. [ ] Place bids on each
46. [ ] ✅ Each auction has independent bids, countdown, winner
47. [ ] ✅ Auction history shows 3 separate entries

### Guild-restricted auction
48. [ ] Mark an item with a guild restriction
49. [ ] ✅ Guild badge appears on the auction row
50. [ ] As a member NOT in that guild, try to bid → ✅ error message
51. [ ] As a member IN that guild, bid successfully → ✅

---

## C. Bot Commands (on Discord)

- [ ] `!bidstatus <item>` — shows active auctions for that item
- [ ] `!dkp` — shows DKP balance
- [ ] `!dkp top` — shows leaderboard
- [ ] `!mybids` — shows active bids


- [ ] Update `.env.production`:
  ```
  VITE_PAYPAL_CLIENT_ID=AfO3suZ...  ← your LIVE client ID
  ```
- [ ] Update `.env.example` to remove sandbox references
- [ ] Verify: `VITE_PAYPAL_PLAN_ID` is NOT needed (we use `intent=capture`, not subscriptions)

## 2. Supabase — Edge Functions
- [ ] Deploy `paypal-ipn`:
  ```
  supabase functions deploy paypal-ipn --project-ref cjuacehmienztxrhwnlg
  ```
- [ ] Verify `paypal-ipn` has these env vars set (Supabase Dashboard → Edge Functions):
  - `SUPABASE_URL` (auto-set)
  - `SUPABASE_SERVICE_ROLE_KEY` (auto-set)
- [ ] Deploy `discord-bot` (if used for Interactions endpoint):
  ```
  supabase functions deploy discord-bot --project-ref cjuacehmienztxrhwnlg
  ```

## 3. Supabase — Database
- [ ] Verify `extend_server_subscription` RPC exists:
  ```sql
  SELECT proname FROM pg_proc WHERE proname = 'extend_server_subscription';
  ```
- [ ] Verify `payments` table exists:
  ```sql
  SELECT * FROM payments LIMIT 1;
  ```
- [ ] Verify `servers` table has columns:
  - `trial_ends_at TIMESTAMPTZ`
  - `subscription_ends_at TIMESTAMPTZ`  
  - `paypal_subscription_id TEXT`

## 4. Code — No Sandbox References
- [ ] `src/components/PayPalSubscribeButton.tsx` uses `www.paypal.com/sdk/js` (not sandbox) ✅
- [ ] `supabase/functions/paypal-ipn/index.ts` has no sandbox URLs ✅
- [ ] `.env.local` sandbox comment is for local dev only (won't affect production)

## 5. Vercel — Environment Variables
Go to Vercel Dashboard → Project Settings → Environment Variables:
- [ ] Set `VITE_PAYPAL_CLIENT_ID` = your LIVE PayPal Client ID
- [ ] Set `VITE_SUPABASE_URL` = `https://cjuacehmienztxrhwnlg.supabase.co`
- [ ] Set `VITE_SUPABASE_PUBLISHABLE_KEY` = your publishable key

## 6. Smoke Test (on live after deploy)
- [ ] Visit `/billing` — PayPal buttons render (not "SDK not loaded")
- [ ] Click "Pay with PayPal" — opens PayPal popup (NOT sandbox)
- [ ] Complete a $9.99 payment with a real card/PayPal account
- [ ] Verify: `subscription_ends_at` updated in database
- [ ] Verify: `payments` table has a new row
- [ ] Verify: celebratory modal appears after payment
- [ ] Verify: page updates to "Pro" without refresh
- [ ] Verify: no "Access active" banner (Pro users don't see it)
- [ ] Verify: trial banner shows for trial servers
- [ ] Verify: expired banner shows for expired servers
- [ ] Verify: gated pages blocked when expired (History, Leaderboard, Members, Inventory)
- [ ] Verify: Discord bot blocks commands on expired servers
- [ ] Verify: spawn cron excludes expired servers

## 7. Refund Test
- [ ] Log into PayPal → find the test transaction → Issue refund
- [ ] Verify: refund processed correctly
- [ ] Clean up test data afterwards

## 8. Rollback Plan
If something breaks:
- [ ] Remove `VITE_PAYPAL_CLIENT_ID` env var (hides PayPal buttons)
- [ ] All servers default to `trial_ends_at` behavior
- [ ] No data loss — payments table is append-only
