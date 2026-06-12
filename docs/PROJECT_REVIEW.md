# RaidScout — Comprehensive Project Review

**Date:** 2026-06-12  
**Reviewer:** Senior Software Architect / SaaS Consultant

---

## Project Understanding

**What it does:** RaidScout is a real-time boss spawn tracker and guild coordination platform for MMO communities. It combines a web dashboard (React) with a Discord bot (Node.js/WebSocket) and Supabase backend to answer three questions: when does the boss spawn, whose turn is it to kill it, and who showed up.

**Target audience:** Competitive MMO guild leaders and guild managers who need to coordinate multi-guild kill rotations across multiple game servers.

**Primary value proposition:** Instead of tracking boss timers in spreadsheets and arguing about whose turn it is in Discord, RaidScout automates spawn tracking, guild rotation, attendance, and Discord notifications — all in one platform that works without requiring members to create accounts (Viewer Mode).

**Main technologies:** React 19 + Vite 6 + Tailwind CSS 4 (frontend), Supabase (Postgres + Auth + Edge Functions + Realtime), Node.js 22 (Discord bot via WebSocket Gateway), Fly.io (bot hosting), Vercel (frontend hosting).

---

## Product Review

### Strengths

- **Clear, focused problem.** Guild leaders genuinely need this. The "whose turn is it?" rotation problem is a real pain point in competitive MMO alliances.
- **Viewer Mode is a killer feature.** Guild members don't need accounts — they get a link and can see timers immediately. This removes the #1 adoption friction for community tools.
- **Discord-native.** The bot commands (`!killed`, `!nextspawn`, `!forcespawn`) let users interact without leaving Discord. The webhooks post spawn/kill alerts automatically. This is where the target audience lives.
- **Feature depth is impressive for a solo developer.** Multi-mode rotation (per-kill, daily, schedule), AI rally screenshot scanning, point-based leaderboards, activity tracking, weekly schedule grid, Excel export — this competes with tools built by teams.
- **Multi-game foundation exists.** The `games` table, admin panel game management, and template seeding system mean the product could support any MMO with timed spawns.

### Areas for Improvement

- **No onboarding flow.** A new user creates a server and lands on an empty boss list with no guidance. There should be a 3-step wizard: name your server → pick a game (seeded) → invite members via viewer link.
- **Mobile UX is desktop-first.** The PWA manifest exists and the site loads on mobile, but cards, filters, and the weekly schedule grid are clearly designed for desktop screens. Touch targets are small, and there's no bottom navigation.
- **The landing page hero timer is fragile.** It queries a hardcoded demo server that may not exist on staging/new deploys. If the demo server is soft-deleted or its bosses change, the hero shows `--:--:--`.
- **No notifications/reminders for users.** There's no email or push notification for "your boss spawns in 30 minutes." The only alert channel is Discord. Browser notifications exist but rely on the tab being open.
- **Missing: guild-vs-guild competitive features.** The leaderboard is per-member, but there's no guild-vs-guild ranking, no alliance-level dashboards, and no "season" concept for competitive play.

### Feature Prioritization Assessment

The features that exist are the right ones for the core use case. The sequencing has been reactive (fix bugs → add Discord bot → add activities). The missing pieces are all in the "growth and retention" category rather than core functionality.

---

## Technical Architecture Review

### Strengths

- **Clean separation of concerns.** Frontend (`src/`), bot (`scripts/bot/`), edge functions (`supabase/functions/`), database (`supabase/migrations/`) are clearly separated. The shared types file (`shared/types.ts`) bridges frontend and bot.
- **React Query for server state.** All Supabase reads go through `@tanstack/react-query` with proper cache keys, stale times, and invalidation. This is the correct pattern and avoids the common mistake of putting server state in React Context.
- **Code splitting works.** All 10+ page routes are `React.lazy()` loaded. The changelog even lazy-loads individual markdown files by date.
- **Realtime subscriptions are properly ref-counted.** `useBosses`, `useDeathRecords`, and `useActivities` all deduplicate subscriptions using `activeBossSubscriptions` / `activeActivitySubscriptions` sets, surviving React Strict Mode double-mounting.
- **The bot uses Discord's Gateway correctly.** Heartbeat, reconnect with backoff, identify payload — these are non-trivial to implement correctly and they work.
- **Spawn calculation is pure and testable.** `spawnCalculator.ts` and `rotation.ts` are pure functions with 37 unit tests. This is the right approach for complex date math.

