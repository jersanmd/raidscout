<p align="center">
  <img src="public/logo.png" alt="RaidScout" width="80" height="80" />
</p>

<h1 align="center">RaidScout</h1>

<p align="center">
  <strong>The Operating System for Competitive MMO Guilds</strong><br />
  Track world bosses across multiple servers, coordinate multi-guild kill rotations,
  scan rally screenshots with AI, and compete on live leaderboards — all in real time.
</p>

<p align="center">
  <a href="https://www.raidscout.com"><img src="https://img.shields.io/badge/live-raidscout.com-ef4444?style=flat-square" alt="Website" /></a>
  <a href="https://vercel.com"><img src="https://img.shields.io/badge/deployed%20on-Vercel-black?style=flat-square&logo=vercel" alt="Vercel" /></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/backend-Supabase-3ECF8E?style=flat-square&logo=supabase" alt="Supabase" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" /></a>
  <a href="https://discord.gg/738AmkeQtU"><img src="https://img.shields.io/badge/discord-join%20server-5865F2?style=flat-square&logo=discord" alt="Discord" /></a>
</p>

---

## What is RaidScout?

RaidScout is a **real-time boss tracking and guild coordination platform** built for competitive
MMO communities. Whether you're managing a single guild or orchestrating a multi-guild alliance
across multiple game servers, RaidScout handles the logistics so you can focus on hunting.

**At its core, RaidScout answers three questions every guild leader faces:**

1. **When does the boss spawn?** — Live countdown timers with second-level precision.
2. **Whose turn is it?** — Automatic guild rotation tracking — per-kill, daily, or weighted.
3. **Who showed up?** — Per-kill attendance, AI-scanned rally screenshots, leaderboard rankings.

All of this works **without accounts** via Viewer Mode, and **integrates directly into Discord**
so your members never need to leave the app.

---

## ✨ Features

### ⏱️ Live Countdown Timers

Every boss gets a real-time **HH:MM:SS countdown** that ticks every second. The system supports
two spawn modes:

- **Fixed Hours** — Boss respawns exactly N hours after the last kill (e.g., Venatus = 8h).
- **Fixed Schedule** — Boss spawns at specific times on specific days (e.g., "Tue/Thu/Sat at 14:00").

Filter by spawn window (1h, 2h, 4h, 8h, 24h) to see only the bosses you care about right now.
Bosses marked **ALIVE** glow green — you know at a glance which ones are up.

### 🔄 Multi-Guild Rotation

The heart of the platform. Assign bosses to multiple guilds and RaidScout handles turn-taking
automatically:

- **Per-Kill Rotation** — Guilds alternate every kill. Supports weighted turns (Guild A gets 2 kills, Guild B gets 1).
- **Daily Rotation** — Guilds switch on a daily schedule. Each day of the week gets a different owner.
- **Fixed Schedule** — Specific guilds own specific spawn windows (e.g., PANORTH gets the 14:00 spawn, PARAK gets the 22:00 spawn).

The rotation counter advances automatically on each kill — no manual tracking needed.

### 📢 Discord Notifications

Every boss spawn and kill is posted to Discord automatically:

- **Two event types** — ⏰ 5-minute warning before spawn (amber) + 🟢 spawn now (green) + ☠️ kill alert (red)
- **Rate-limit handling** — Exponential backoff with `Retry-After` header respect, staggered sends to avoid bursting global limits.
- **Smart dedup** — Each boss sends exactly one 5-min warning and one spawn alert, even with multiple browser tabs
- **Rich embeds** — Boss name, guild badge, timestamps, and "Powered by RaidScout" branding
- **@everyone pings** — Configurable notification prefix per server

### 🤖 Discord Bot Commands

Manage bosses without opening the website. The bot listens via Discord's WebSocket Gateway
and responds to prefix commands:

