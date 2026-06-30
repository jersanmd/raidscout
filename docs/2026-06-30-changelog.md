# June 30, 2026 — Changelog

## 🤖 Discord Bot — Performance & Resilience

- **RPC-powered spawn cron** — Boss spawn calculation moved from JS loop to `bot_next_spawns` SQL RPC. Tick time dropped from ~10-30s to under 2s. Falls back to JS if the RPC fails.
- **RPC-powered `!nextspawn`** — The `nextspawn`/`spawn` command now calls `bot_next_spawns` RPC for boss spawn times. Keeps JS fallback for resilience.
- **Self-healing dead channels** — When Discord returns 403 (missing access) or 404 (unknown channel), the bot automatically clears the `notification_channel_id` from that `discord_configs` row. No more manual DB cleanup. Also handles persistent network failures.
- **`firstTick` cooldown** — First cron tick after restart is silent (no notifications sent). Prevents 429 flood from empty dedup state.
- **Config `id` in select** — `spawn-cron.ts` now includes `id` in the `discord_configs` query for self-healing PATCH operations.

## 🔧 Infra

- **Staging `full-copy.mjs` Phase 3** — After cloning production data to staging, all `discord_configs` channel columns (`notification_channel_id`, `thread_channel_id`, `command_channel_id`) are now cleared. Prevents staging bot from trying to send to production Discord channels it doesn't have access to.

## 📦 Files Changed

- `scripts/bot/spawn-cron.ts` — RPC-powered boss loop, `firstTick`, `id` in select
- `scripts/bot/commands.ts` — RPC-powered `nextspawn` command
- `scripts/bot/notifications.ts` — self-healing dead channel cleanup
- `scripts/full-copy.mjs` — Phase 3 Discord channel clearing on staging
- `supabase/migrations/` — `bot_next_spawns` RPC, `activity_instances` index, leaderboard RPC fix + GRANT
