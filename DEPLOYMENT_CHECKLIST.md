# 🚀 Monetization Deployment Checklist

## 1. PayPal — Production Setup
- [ ] Go to [paypal.com/business](https://www.paypal.com/business) and create a **Live REST API app**
- [ ] Copy the **Live Client ID** (starts with `Af` or `AQ`, NOT `sb-`)
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
