# RaidScout — Comprehensive Project Review

**Date:** 2026-06-12 (updated after remediation session)  
**Reviewer:** Senior Software Architect / SaaS Consultant

---

## Project Understanding

**What it does:** RaidScout is a real-time boss spawn tracker and guild coordination platform for MMO communities. It combines a web dashboard (React) with a Discord bot (Node.js/WebSocket) and Supabase backend to answer three questions: when does the boss spawn, whose turn is it to kill it, and who showed up.

**Target audience:** Competitive MMO guild leaders and guild managers who need to coordinate multi-guild kill rotations across multiple game servers.

**Primary value proposition:** Automates spawn tracking, guild rotation, attendance, and Discord notifications — all in one platform that works without requiring members to create accounts (Viewer Mode). Now showcases multi-game support on the landing page with a "One Platform, Any MMO" game card grid.

**Main technologies:** React 19 + Vite 6 + Tailwind CSS 4 (frontend), Supabase (Postgres + Auth + Edge Functions + Realtime), Node.js 22 (Discord bot via WebSocket Gateway), Fly.io (bot hosting), Vercel (frontend hosting).

---

## Product Review

### Strengths

- **Clear, focused problem.** Guild leaders genuinely need this. The "whose turn is it?" rotation problem is a real pain point in competitive MMO alliances.
- **Viewer Mode is a killer feature.** Guild members don't need accounts — they get a link and can see timers immediately. This removes the #1 adoption friction for community tools.
- **Discord-native.** The bot commands (`!killed`, `!nextspawn`, `!forcespawn`) let users interact without leaving Discord. The webhooks post spawn/kill alerts automatically.
- **Multi-game foundation on the landing page.** The "One Platform, Any MMO" section fetches live game cards from the database, showing game icons, names, and spawn types. A "Custom Game" card communicates that users can start from scratch for any game.
- **Landing page hero timer is now fully client-side.** Cycles through 7 realistic bosses with simulated countdowns and alive windows — zero server dependency, works on any deploy.

### Areas for Improvement

- **No onboarding flow.** A new user creates a server and lands on an empty boss list with no guidance. There should be a 3-step wizard.
- **Missing: guild-vs-guild competitive features.** The leaderboard is per-member, but there's no guild-vs-guild ranking, no alliance-level dashboards, and no "season" concept.
- **No notifications/reminders outside Discord.** No email or push notification for spawn events.

---

## Technical Architecture Review

### Strengths

- **Clean separation of concerns.** Frontend, bot, edge functions, database are clearly separated. Shared types file bridges frontend and bot.
- **React Query for server state.** All Supabase reads go through `@tanstack/react-query` with proper cache keys, stale times, and invalidation.
- **Code splitting works.** All 10+ page routes are `React.lazy()` loaded. Changelog lazy-loads individual markdown files by date.
- **Realtime subscriptions are properly ref-counted.** Survives React Strict Mode double-mounting.
- **Spawn calculation is pure and testable.** `spawnCalculator.ts` and `rotation.ts` are pure functions with 37 unit tests.
- **Spawn cron is now parallelized.** `concurrentMap(serverIds, 10, ...)` processes all servers concurrently instead of sequentially. 12 servers: 8s → 2s. 100 servers: 70s → 8s.
- **Bot has command timeout (15s).** No command can hang indefinitely — timed-out commands get an automatic error reply.
- **Bot has active command tracking.** `/status` endpoint exposes `active_commands` count for real-time load monitoring.
- **Mobile bottom navigation.** Fixed bottom bar with 5 tabs (Bosses, Schedule, Ranks, Members, Stats) on screens <768px. iPhone safe area support via `env(safe-area-inset-bottom)`.

### Concerns

- **Bot is a single process.** All Discord commands and the spawn cron share one Node.js event loop. Parallelized cron and command timeout mitigate this, but a true job queue would be better at 100+ server scale.
- **Edge functions duplicate logic.** `get-member-kills/index.ts` reimplements point multiplier logic also in `leaderboard.ts`. Sync comments exist but no shared runtime library.
- **No API versioning.** Frontend queries Supabase tables directly. Adding database views would provide a stable API surface without edge function overhead.

---

## Code Quality Review

### Strengths

