# June 12, 2026 — Changelog (v0.14.4)

## ⚡ Performance

- **Parallel spawn cron** — the 60-second cron that checks boss spawns now processes all servers in parallel (concurrency cap of 10) instead of sequentially. 12 servers: 8s → 2s. 100 servers: 70s → 8s. No more risk of cron ticks overlapping at scale.
- **Analytics attendance batching** — activity attendance is now fetched in a single `IN` query (paginated) instead of record-by-record. Removes the N+1 query pattern entirely.

## 🐛 Bug Fixes

- **Silent error swallowing eliminated** — 30+ `catch {}` and `catch { /* ignore */ }` blocks replaced with `console.error` logging across 14 files (analytics, bosses, bot commands, notifications, spawn cron, attendance, history, death records, party management). The analytics attendance bug was originally caused by silently skipped batch errors — now impossible to miss.
- **New schedule bosses showed "alive" immediately** — fixed in both the web app and Discord bot. Newly created fixed-schedule bosses and activities no longer appear as "alive/active" from past schedule slots. They now correctly show countdown to the next upcoming slot. Only bosses with an actual death record (or activities with an instance) are considered "alive."
- **Activity history leaked across servers** — `fetchActivityHistory` was missing the `server_id` filter on the `activities` join. New servers no longer see completed activities from other servers.
- **Activity guild badges missing** — activity cards on the Bosses/Activities page and the Upcoming Activities strip now show colored guild badges, matching boss cards. Activity guilds are fetched and resolved from `activity_guilds`.

## 🤖 Discord Bot

- **Spawn cron parallelization** — per-server boss checks now run concurrently via `concurrentMap(serverIds, 10, ...)`. Servers no longer wait for each other; the slowest server no longer delays all others.
- **`continue` → `return bossCount`** — fixed build error where `continue` was used inside an async callback (now correctly returns the boss count for the parallel results accumulator)
- **`supabaseQuerySafe` now logs errors** — previously swallowed all query failures and returned `[]`. Now logs the path and error before returning the empty fallback.
- **Bot role fetch failure logged** — Discord role resolution failures now produce `console.error` with guild ID and error details.
- **Command timeout (15s)** — every Discord command now has a hard 15-second timeout. If the database is slow, the bot replies "Command timed out" instead of hanging silently forever.
- **Active command tracking** — `/status` endpoint now includes `active_commands` count for monitoring bot load in real time.
- **Concurrency module** — new `scripts/bot/concurrency.ts` tracks in-flight commands and enforces timeouts via `Promise.race`.
- **Custom boss/activity timezone fix** — `getScheduleTz` now checks `is_custom` flag. Custom bosses and activities store schedules in UTC, not Asia/Manila. Fixes spawn time mismatches between bot and website for custom items.
- **Schedule active window fix** — `!nextspawn` no longer marks new bosses as "ALIVE NOW" or new activities as "ACTIVE NOW" without an existing death record or activity instance.

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
- **13 new useRecordDeath tests** — verifies death insert, scan save, image upload, attendance, query invalidation, rotation advance, toast notifications, and Discord notification dispatch
- **195 tests total** (192 passing, 3 pre-existing FilterBar UI placeholder mismatches)

---

## 🔧 Bot Reliability

- **Command timeout (15s)** — every Discord command now has a hard 15-second timeout. If the database is slow, the bot replies "Command timed out" instead of hanging silently forever.
- **Active command tracking** — `/status` endpoint now includes `active_commands` count for monitoring bot load in real time.
- **Concurrency module** — new `scripts/bot/concurrency.ts` tracks in-flight commands and enforces timeouts via `Promise.race`.

## 🏗️ Type Safety

- **`@ts-nocheck` removed from all 13 bot runtime files** — the entire bot runtime (gateway, commands, spawn cron, notifications, threads, party utils, server cache, guild join, Discord API, config, logging, supabase helpers, concurrency) now has TypeScript checking under `tsconfig.bot.json`.
- **Generic database helpers** — `supabaseQuery<T>` and `supabaseQuerySafe<T>` now support opt-in typing. Callers can provide a type parameter to get typed returns; defaults to `any` for backward compatibility.
- **Fixed `shared/types.ts` import** — `leaderboard.ts` now correctly imports `MemberBossKill` and `MemberActivityAttendance` from the shared types module. Added `shared/*` path alias to both `tsconfig.app.json` and `vite.config.ts`.

## ♻️ Code Quality

- **`useRecordDeath` shared hook** — extracted 115 lines of duplicated death-recording logic from `BossListView` and `WeeklyScheduleView` into a single hook. Both files now call `recordDeath({ bossId, bossName, deathTime, attendeeIds, ... })`. Handles: death insert, AI scan save, rally image upload, spawn override delete, attendance loop, query invalidation, rotation advance, toast notifications, Discord notification.

