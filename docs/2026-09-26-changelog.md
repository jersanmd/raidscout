# September 26, 2026 — Changelog

## 🐛 Bug Fixes

- **No PayPal payment had been credited since late June** — Since roughly 2026-06-27 every PayPal order silently failed to credit. `paypal-ipn` had no `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET` secrets, so Smart Button activation returned 500 *after* the browser had already captured the money, and PayPal's IPN — the only backup path — was rejected with 401 because the function is deployed with `verify_jwt` on. Setting the secrets alone would have made things worse: the old code extended the subscription and then inserted a payments row into a `paypal_capture_id` column that did not exist, so no row was ever written and a single paid order could be replayed for unlimited +30-day extensions.

  Migration `20260924000000` adds `payments.paypal_capture_id` with partial unique indexes on both the order id and the capture id, and a new `record_paypal_payment` RPC (service-role only) that records the payment and extends the subscription in one transaction, crediting each capture exactly once. The same migration closes the billing holes that let a server get time without paying: `extend_server_subscription` let `anon` through (`auth.uid() != owner` evaluates to NULL for anon, so the `RAISE` was skipped) and let owners extend themselves; `payments` had an INSERT policy open to anon; and owners could `PATCH subscription_ends_at` directly, which is now blocked by a BEFORE trigger. A `FOR NO KEY UPDATE` on the servers row lets concurrent credits stack without deadlocking against the payments foreign-key lock.

  The `paypal-ipn` function was rewritten so the Smart Button call and the IPN both resolve the payment to a completed PayPal capture and credit it through `record_paypal_payment`. The server now comes from the verified order's `custom_id`, never the request body; only payments to `PAYPAL_MERCHANT_ID` count (the browser builds the order and could name any payee). Failures a retry could fix answer with `retry`, so PayPal keeps the IPN queued rather than dropping it.

## ✨ Improvements

- **Billing UI no longer strands a paid customer** — Activation now retries, and a captured-but-not-yet-credited payment shows "payment received" with the PayPal order id instead of "something went wrong". PayPal callbacks are held in a ref so a parent re-render no longer tears down the buttons mid-checkout.

## 🧹 Housekeeping

- **`scripts/reconcile-paypal-payments.mjs`** finds paid-but-uncredited captures through PayPal Transaction Search (dry run by default; it flags servers an admin already extended by hand as `COMPED`).
- **`supabase/config.toml`** pins `verify_jwt = false` for `paypal-ipn` (the function verifies the payment itself).
- **`DEPLOYMENT_CHECKLIST.md`** now documents the safe rollout order: migration first, deploy with `verify_jwt` off, then set the secrets.

  The migration and the rewritten function still need applying to production.