| Command | Example | What it does |
|---------|---------|-------------|
| `!spawn` | `!spawn` | List all bosses spawning in the next 24 hours, with guild badges and precise countdowns (`in 3h 15m`) |
| `!spawn <boss>` | `!spawn Venatus` | Check spawn time for a specific boss |
| `!kill <boss>` | `!kill Venatus` | Record a kill right now |
| `!kill <boss> HH:MM` | `!kill Venatus 13:05` | Record a kill at a specific time (server timezone-aware) |
| `!editkilltime <boss> HH:MM` | `!editkilltime Titore 18:26` | Fix a kill time (AM/PM correction), optional date `YYYY-MM-DD` |
| `!forcespawn <boss>` | `!forcespawn Venatus` | Force a boss to spawn |
| `!forcespawnall` | `!forcespawnall` | Force-spawn all fixed-timer bosses |
| `!party <boss>` | `!party Venatus` | Show party members for a boss/activity |
| `!commands` | `!commands` | Display the help menu with custom alias hints |
| `!notifhere` | `!notifhere` | Set the current channel to receive boss spawn & kill notifications |
| `!cmdhere` | `!cmdhere` | Restrict commands to this channel |
| `!threadhere` | `!threadhere` | Set auto-thread channel for spawn events |

**Bot highlights:**

- **Multi-prefix support** — Each linked Discord server can use a different prefix (`!` `;` `$` `rs!` `boss!` etc.)
- **Custom command aliases** — Rename any command per server (e.g., `!s` → `!spawn`, `!k` → `!killed`)
- **✅ Reaction** — The bot reacts with ✅ on every recognized command for instant feedback
- **Smart dedup** — Spawn notifications fire exactly once per boss: one 5-min warning ⏰ + one spawn alert 🟢
- **Timezone-aware** — Schedule times are interpreted in each server's configured timezone, not UTC
- **Precise countdowns** — Spawn list shows `in 3h 15m` instead of vague "in 3 hours"
- **Green circle** — Alive bosses show 🟢 in the spawn list
- **@everyone support** — Set a notification prefix like `@everyone` to ping your members on spawns

The bot runs on Fly.io and stays online 24/7 via persistent WebSocket connection.

### 🎯 Activities System

Track repeatable guild activities alongside boss spawns:

- **Fixed Hours** — Recurring activities (e.g., every 2h). Start time stored as UTC, displayed in user's timezone.
- **Fixed Schedule** — Activities at specific weekday times.
- **One-Time** — Single events that auto-disable after completion.
- **Guild assignments** — Assign guilds with rotation, daily, or schedule modes.
- **Activity points** — Configurable points per participant, contributes to leaderboard rankings.
- **Explicit finish required** — Activities stay active until manually marked finished; no auto-advancing past unfinished instances.
- **Attendance tracking** — Mark who participated, view activity attendance history.
- **Soft-delete** — Three-state system: Active, Disabled, Soft-deleted (hidden).

### 👥 Member Combat Power & Classes

- **Combat Power** — Numeric field per member, inline-editable.
- **Class system** — Server owners define a class list (e.g., Warrior, Mage, Archer) and assign classes to members via dropdown.
- **Bulk add** — Paste a list of names to add dozens of members at once with guild assignment.

### ⏱️ Timezone-Aware Boss Management

All boss times are stored as UTC and converted to the viewer's local timezone:

- **Add/Edit Boss** — Start Date + Start Time fields for Fixed Hours bosses, saved as UTC.
- **Initial countdown** — First spawn uses `utc_start` from the schedule; subsequent spawns use death time + respawn hours.
- **Weekly Schedule** — All boss spawn times (template and custom) computed in UTC, displayed in user's timezone.

### 🔒 Soft-Delete System

Three-state lifecycle for bosses and activities:

| State | Enabled | Deleted At | Visible |
|-------|---------|-----------|---------|
| Active | ✅ | NULL | Main view + Settings |
| Disabled | ❌ | NULL | Settings (Disabled section) |
| Deleted | ❌ | timestamp | Hidden everywhere |

- Type-to-confirm deletion dialog prevents accidental removal.
- All CRUD operations use SECURITY DEFINER RPCs to bypass RLS silent failures.
- Search bars on all settings tabs (Bosses, Activities, Activity Points, Activity Guild Assignments).

