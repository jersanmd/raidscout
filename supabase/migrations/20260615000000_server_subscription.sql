-- 031_server_subscription.sql
-- Adds trial and subscription tracking for server monetization.
-- Existing servers are grandfathered (no expiry).
-- New servers get a 14-day free trial via create_server_with_bosses RPC.

ALTER TABLE servers ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

-- Grandfather all existing servers — set trial_ends_at to now so they never appear expired
UPDATE servers SET trial_ends_at = now() WHERE trial_ends_at IS NULL;

COMMENT ON COLUMN servers.trial_ends_at IS '14-day free trial end. NULL for grandfathered servers set during migration.';
COMMENT ON COLUMN servers.subscription_ends_at IS 'Paid subscription end. NULL if never subscribed. Extended by PayPal IPN.';