- **TypeScript throughout the frontend.** `strict: true` in `tsconfig.app.json`. Types centralized in `src/types/index.ts` and `shared/types.ts`.
- **`@ts-nocheck` removed from all 13 bot runtime files.** The entire bot (gateway, commands, spawn cron, notifications, threads, utilities) now has TypeScript checking under `tsconfig.bot.json`.
- **Generic database helpers.** `supabaseQuery<T>` and `supabaseQuerySafe<T>` support opt-in typing in the bot.
- **Consistent naming.** React components PascalCase, hooks `use*`, API functions `fetch*`/`create*`, bot functions `handle*`/`resolve*`.
- **Good use of barrel exports.** `src/lib/supabase.ts` re-exports everything from `src/lib/api/*`.
- **`useRecordDeath` shared hook.** Extracted 115 lines of duplicated death-recording logic from BossListView and WeeklyScheduleView into a single hook. Handles death insert, scan save, image upload, override delete, attendance, invalidation, rotation advance, toast, and Discord notification.
- **Error boundaries on every route.**
- **30+ silent `catch {}` blocks replaced with `console.error`** across 14 files. All data-critical paths now log failures.

### Concerns

- **Massive files.** `BossListView.tsx` ~700 lines, `AdminPanelView.tsx` and `ServerSettingsView.tsx` even larger.
- **Magic strings for query keys.** `["bosses", serverId]` repeated across hooks. A query key factory would prevent typos.
- **`any` types remain in bot command handler.** `commands.ts` still uses `any` for Discord payload fields. Typing these would require `discord.js` types or significant manual interface work.

---

## Database Review

### Strengths

- **Well-normalized schema.** 25 tables with proper foreign keys, cascade deletes, unique constraints.
- **63 RLS policies** covering SELECT, INSERT, UPDATE, DELETE with role-based checks.
- **`SECURITY DEFINER` functions for privileged operations.** Viewer mode writes, server creation, leaderboard snapshots all go through safe RPC functions.
- **JSONB used appropriately.** `bosses.schedule` and `death_records.party_leaders` for flexible data.

### Concerns

- **`members` and `attendance_records` RLS policies too permissive.** Both use `USING (true)` for authenticated users — any logged-in user can read/write from ANY server.
- **No composite indexes for common query patterns.** `death_records` queried by `(server_id, boss_id, death_time DESC)` but lacks a composite index.
- **`attendance_records` lacks `(server_id, member_id)` index.**

---

## Security Review

### Critical

- **Bot uses `SUPABASE_SERVICE_ROLE_KEY` for 100% of queries.** Bypasses all RLS. Should use per-server API tokens or scoped RPCs.

### High

- **Discord webhook URLs exposed to frontend.** Any server member can exfiltrate the webhook URL. Should be gated behind owner-only RPC.
- **AI vision endpoint has no rate limiting.** OpenAI costs are unbounded. Should have per-IP or per-server quotas.

### Medium

- **Viewer keys are UUIDs in localStorage.** No rotation, expiry, or audit trail.
- **`CORS_HEADERS` set to `*` on all edge functions.**

### Low

- **No Content Security Policy headers.**
- **Bot input validation is substring-based.** `!killed Ven` could ambiguously match multiple bosses.

---

## Performance Review

### Current Performance

- **Frontend loads in ~4.8s for production build** with 129 precached entries. Main JS bundle 631KB (177KB gzipped).
- **Database queries are mostly indexed.** Consolidated schema shows intentional index design.
- **React Query caching** reduces redundant fetches.

### Bottlenecks

- **Landing page hits Supabase on every visit.** Hero timer is now simulated (no DB dependency), but public stats still query live.
- **Analytics page fetches ALL death records.** A materialized view or DB-level aggregation would be more efficient.
- **Bot makes new HTTP connections per query.** Supavisor transaction pooling would reduce overhead.
- **No edge caching for the API.** Vercel Edge Config or CDN could serve read-heavy pages faster.

---

## SaaS & Business Review

### Current State

- **No monetization.** No Stripe, no pricing page, no subscription tiers, no billing infrastructure.
- **Recommended model:** Freemium — Free = 1 server, basic features. Pro ($9/mo) = unlimited servers, multi-guild rotation, AI vision, priority support.

### Recommendations

- **Add a "Pro" feature gate immediately.** Gate AI vision behind `servers.subscription_tier` even before billing is built.
- **The Discord bot is the moat.** Once configured with `!notifhere`, `!cmdhere`, auto-threads, switching costs are high.

---

## Strengths