### 🧠 AI Rally Scanning

Take a screenshot of the in-game rally window, upload it to RaidScout, and **AI extracts every
player name automatically**. No manual typing — even handles partially obscured or overlapping text.

- **Exact matches** — Names found verbatim in your member list.
- **Fuzzy matches** — Close-enough names for one-click confirmation.
- **Unmatched** — New players not yet in the system, ready to add.

Powered by OpenAI's vision models via a Supabase Edge Function. Optional — manual entry always works too.

### 🏆 Leaderboard & Points

Turn boss hunting into a competition:

- **Per-guild carousel** — Swipeable guild cards (2 per slide on desktop, 1 on mobile) with rankings, history, and export.
- **Configurable scoring** — Set points per boss (e.g., Venatus = 50pts, minor bosses = 10pts).
- **Point adjustments** — Manually add or deduct points for bonuses or penalties.
- **Weekly, monthly, all-time rankings** — Auto-calculated from kill data and attendance.
- **Activity points** — Activity attendance contributes to leaderboard scores alongside boss kills.
- **Activity attendance** — Activity participation counts toward "Most Active Hunters" in analytics.
- **Export** — Excel export includes activities alongside bosses with ranking integration.
- **Finalize & snapshot** — Lock results and save them as historical records.
- **Share** — Native Share API, Facebook, X/Twitter, or copy as formatted text.

### 👥 Attendance Tracking

Every kill records who participated:

- **Member management** — Add, edit, and organize members by guild.
- **Per-kill attendance** — Toggle who was present for each boss death.
- **Bulk add** — Paste a list of names to add dozens of members at once.
- **Attendance counts toward leaderboard scoring** — more kills attended = more points.

### ⚔️ Gear & Equipment Tracking

Track every member's gear across all equipment slots:

- **Gear tab** — Sortable table of all members with icons, class badges, CP, and per-slot gear cells.
- **Click-to-equip** — Click any gear slot cell to directly open the item picker and change equipment.
- **Enhancement levels** — Gold enhancement badges (+8, +15) on every equipped item.
- **Member profiles** — Per-member pages with CP trends, loot history, attendance stats, and equipped gear grid.
- **Gear score summary** — See completion percentage and total gear score per member at a glance.
- **Mobile-friendly** — Action buttons hidden on small screens; tap `⋯` for a dropdown menu.

### 📅 Weekly Schedule View

A 7-day calendar grid showing **every boss, every day, with guild ownership**:

- Red-tinged rows for kill bosses, blue for schedule bosses, orange for fixed-hours.
- Today's column highlighted with a gradient.
- Click any cell to record a kill for that boss on that day.
- Legend at the bottom showing all guilds with their colors.

### 📜 Death History

Complete, searchable kill log:

- Every death record with timestamp, boss name, and guild badge.
- **Search** by boss name, guild name, or date range.
- **Edit or delete** entries with full audit trail.
- **Attendance drill-down** — click any kill to see who participated.

### 👁️ Viewer Mode

Share a read-only link with your community:

- **No account required** — members see timers, schedule, and leaderboard without signing up.
- **Configurable permissions** — allow viewers to mark kills, edit spawn times, or keep them read-only.
- **Server-scoped** — each viewer link is tied to a specific RaidScout server.
- **Timezone-aware** — timers display in the viewer's local timezone.

### 📊 Analytics Dashboard

High-level stats for server admins:

- **Kills by week** — bar chart of hunting activity over time.
- **Hunter leaderboard** — who's attending the most kills and activities.
- **Guild breakdown** — kills, points, and activity participation per guild.
- **Server health** — total members, bosses, guilds, and kill count.

### 📱 PWA Support

Install RaidScout as a native-like app on any device:

- **Add to Home Screen** — works on iOS, Android, and desktop.
- **Offline support** — service worker caches critical assets.
- **Fast reloads** — Vite + code-splitting for instant page transitions.


### 📋 Changelog