## 🎨 UI

- **Simulated landing page hero timer** — replaced the hardcoded server-dependent demo timer with a fully client-side simulation. Cycles through 7 realistic bosses (Venatus, Viorent, Ego, Lady Dalia, Livera, Clemantis, Icaruthia) with countdowns, alive windows, and automatic respawn. Works on any deploy with zero server dependency.
- **Centered game cards** — "One Platform, Any MMO" game cards now use centered flexbox layout instead of left-aligned grid.
- **Add Boss & Add Activity modals** — moderators can now create custom bosses and activities directly from the Bosses/Activities page via "Add Boss" and "Add Activity" buttons in the filter bar. Each opens a modal with the same fields as Server Settings (name, spawn type, schedule, points, category, tags, image upload). Buttons are inline with filter controls and hidden in viewer mode.
- **Inline filter bar layout** — "Add Boss" and "Add Activity" buttons now flow inline with filter buttons (All, Timer, Schedule, etc.) instead of being pushed to the far right. FilterBar `extra` prop alignment is now consumer-controlled.
- **Party assignment removed from attendance modal** — the "Assign a party to this boss" and "Quick party" dropdowns have been removed from the DeathRecordModal (mark-dead attendance screen). Parties are now managed exclusively from the BossCard.
- **Escape key on all modals** — every modal and inline panel throughout the app now closes on Escape: MembersView (delete confirm, bulk add), ServerSettingsView (delete server confirm, add point rule), BossCard (5 internal modals), HistoryView (2 modals), LandingPage, LeaderboardView (6 modals). Added `useEscapeKey` hook for consistent keyboard dismissal.

## 🖼️ Fullscreen Rally Image UX

- **Two-step Escape behavior** — pressing Escape while viewing a rally screenshot fullscreen now closes only the image on the first press; a second Escape press closes the modal behind it. Applied to `DeathRecordModal` (boss kills) and `ParticipantModal` (history entries).
- **Parent Escape interference fixed** — `BossCard` and `HistoryView` had their own Escape handlers that were accidentally closing the `DeathRecordModal`/`ParticipantModal` on the first Escape press alongside the image. Now each parent only manages its own internal modals and delegates Escape to the child modal.
- **Fullscreen image closes on click** — clicking the dark backdrop behind the fullscreen image also dismisses just the image (not the modal).

## 🧪 Testing

- **`useEscapeKey` tests** (8 new) — covers: callback on Escape, ignore non-Escape keys, disabled mode, `preventDefault` call, cleanup on unmount, callback updates on rerender, enabled/disabled toggle, and two-step fullscreen→modal Escape behavior.

## 📄 Documentation

- **Comprehensive project review** — `docs/PROJECT_REVIEW.md` with detailed assessments across product, UX, architecture, code quality, security, database, performance, SaaS/business, and launch readiness.

---

## ✨ New Features (June 12 — late session)

### 🏪 Guild Assignment on Boss/Activity Creation

- **Add Boss modal** — creating a custom boss now includes a Guild Assignment section with all 4 modes (None / Rotation / Daily / Schedule). Defaults to Rotation with the first guild auto-selected. Available from both the main page filter bar and Server Settings → Bosses tab.
- **Add Activity modal** — same guild assignment UI for custom activities. Uses `setActivityGuilds` for assigning guilds to activities.
- **"Add" button repositioned** — submit buttons moved to a full-width footer at the bottom of both modals and the Server Settings forms, with sticky styling.

### 🔄 Auto-Assign Guild on Server Creation

- **Migration `006_auto_assign_guild`** — `create_server_with_bosses` RPC now auto-assigns ALL bosses and activities to the first guild when a server has exactly 1 guild. Uses rotation (per-kill) mode. No more manual setup needed for single-guild servers.
- **Loading spinner** — server creation spinner now shows "Assigning all bosses to [guild] (rotation mode)..." when a guild name is provided.

### 🔒 Sign-Up Improvements

- **Confirm password field** — sign-up form now requires entering the password twice. Red/green border feedback shows match status in real time.
- **Password strength indicator** — color-coded progress bar (red → amber → green) with WEAK / MEDIUM / STRONG labels. Weak passwords are rejected with a descriptive error message.

### 🛡️ Infrastructure

- **`discord_configs` RLS policies** — added read access for authenticated and anon users to the `discord_configs` table, ensuring the bot can always read Discord server links.

## 🧪 Testing (late session)

- **`AddBossModal` tests** (10 new) — covers: null when closed, title/form rendering, guild assignment modes, guild section visibility, close via X/backdrop, footer button, rotation guild list, schedule day dropdowns.
- **`create_custom_boss` SQL test** — verifies the RPC creates bosses/activities correctly with proper guild assignment, then cleans up. Uses `auth.uid()` for authentication.