### Concerns

- **Bot is a single process with no queue.** All Discord commands and the 60-second spawn cron run in one Node.js event loop. A slow database query blocks all message processing for all servers. This was partially addressed by parallelizing the cron, but the command handler is still synchronous.
- **Edge functions duplicate logic.** `get-member-kills/index.ts` reimplements point multiplier logic and guild resolution that also exists in the frontend `leaderboard.ts`. There's no shared library between Deno edge functions and the frontend.
- **No API versioning.** The Supabase REST API is called directly from the frontend. Any schema change (column rename, table restructure) is a breaking change for all active browser sessions.
- **`@ts-nocheck` on 25 files including the bot's entire runtime.** The bot gateway, command handler, spawn cron, and all edge functions have zero type safety. The `tsconfig.bot.json` helps for files without the directive, but the directive overrides it.

---

## Code Quality Review

### Strengths

- **TypeScript throughout the frontend.** `strict: true` in `tsconfig.app.json`. Types are centralized in `src/types/index.ts` and `shared/types.ts`.
- **Consistent naming.** React components use PascalCase, hooks use `use*` prefix, API functions use `fetch*`/`create*`/`update*`/`delete*` pattern, bot functions use `handle*`/`resolve*`.
- **Good use of barrel exports.** `src/lib/supabase.ts` re-exports everything from `src/lib/api/*`, providing a single import surface.
- **Tests exist and cover critical paths.** 182 tests across 11 files. Spawn calculation, rotation logic, bot commands, party list formatting, and integrity checks all have coverage. The integrity tests verify TypeScript compilation, esbuild output validity, and silent catch audit.
- **Error boundaries on every route.** `ErrorBoundary` wraps lazy-loaded routes, preventing a single component crash from taking down the whole app.

### Concerns

- **Massive files.** `BossListView.tsx` is likely 700+ lines. `AdminPanelView.tsx` and `ServerSettingsView.tsx` are even larger. These would benefit from being split into smaller, focused components.
- **Copy-paste between BossListView and WeeklyScheduleView.** Both have nearly identical death recording logic (scan results save, rally image upload, spawn override delete, attendance loop, rotation advance). This should be extracted into a shared hook or utility.
- **Inline Supabase queries in components.** `BossListView.tsx` calls `supabase.from("boss_spawn_overrides").delete()` directly. `ParticipantModal.tsx` calls `supabase.from("death_records").update()`. These should go through the API layer.
- **Magic strings for query keys.** `["bosses", serverId]`, `["death_records", serverId]` are repeated across hooks. A query key factory would prevent typos and make invalidation safer.
- **`any` types are common in the bot.** `supabaseQuery` returns `Promise<any>`. Most bot variables are typed as `any`. This is a direct consequence of `@ts-nocheck`.

---

## Database Review

### Strengths

- **Well-normalized schema.** 25 tables with proper foreign keys, cascade deletes, and unique constraints. The `bosses` → `death_records` → `attendance_records` → `members` chain is clean.
- **RLS policies on all tables.** 63 policies covering SELECT, INSERT, UPDATE, DELETE with role-based checks (`server_members.role`, `user_roles.role`).
- **`SECURITY DEFINER` functions for privileged operations.** Viewer mode writes, server creation with seed, leaderboard snapshots, and admin operations all go through RPC functions that bypass RLS safely.
- **JSONB used appropriately.** `bosses.schedule` and `death_records.party_leaders` use JSONB for flexible data that doesn't need relational queries.

### Concerns

- **`members` and `attendance_records` RLS policies are too permissive.** Both use `USING (true)` for authenticated users — any logged-in user can read/write members and attendance from ANY server. The `server_id` column was added later but the policies weren't scoped.
- **No composite indexes for common query patterns.** `death_records` is queried by `(server_id, boss_id, death_time DESC)` but only has individual indexes. A composite index on `(server_id, boss_id, death_time)` would speed up the most frequent query pattern.
- **`attendance_records` queries filter by `server_id` but the index is only on `(death_record_id, member_id)`.** An index on `(server_id, member_id)` would help the analytics and leaderboard queries.
- **No database-level constraints on `boss_guilds.mode`.** The CHECK constraint exists but doesn't prevent a boss from having both `rotation` and `schedule` assignments simultaneously with conflicting day_of_week values.