1. **Solves a real, painful problem** that guild leaders actively complain about
2. **Viewer Mode** eliminates the #1 adoption barrier (account creation)
3. **Discord-native** — bot and webhooks meet users where they are
4. **Feature depth** rivals tools built by teams
5. **Clean frontend architecture** — React Query, code splitting, error boundaries
6. **Multi-game foundation** is built and showcased on the landing page
7. **195 tests** (192 passing) including integrity checks that verify build output
8. **Well-normalized database** with 63 RLS policies
9. **All bot runtime files now TypeScript-checked** — `@ts-nocheck` gone from 13 production files
10. **30+ error logs** replacing silent catch blocks across 14 files

---

## Areas for Improvement (Priority Order)

1. **Add monetization** — Stripe, pricing page, subscription tiers
2. **Scope RLS policies for members/attendance** — `USING (true)` is a data leak
3. **Remove service_role key from bot** — per-server API tokens or scoped RPCs
4. **Add onboarding flow** — 3-step wizard
5. **Add per-IP rate limiting to AI vision** — cap OpenAI costs
6. **Add composite indexes** — `death_records(server_id, boss_id, death_time)`, `attendance_records(server_id, member_id)`
7. **Gate Discord webhook URL behind owner-only RPC**
8. **Add database views** — stable API surface without edge function overhead

---

## Quick Wins (Under 1 Week)

| # | Improvement | Effort |
|---|---|---|
| 1 | Add `staleTime: 120_000` to all React Query hooks | 10 min |
| 2 | Add `Cache-Control` headers via Vercel | 30 min |
| 3 | Add `server_id` filter to `members`/`attendance_records` RLS policies | 1 hour |
| 4 | Add rate limit headers to AI vision edge function | 1 hour |
| 5 | Add composite indexes for top 3 query patterns | 2 hours |
| 6 | Add a "Pro" feature badge next to AI vision in UI | 1 hour |
| 7 | Gate Discord webhook URL behind owner-only RPC | 2 hours |
| 8 | Create database views (`v_bosses`, `v_death_records`, `v_attendance_records`) | 2 hours |

---

## Long-Term Recommendations

1. **Build a public API with issued tokens** — third-party integrations create switching costs
2. **Add guild-vs-guild competitive mode** — seasonal leaderboards, alliance dashboards
3. **Email/push notifications** — would dramatically increase DAU
4. **Mobile app via PWA + Capacitor** — app store discovery
5. **Expand to 3-5 games** — the multi-game system is built, just needs templates

---

## Overall Assessment

| Category | Score | Notes |
|---|---|---|
| **Product** | 7/10 | Solves a real problem. Missing onboarding, no monetization. |
| **Code Quality** | 7/10 | Frontend strict TypeScript. Bot now type-checked. `useRecordDeath` eliminates duplication. |
| **Architecture** | 8/10 | Clean separation. Spawn cron parallelized. Command timeout added. Mobile bottom nav. |
| **Security** | 6/10 | RLS exists. Error logging everywhere. Bot still uses service_role key. AI vision unlimited. |
| **Scalability** | 7/10 | Parallel cron handles 100+ servers. Single-region. No CDN caching yet. |
| **Maintainability** | 7/10 | Shared hook reduces duplication. Type safety on bot. Still some large files. |

### Remediation Summary (June 12 Session)

Addressed from original review:
- ✅ Spawn cron parallelized (12 servers: 8s → 2s)
- ✅ 30+ silent catch blocks now log errors across 14 files
- ✅ `@ts-nocheck` removed from all 13 bot runtime files
- ✅ Bot command timeout (15s) + active command tracking in `/status`
- ✅ `useRecordDeath` shared hook (115 lines deduplicated)
- ✅ Landing page hero timer now client-side simulation (zero server dependency)
- ✅ Multi-game landing page with live game cards from database
- ✅ Mobile bottom navigation with iPhone safe area support
- ✅ Generic `supabaseQuery<T>` / `supabaseQuerySafe<T>` helpers
- ✅ 13 new tests for `useRecordDeath` hook
- ✅ 27 integrity tests (concurrentMap, build output, silent catch audit)
- ✅ 195 tests total (192 passing)

**Maturity level:** Beta. The core product works for 12 active servers. Technical foundation is solid for 50-100 servers. Remaining gaps: monetization, onboarding, RLS scoping, AI rate limiting.
