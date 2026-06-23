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