---

## Security Review

### Critical

- **Bot uses `SUPABASE_SERVICE_ROLE_KEY` for 100% of queries.** This bypasses all RLS. A compromised bot token = full database access. The bot should use per-server API keys or at minimum scope its queries through `SECURITY DEFINER` RPCs with ownership checks.

### High

- **Discord webhook URLs exposed to frontend.** `servers.discord_webhook_url` is returned in standard SELECT queries. Any server member can exfiltrate it and spam the channel. Should be gated behind a `SECURITY DEFINER` RPC that only returns it to owners.
- **No input validation on bot commands.** `!killed <boss>` matches boss names via substring. `!editkilltime <boss> HH:MM` has no bounds checking on hours/minutes. The Supabase REST API parameterization prevents SQL injection, but the bot also makes raw `fetch()` calls with string interpolation.
- **AI vision endpoint has no rate limiting.** Anyone with the web app open can upload screenshots repeatedly, running up OpenAI costs. Should have per-IP or per-server quotas.

### Medium

- **Viewer keys are UUIDs stored in localStorage.** They're not secrets (they grant read access), but there's no rotation mechanism, no expiry, and no audit trail for viewer key usage.
- **`CORS_HEADERS` set to `*` on all edge functions.** This is necessary for the architecture but means any website can call the edge functions if they know the URL.

### Low

- **`@ts-nocheck` files skip all type-based security checks.** If someone adds a query with unsanitized string interpolation to `commands.ts`, TypeScript won't catch it.
- **No Content Security Policy headers.** The app doesn't set CSP, leaving it vulnerable to XSS if an attacker can inject content into a rendered field.

---

## Performance Review

### Current Performance

- **Frontend loads in ~5.8s for production build** with 129 precached entries. The main JS bundle is 629KB (177KB gzipped), which is reasonable for a SPA of this complexity.
- **Database queries are mostly indexed and efficient.** The consolidated schema migration shows intentional index design.
- **React Query caching reduces redundant fetches.** `staleTime` is set on most queries.

### Bottlenecks

- **Landing page hits Supabase on every visit.** The hero timer and public stats make live database queries. These should be cached at the CDN level (Vercel Edge Config or stale-while-revalidate).
- **Analytics page fetches ALL death records** (paginated with 1000-row batches). For a server with 50,000 kills, this could mean 50 round-trips. A materialized view or database-level aggregation would be more efficient.
- **The bot's `supabaseQuery` makes a new HTTP connection per query.** Supabase connection pooling (Supavisor in transaction mode) would reduce connection overhead.
- **No edge caching for the API.** Every boss/death/attendance read hits Postgres directly. Vercel's Edge Config or a CDN with stale-while-revalidate could serve read-heavy pages with sub-100ms latency.

---

## SaaS & Business Review

### Current State

- **No monetization.** Zero. No Stripe, no pricing page, no subscription tiers, no payment intent anywhere in the codebase.
- **No pricing page.** The landing page says "Forever free" in the meta description.
- **No billing infrastructure.** `servers` table has no `subscription_tier`, `stripe_customer_id`, or `trial_ends_at` columns.

### Recommendations

- **Start with a simple freemium model:** Free = 1 server, 1 guild, basic features. Pro ($9/mo) = unlimited servers, multi-guild rotation, AI vision, priority support. The server-based pricing is natural — more servers = more value.
- **Add a "Pro" feature gate immediately.** Even if billing isn't implemented yet, gate AI vision behind a `servers.subscription_tier` check. This creates perceived value and urgency.
- **The Discord bot is the moat.** Once a guild has the bot configured with `!notifhere`, `!cmdhere`, auto-threads, and custom prefixes, switching costs are high. Lean into this — make the bot even more indispensable.

---

## Strengths

