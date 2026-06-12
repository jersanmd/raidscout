# June 12, 2026 — Changelog (v0.14.2)

## ⚡ Performance

- **Parallel spawn cron** — the 60-second cron that checks boss spawns now processes all servers in parallel (concurrency cap of 10) instead of sequentially. 12 servers: 8s → 2s. 100 servers: 70s → 8s. No more risk of cron ticks overlapping at scale.
- **Analytics attendance batching** — activity attendance is now fetched in a single `IN` query (paginated) instead of record-by-record. Removes the N+1 query pattern entirely.

## 🐛 Bug Fixes

- **Silent error swallowing eliminated** — 30+ `catch {}` and `catch { /* ignore */ }` blocks replaced with `console.error` logging across 14 files (analytics, bosses, bot commands, notifications, spawn cron, attendance, history, death records, party management). The analytics attendance bug was originally caused by silently skipped batch errors — now impossible to miss.

## 🤖 Discord Bot

- **Spawn cron parallelization** — per-server boss checks now run concurrently via `concurrentMap(serverIds, 10, ...)`. Servers no longer wait for each other; the slowest server no longer delays all others.
- **`continue` → `return bossCount`** — fixed build error where `continue` was used inside an async callback (now correctly returns the boss count for the parallel results accumulator)
- **`supabaseQuerySafe` now logs errors** — previously swallowed all query failures and returned `[]`. Now logs the path and error before returning the empty fallback.
- **Bot role fetch failure logged** — Discord role resolution failures now produce `console.error` with guild ID and error details.

## 🎨 UI

- **Multi-game landing page** — new "One Platform, Any MMO" section between the hero and features, showing game cards fetched live from the `games` table. Each card displays the game icon, name, and spawn type count. Includes a "Custom Game" card for starting from scratch.
- **Game-agnostic copy** — hero demo label changed from "Yvonne 6" to "Demo Server". Feature card updated from "39+ bosses tracked" to "Multi-game boss & activity tracking". JSON-LD structured data updated to describe a multi-game platform.
- **Page title** — updated to "RaidScout — Multi-Game Guild Operations Platform"

## 🔒 Security

- **Catch blocks audited** — all critical data paths (death records, attendance, analytics, spawn overrides, party leaders, AI scan saves) now log failures. Truly harmless catches (localStorage in private browsing, AudioContext, JSON.parse on user input) left intentionally silent.

## 🧪 Testing

- **27 new integrity tests** — `src/lib/integrity.test.ts` covering:
  - `concurrentMap` utility (7 tests): correct parallel processing, ordering, error propagation, edge cases, large input
  - Bot build integrity (3 tests): valid JS output via `new Function()`, spawn-cron logic bundled, error logging present
  - Error logging behavior (2 tests): `catch(err) { console.error(...) }` doesn't throw, preserves error info
  - File validation (15 tests): all 14 changed files exist and have content, zero silent `catch {}` in 6 critical files
- **155 tests total** (152 passing, 3 pre-existing FilterBar UI placeholder mismatches)
