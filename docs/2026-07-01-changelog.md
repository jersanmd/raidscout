# July 1, 2026 — Changelog (v0.15.8)

## 🐛 Bug Fixes

- **Weekly Schedule — attendance badge loading state** — The "Fetching data" overlay now waits for the attendance query to finish before hiding. The attendance query fires in the same render as death records completing (via `deathRecordIds.length` in the query key) instead of gating behind a separate `enabled` flag. This prevents the attendance count badge from appearing seconds after the spinner disappears.

## 🗄️ Database

- **`bot_next_spawns` RPC v5** — Returns `spawn_time`, `is_alive`, and `id` columns. Uses actual spawn time (not `now()`) to fix dedup in the bot cron.
- **`bot_next_spawns` 24h alive window** — Schedule bosses remain "alive" for 24 hours after their spawn window.
- **Stable `spawn_time` fix** — Fixed-hours spawn calculations use a stable 24h window.
- **`admin_forcespawn_all` fix** — `death_time` now correctly set to `now()` instead of the boss's spawn time.
- **Legacy schedule UTC conversion** — Converted all schedule bosses from GMT+8 to UTC in the `bosses` table.
- **Seed.sql fallback removed** — `create_server_with_bosses` no longer falls back to `seed.sql`.
- **Leaderboard RPC reverted** — Production RPC restored to original 3-param signature (`p_server_id`, `p_since`, `p_period`).

## 🤖 Discord Bot

- **RPC-powered spawn cron** — `spawn-cron.ts` now calls `bot_next_spawns` RPC instead of computing spawns in JS. Sub-2-second tick times.
- **RPC-powered `nextspawn` command** — Uses RPC with real death records for accurate guild computation. JS fallback retained.
- **Rate-limited notifications** — `batchRun` sends notifications with concurrency 3 and 800ms delay between batches.
- **Self-healing narrowed** — Dead channel cleanup now only triggers on 404/403 HTTP responses, not network errors.
- **UTC schedule timezone** — `getScheduleTz` always returns `"UTC"` (was conditional GMT+8/UTC).
- **`firstTick` cooldown** — Prevents notification spam on bot startup.