1. **Solves a real, painful problem** that guild leaders actively complain about
2. **Viewer Mode** eliminates the #1 adoption barrier (account creation)
3. **Discord-native** — the bot and webhooks meet users where they already are
4. **Feature depth** rivals tools built by teams, not solo developers
5. **Clean frontend architecture** — React Query, code splitting, error boundaries
6. **Multi-game foundation** is already built and working
7. **182 tests** including integrity checks that verify build output validity
8. **Well-normalized database** with 63 RLS policies and proper foreign keys
9. **Active development velocity** — rapid iteration fixing real issues
10. **Production-grade infrastructure** — Vercel + Fly.io + Supabase Pro is a legitimate stack

---

## Areas for Improvement (Priority Order)

1. **Add monetization** — Stripe integration, pricing page, subscription tiers. This is the difference between a hobby and a business.
2. **Scope RLS policies for members/attendance** — `USING (true)` is a data leak waiting to happen.
3. **Remove service_role key from bot** — issue per-server API tokens or use scoped RPCs.
4. **Add onboarding flow** — 3-step wizard turns "empty boss list" into "ready to track."
5. **Extract shared death-recording logic** — BossListView and WeeklyScheduleView have 50+ lines of identical code.
6. **Add per-IP rate limiting to AI vision** — cap OpenAI costs before they become a problem.
7. **Add composite indexes** — `death_records(server_id, boss_id, death_time)` and `attendance_records(server_id, member_id)`.
8. **Mobile-responsive polish** — bottom nav, touch-optimized cards, responsive weekly schedule.

---

## Quick Wins (Under 1 Week)

| # | Improvement | Effort |
|---|---|---|
| 1 | Add `staleTime: 120_000` to all React Query hooks | 10 min |
| 2 | Add `Cache-Control` headers via Vercel for landing page | 30 min |
| 3 | Add `server_id` filter to `members`/`attendance_records` RLS policies | 1 hour |
| 4 | Add rate limit headers to AI vision edge function | 1 hour |
| 5 | Extract a `useRecordDeath` hook from BossListView + WeeklyScheduleView | 3 hours |
| 6 | Add composite indexes for top 3 query patterns | 2 hours |
| 7 | Add a "Pro" feature badge next to AI vision in the UI | 1 hour |
| 8 | Gate Discord webhook URL behind owner-only RPC | 2 hours |

---

## Long-Term Recommendations

1. **Build a public API with issued tokens** — this is how platforms in this space get sticky. Third-party integrations create switching costs.
2. **Add a guild-vs-guild competitive mode** — seasonal leaderboards, alliance dashboards, "war" tracking. This drives engagement and retention.
3. **Email/push notifications** — "Venatus spawns in 30 minutes" as a push notification would dramatically increase daily active users.
4. **Mobile app via PWA + Capacitor** — the PWA foundation is there. A proper app store listing would increase discovery.
5. **Expand to 3-5 games** — the multi-game system is built. Seed templates for other MMOs to prove the platform isn't tied to one game.

---

## Overall Assessment

| Category | Score | Notes |
|---|---|---|
| **Product** | 7/10 | Solves a real problem well. Missing onboarding and mobile polish. |
| **Code Quality** | 6/10 | Frontend is solid. Bot has zero type safety and heavy `any` usage. |
| **Architecture** | 7/10 | Clean separation. Bot is single-process. Multi-game foundation exists. |
| **Security** | 5/10 | RLS exists but is too permissive. Bot uses service_role key. No rate limiting on AI. |
| **Scalability** | 6/10 | Spawn cron parallelized. Single-region. No CDN caching. Database can handle 10x current load. |
| **Maintainability** | 6/10 | Good patterns but massive files, copy-paste, and inconsistent API layer usage. |

**Maturity level:** Late-alpha / early-beta. The core product works for 12 active servers with real users. The technical foundation is solid enough to support 50-100 servers. The missing pieces are business (monetization), growth (onboarding, mobile), and hardening (RLS scoping, bot type safety, AI rate limiting).

**Production readiness:** Ready for current scale. Not ready for a public launch with marketing push. The product would survive a soft launch to existing Discord communities but would struggle with an influx of 100+ new servers due to onboarding friction and the lack of rate limiting on AI costs.