All changes are documented in daily changelogs available at `/changelog` on the site
and in the `docs/` folder of the repository.

### 📋 Changelog

All changes are documented in daily changelogs available at `/changelog` on the site
and in the `docs/` folder of the repository.

---

## 🧰 Tech Stack

| Category | Technology | Why |
|----------|-----------|-----|
| **Frontend** | React 19 · TypeScript 5.7 · Vite 6 · Tailwind CSS 4 | Fast builds, strict typing, utility-first styling |
| **Backend** | Supabase — Postgres, Auth, Realtime, Edge Functions, Storage | Managed Postgres with built-in auth, real-time subscriptions, and serverless functions |
| **State** | TanStack React Query 5 · React Context | Automatic caching, background refetching, and optimistic updates |
| **Routing** | React Router 7 | Code-split, lazy-loaded pages for fast initial load |
| **Testing** | Vitest 4 · React Testing Library 16 | 180+ unit tests across 10+ test files — spawn logic, rotation math, bot queries, UI components |
| **Icons** | Lucide React | Lightweight, tree-shakeable icon library |
| **Dates** | date-fns 4 | Timezone-aware date formatting with minimal bundle size |
| **SEO** | react-helmet-async · JSON-LD structured data · sitemap.xml · OG/Twitter cards | Full social media preview support and search engine indexing |
| **Analytics** | Vercel Analytics | Privacy-first page view and visitor tracking |
| **Hosting** | Vercel (SPA) + Fly.io (Discord bot) | Free-tier hosting with automatic HTTPS and CI/CD |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Client (Browser)                      │
│  React SPA → React Query → Supabase JS Client            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐       │
│  │ Timers   │  │ Boss Grid│  │ Leaderboard      │       │
│  │ (1s tick)│  │ (filters)│  │ (rankings+share) │       │
│  └──────────┘  └──────────┘  └──────────────────┘       │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS (PostgREST + Realtime WS)
┌──────────────────────▼──────────────────────────────────┐
│                    Supabase                               │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐     │
│  │ Auth    │  │ Postgres │  │ Edge Functions      │     │
│  │ (email) │  │ (RLS)    │  │ ├─ discord-notify   │     │
│  │         │  │          │  │ └─ ai-vision        │     │
│  └─────────┘  └──────────┘  └────────────────────┘     │
│                      │                                    │
│              ┌───────▼────────┐                          │
│              │ Realtime (WS)  │                          │
│              │ death_records  │                          │
│              │ leaderboard    │                          │
│              └────────────────┘                          │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                 External Services                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐      │
│  │ Discord  │  │ OpenAI   │  │ Fly.io            │      │
│  │ Webhooks │  │ Vision   │  │ (bot hosting)     │      │
│  │ + Bot    │  │ API      │  │                   │      │
│  └──────────┘  └──────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

**Data flow:**

1. User records a kill → `death_records` insert via PostgREST.
2. Supabase Realtime broadcasts the change to all connected clients — timers update instantly.
3. Edge Function `discord-notify` fires → webhook posts to Discord with embed.
4. Rotation counter increments on the boss → next kill shows the correct guild.
5. AI Vision scans rally screenshots → OpenAI returns detected names → attendance recorded.

---

## 🚀 Quick Start

```bash
# Clone and install
git clone https://github.com/jersanmd/raidscout.git
cd raidscout
npm install

# Start dev server
npm run dev
```

Open **http://localhost:5173** — the landing page loads immediately, even without Supabase configured.

> ⚠️ Auth, data persistence, and multi-device sync require a Supabase project. See setup below.

---

## 🗄️ Supabase Setup

### 1. Create a Project

