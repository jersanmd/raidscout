# June 30, 2026 — Changelog

## 🤖 Discord Bot — Performance & Resilience

- **RPC-powered spawn cron** — Boss spawn calculation moved from JS loop to `bot_next_spawns` SQL RPC. Tick time dropped from ~10-30s to under 2s. Falls back to JS if the RPC fails.
- **RPC-powered `!nextspawn`** — The `nextspawn`/`spawn` command now calls `bot_next_spawns` RPC for boss spawn times. Keeps JS fallback for resilience.
- **Self-healing dead channels** — When Discord returns 403 (missing access) or 404 (unknown channel), the bot automatically clears the `notification_channel_id` from that `discord_configs` row. Network errors (timeouts, 429s) are logged but do NOT trigger clearing — only definitive HTTP status codes.
- **Notification rate limiting** — `batchRun` reduced from concurrency 10 (no delay) to concurrency 3 with 800ms delay between sends. ~3.75 messages/sec keeps `forcespawnall` well under Discord's 5/5s per-channel and 50/s global limits.
- **Stable spawn_time in RPC** — `bot_next_spawns` now returns the actual spawn time instead of `now()` when a boss is alive. Fixes notification dedup spam — previously the dedup key changed every tick because `spawnUnix` was always current time.
- **`firstTick` cooldown** — First cron tick after restart is silent (no notifications sent). Prevents 429 flood from empty dedup state.
- **Config `id` in select** — `spawn-cron.ts` now includes `id` in the `discord_configs` query for self-healing PATCH operations.

## 🔧 Infra

- **Staging `full-copy.mjs` Phase 3** — After cloning production data to staging, all `discord_configs` channel columns (`notification_channel_id`, `thread_channel_id`, `command_channel_id`) are now cleared. Prevents staging bot from trying to send to production Discord channels it doesn't have access to.
- **All schedule times now UTC** — Legacy seed bosses had schedule times stored in GMT+8 while templates used UTC, causing the RPC to compute wrong spawn times. Migration converted legacy data to UTC, `getScheduleTz` simplified to always return `"UTC"`. All 938 production fixed_schedule bosses are now uniform UTC.
- **Seed.sql fallback removed** — `create_server_with_bosses` no longer falls back to `seed_bosses_for_server()`. All servers use `boss_templates` which are already UTC.

## 🐛 Bug Fixes

- **`!nextspawn` guild mismatch** — RPC path was passing `null` for `lastDeath` to `computeOwnerGuild`, causing daily rotation bosses to always show the first guild. Now fetches death records and passes real last death for accurate rotation computation.
- **Admin ForceSpawnAll broken** — RPC `admin_forcespawn_all` was inserting columns `spawn_window_start`/`spawn_window_end` that don't exist on `boss_spawn_overrides`. Fixed to use `death_time`.
- **Self-healing too aggressive** — Catch block was clearing channels on ANY network error (timeouts during `forcespawnall`). Now only clears on 404/403 HTTP responses.

## 📦 Files Changed

- `scripts/bot/spawn-cron.ts` — RPC-powered boss loop, `firstTick`, rate-limited `batchRun`
- `scripts/bot/commands.ts` — RPC-powered `nextspawn`, accurate guild computation
- `scripts/bot/notifications.ts` — self-healing (404/403 only)
- `scripts/bot/spawn-utils.ts` — `getScheduleTz` always returns `"UTC"`
- `scripts/full-copy.mjs` — Phase 3 Discord channel clearing on staging
- `supabase/migrations/` — `bot_next_spawns` RPC (v5 + stable time + 24h window), `admin_forcespawn_all` fix, UTC conversion, seed fallback removal, `activity_instances` index, leaderboard RPC fix