Go to [supabase.com](https://supabase.com) → New Project. Choose a region close to your players.
The free tier includes 500MB database, 2GB bandwidth, and 50,000 monthly active users.

### 2. Run Migrations

Apply migrations **in order** from the Supabase SQL Editor or CLI:

| # | File | What it creates |
|---|------|----------------|
| 1 | `supabase/migrations/001_initial_schema.sql` | Tables: `bosses`, `death_records`, `servers`, `guilds`, `boss_guilds`, `members`, `server_members`, `user_roles`, `admin_audit_log`, `discord_configs`, `app_settings`, `boss_spawn_overrides` |
| 2 | `supabase/migrations/002_attendance.sql` | `attendance_records` table + RLS policies |
| 3 | `supabase/migrations/003_leaderboard_snapshots.sql` | `leaderboard_snapshots` table + `point_adjustments` |
| 4 | `supabase/migrations/004_helper_functions.sql` | Helper functions: `update_updated_at`, audit triggers, `get_all_users` |
| 5+ | Remaining migrations | `get_public_stats`, `auto_kill_test_servers`, cron jobs, viewer RPCs |

### 3. Seed Boss Data

Run `supabase/seed.sql` to populate all bosses with their spawn types, respawn hours,
and schedule configurations.

### 4. Configure Auth

- **Authentication → Providers** → Enable **Email** (with "Confirm email" enabled for production).
- **Authentication → URL Configuration**:
  - **Site URL**: `https://www.raidscout.com` (or your production domain).
  - **Redirect URLs**: Add `http://localhost:5173/**`, `https://www.raidscout.com/**`, and any preview deploy URLs.

### 5. Enable Realtime

Go to **Database → Replication** and enable replication on:
- `death_records`
- `leaderboard_snapshots`

This allows all connected clients to receive live updates when a kill is recorded or results are finalized.

### 6. Environment Variables

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key-here
```

> Use the **publishable key** (starts with `sb_publishable_`), NOT the secret service role key.
> The publishable key is safe to include in client-side code and respects RLS policies.

---

## 🔔 Discord Integration

### Webhooks (per-guild notifications)

Deploy the Edge Function that sends kill notifications to Discord:

```bash
npx supabase functions deploy discord-notify
```

Then in the RaidScout UI: **Server Settings → Integrations → Discord Bot & Webhooks**.
Add one webhook URL per guild. Each webhook can be configured with:

- **@everyone ping** on/off
- **Custom webhook name and avatar**
- **Multiple Discord servers** per RaidScout server

When a boss is killed, the webhook fires automatically with a branded embed containing
the boss name, death time, owning guild, and "Powered by RaidScout" footer.

### Bot (prefix commands from Discord)

The bot uses Discord's **WebSocket Gateway** — no HTTP endpoints or slash command registration needed.
It stays online via a persistent connection and responds to `!` prefix commands.

```bash
# Required environment variables for the bot process
export DISCORD_BOT_TOKEN=your-bot-token
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# Run the bot (requires 24/7 hosting — Railway, Fly.io, or a VPS)
npx tsx scripts/discord-bot-gateway.ts
```

The bot is **timezone-aware** — it reads each server's configured timezone and converts
`!kill <boss> HH:MM` times correctly. It also handles smart date logic:

- If the specified time already passed today → assumes today.
- If the time hasn't happened yet → assumes yesterday.
- Use `yesterday` or `today` keywords to override.
- **`!editkilltime`** lets you fix an incorrectly recorded kill time without deleting the record.
- Optional date parameter (`YYYY-MM-DD`) for kills older than 24 hours.

---

## 🧠 AI Rally Scanning *(optional)*

```bash
# Set your OpenAI API key as a Supabase secret
npx supabase secrets set OPENAI_API_KEY=sk-...

# Deploy the vision Edge Function
npx supabase functions deploy ai-vision
```

Uses GPT-4o to analyze rally screenshots. The function accepts a base64-encoded image,
sends it to OpenAI with a prompt to extract all visible player names, and returns
exact matches, fuzzy matches, and unmatched names against your member list.

---

## 📦 Deployment

### Production Build

```bash
npm run build    # Outputs to dist/
npm run preview  # Test the production build locally
```

### Vercel (recommended)

```bash
npx vercel --prod
```

Set these environment variables in the Vercel dashboard:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase publishable (anon) key |

Vercel auto-deploys on every push to `master`. No additional configuration needed —
the `vercel.json` in the repo handles SPA routing and cache headers.

### Discord Bot Hosting (Fly.io)

The bot process runs on Fly.io for 24/7 uptime. Deploy with:

```bash
npm run build:bot
flyctl deploy -a raidscout-bot
```

Set these secrets on Fly.io:
- `DISCORD_BOT_TOKEN` — Your Discord bot token
- `SUPABASE_URL` — Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Your Supabase service role key

---

## 📁 Project Structure

<details>
<summary><strong>Click to expand full tree</strong></summary>

```
src/
├── components/                    # Reusable UI components
│   ├── BossCard.tsx               # Boss card: countdown, guild badge, rotation buttons, mark-died
│   ├── BossImage.tsx              # Boss portrait images (webp, size variants)
│   ├── ConfirmDialog.tsx          # Generic confirm/cancel modal
│   ├── CountdownTimer.tsx         # HH:MM:SS live countdown with urgent/critical callbacks
│   ├── CreateServerModal.tsx      # New server wizard with duplicate-name check
│   ├── DeathRecordModal.tsx       # Kill recorder: time picker, rally upload, AI scan, attendance
│   ├── DiscordWebhookBanner.tsx   # Banner prompting webhook setup (hidden for viewers)
│   ├── ErrorBoundary.tsx          # React error boundary with fallback UI
│   ├── FilterBar.tsx              # Search + spawn type + time window filters
│   ├── Layout.tsx                 # App shell: glass navbar, server selector, footer
│   ├── NoServerView.tsx           # Empty state: create or join a server
│   ├── NotificationToggle.tsx     # Browser notification permission toggle
│   ├── ParticipantModal.tsx       # View/edit attendance on existing kills
│   ├── ResetPasswordForm.tsx      # Password reset flow
│   ├── SavingOverlay.tsx          # Full-screen spinner during server creation
│   ├── SEOHead.tsx                # Per-page meta tags (title, description, OG, Twitter)
│   ├── UpcomingStrip.tsx          # Horizontal scroll of upcoming spawns with guild badges
│   └── ViewerRoute.tsx            # Route wrapper for viewer-mode access control
│
├── contexts/
│   ├── AuthContext.tsx            # Supabase auth: login, signup, logout, viewer mode, session
│   ├── ServerContext.tsx          # Current server selection, server list, role gating
│   └── ToastContext.tsx           # Toast notification queue with auto-dismiss
│
├── hooks/
│   ├── useAttendance.ts           # React Query: per-kill attendance records
│   ├── useAutoFinalize.ts         # Auto-finalize leaderboard snapshots on schedule
│   ├── useBosses.ts               # React Query: fetch bosses for current server
│   ├── useBossSpawns.ts           # Combines bosses + deaths → computed spawn info
│   ├── useDeathRecords.ts         # React Query + Realtime: death records with live updates
│   ├── useLeaderboardSnapshots.ts # React Query: finalized rankings and snapshots
│   ├── useMembers.ts              # React Query: member list with guild associations
│   ├── useServerTimezone.ts       # Detects and formats dates in server's timezone
│   ├── useSpawnAlerts.ts          # Browser notification triggers for spawn windows
│   └── useTimer.ts                # 1-second interval countdown + status detection
│
├── lib/
│   ├── constants.ts               # boss definitions, guild color palette, app config
│   ├── history.ts                 # URL hash-based navigation history
│   ├── notifications.ts           # Browser Notification API wrapper
│   ├── rotation.ts                # Pure functions: guild rotation math, safeMod, day-of-week logic
│   ├── rotation.test.ts           # 25 unit tests for rotation logic
│   ├── spawnCalculator.ts         # Fixed-hours & fixed-schedule spawn computation
│   ├── spawnCalculator.test.ts    # 22 unit tests for spawn calculations
│   ├── supabase.ts                # Supabase client, typed API wrappers, Realtime subscriptions
│   └── vision.ts                  # AI vision: encode image → call ai-vision function
│
├── pages/
│   ├── AdminPanelView.tsx         # Admin: servers, owners, audit log, database, cron, usage
│   ├── AnalyticsView.tsx          # Stats: kills by week, hunter rankings, guild breakdowns
│   ├── BossListView.tsx           # Main view: boss grid, filters, multi-select, kill actions
│   ├── HistoryView.tsx            # Kill log: search, date range, guild badges, edit/delete
│   ├── LandingPage.tsx            # Public landing: hero, stats, features, bot commands, auth
│   ├── LeaderboardView.tsx        # Rankings: weekly/monthly/all-time, finalize, share
│   ├── MembersView.tsx            # Member CRUD: add, edit, bulk import, guild assignment
│   ├── PrivacyPolicy.tsx          # Privacy policy page
│   ├── ServerSettingsView.tsx     # Settings: timezone, guilds, boss-guild assignments, webhooks
│   ├── TermsOfService.tsx         # Terms of service page
│   └── WeeklyScheduleView.tsx     # 7-day grid: boss × day with guild ownership and kill actions
│
├── types/index.ts                 # All TypeScript interfaces and types
├── App.tsx                        # Root component: providers, router, error boundary
├── index.css                      # Tailwind imports + custom animations + premium scrollbar
├── main.tsx                       # Entry point: mount React + Vercel Analytics
├── test-setup.ts                  # Vitest setup: happy-dom + MSW mocks
└── vite-env.d.ts                  # Vite type declarations

supabase/
├── migrations/                    # SQL migrations (001 through 020+)
│   ├── 001_initial_schema.sql     # Core tables: bosses, death_records, servers, guilds, etc.
│   ├── 002_attendance.sql         # attendance_records + RLS
│   ├── 003_leaderboard_snapshots.sql # leaderboard_snapshots + point_adjustments
│   ├── 004_helper_functions.sql   # update_updated_at, audit triggers, get_all_users
│   └── ...                        # Additional migrations for cron, public stats, viewer RPCs
├── seed.sql                       # boss definitions + guild/member sample data
└── functions/
    ├── ai-vision/                 # OpenAI GPT-4o rally screenshot scanner
    │   ├── index.ts               # Edge Function entry point
    │   └── deno.json              # Deno runtime config
    └── discord-notify/            # Discord webhook embed sender
        ├── index.ts               # Edge Function entry point
        └── deno.json              # Deno runtime config

scripts/
└── discord-bot-gateway.ts         # Standalone Discord bot (WebSocket Gateway)

public/
├── logo.png                       # App icon (used for PWA, favicon, OG)
├── og-image.png                   # Social share preview card (1200×630)
├── robots.txt                     # Search engine crawl rules
├── sitemap.xml                    # XML sitemap for SEO
├── google7cbb14f8d240a352.html    # Google Search Console verification
├── bosses/                        # Boss portrait images (desktop.ini for folder icon)
└── screenshots/                   # Landing page carousel images
```

</details>

---

## 🧪 Testing

```bash
npm test              # Run all 143 tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

| Test File | Tests | What it covers |
|-----------|-------|---------------|
| `spawnCalculator.test.ts` | 22 | Fixed-hours and fixed-schedule spawn logic, edge cases |
| `rotation.test.ts` | 25 | Guild rotation math: weighted, daily, fixed-schedule, safeMod |
| `constants.test.ts` | 17 | Boss definitions, guild colors, spawn types |
| `extra-coverage.test.ts` | 36 | Edge cases: null/undefined inputs, boundary values |
| `integration.test.ts` | 9 | Multi-file integration: spawn + rotation together |
| `useTimer.test.ts` | 6 | Countdown hook: tick, expiry, status transitions |
| `HistoryView.test.tsx` | 5 | History page rendering and interaction |
| `ConfirmDialog.test.tsx` | 11 | Modal open/close, confirm/cancel callbacks |
| `FilterBar.test.tsx` | 12 | Filter UI: search input, type toggle, window buttons |

---

## 📄 License

MIT © [RaidScout](https://www.raidscout.com)

---

<p align="center">
  <sub>Built with ❤️ for the competitive gamers.</sub>
</p>
