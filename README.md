<p align="center">
  <img src="public/logo.png" alt="RaidScout" width="80" height="80" />
</p>

<h1 align="center">RaidScout</h1>

<p align="center">
  <strong>The Operating System for Competitive MMO Guilds</strong><br />
  Track world bosses across multiple servers, coordinate multi-guild kill rotations,
  manage loot distribution with a full inventory system, track member gear &amp; CP progression,
  scan rally screenshots with AI, and compete on live leaderboards — all in real time.
</p>

<p align="center">
  <a href="https://www.raidscout.com"><img src="https://img.shields.io/badge/live-raidscout.com-ef4444?style=flat-square" alt="Website" /></a>
  <a href="https://vercel.com"><img src="https://img.shields.io/badge/deployed%20on-Vercel-black?style=flat-square&logo=vercel" alt="Vercel" /></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/backend-Supabase-3ECF8E?style=flat-square&logo=supabase" alt="Supabase" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" /></a>
  <a href="https://discord.gg/738AmkeQtU"><img src="https://img.shields.io/badge/discord-join%20server-5865F2?style=flat-square&logo=discord" alt="Discord" /></a>
  <a href="#pricing"><img src="https://img.shields.io/badge/price-%249.99%2F30%20days-22c55e?style=flat-square" alt="Pricing" /></a>
</p>

---

## 💰 Pricing

RaidScout is **$9.99 per server per 30 days** — one price, everything included.

| | |
|---|---|
| 💵 **$9.99 / 30 days** | That's just $0.33/day |
| 🎁 **7-day free trial** | No credit card required |
| 📦 **All features included** | No tiers, no limits, no hidden fees |
| 🔄 **Days stack** | Pay early, days add on top of your balance |
| 🛡️ **PayPal secure** | Processed by PayPal — we never see your card |

[View Pricing →](https://www.raidscout.com/#pricing) · [Refund Policy](https://www.raidscout.com/refund)

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
| `!spawn` | `!spawn` | List all bosses spawning in the next 24 hours, grouped by day (📅 Today / Tomorrow) with 12hr timestamps and relative times |
| `!spawn <boss>` | `!spawn Venatus` | Check spawn time for a specific boss |
| `!spawn <guild>` | `!spawn PARAK` | List spawns owned by a specific guild |
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

- **Multi-prefix support** — Each linked Discord server can use a different prefix (25 options: `!` `;` `$` `/` `//` `!!` `!?` `..` `rs!` `boss!` and more). Same Discord server can be linked multiple times with different prefixes.
- **Custom command aliases** — Rename any command per server (e.g., `!s` → `!spawn`, `!k` → `!killed`)
- **Day-grouped spawns** — `!nextspawn` groups bosses by day (Today, Tomorrow, etc.) using the server's configured timezone, with Discord native 12hr timestamps and live relative times.
- **Role ping with spaces** — Ping roles with spaces in their names (e.g., `@Y2 | MC丶AngBeat`). The bot matches progressively shorter word combinations against the guild's role list.
- **✅ Reaction** — The bot reacts with ✅ on every recognized command for instant feedback
- **Smart dedup** — Spawn notifications fire exactly once per boss: one 5-min warning ⏰ + one spawn alert 🟢
- **Timezone-aware** — Schedule times are interpreted in each server's configured timezone, not UTC
- **Precise countdowns** — Spawn list shows `in 3h 15m` instead of vague "in 3 hours"
- **Green circle** — Alive bosses show 🟢 in the spawn list
- **@everyone support** — Set a notification prefix like `@everyone` to ping your members on spawns

The bot runs on Fly.io and stays online 24/7 via persistent WebSocket connection.

### 💰 Billing & Access

New servers get a **7-day free trial** with full access. After that, extend for $9.99 per 30 days:

- **One-time payment** — No auto-renewing subscriptions. Pay once, get 30 days.
- **Days stack** — Extend anytime; remaining days carry forward.
- **PayPal checkout** — Pay with PayPal or debit/credit card. Secure, no card storage.
- **Payment history** — View all transactions with PayPal receipt links.
- **Expired gating** — Expired servers keep timers but lose kill recording, history, leaderboards, members, and inventory.
- **Viewer mode** — Viewers see trial/expired banners; expired viewers can't access gated pages.

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
- **Weekly Attendance** — Progress tab shows each member's weekly event attendance as a percentage with guild-scoped totals. Toggle between `75%` and `6/8` views. Color-coded thresholds.
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

### 🎒 Inventory & Loot Distribution

Complete item and loot tracking across your entire guild:

- **Catalog** — Browse all items with rarity-colored names, images, and search by name or category. Filter by rarity (Common → Mythic) or item type.
- **Distribute** — Record who received which items. Each distribution links to a member and item with quantity tracking.
- **Collections** — Group items into themed collections (e.g., "World Boss Drops"). View as premium cards, manage items with reorder, or use the ownership matrix to track who owns each item — with manual toggles, guild filters, sortable columns, player search, item sorting (click a column to sort owners first), and inline distribute button per player.
- **History** — Full audit log of every item distributed. Search, filter by rarity, edit or delete entries (with type-to-confirm safety). White player names with colored class icons.
- **Recipients** — Player-grouped view showing who got what, chronologically sorted. Guild filter with localStorage persistence. Click any player for a detailed loot history modal. Sort by name A-Z or most items.
- **Analytics** — Category rarity stacked bar chart with inline labels. Top recipients leaderboard with guild badges. Click any item to see every recipient with guild and class badges.
- **Search** — X clear buttons on all five search inputs across catalog, distribute, history, recipients, and analytics tabs.
- **Rarity system** — Six tiers (Common, Uncommon, Rare, Epic, Legendary, Mythic) with distinct colors used across item badges, borders, and text.
- **Class icons** — 20 class icons (Sword, Shield, Crossbow, etc.) with custom colors displayed next to player names across all tabs.
- **URL-synced tabs** — All 5 inventory tabs, plus History (Timeline/Ledger), Leaderboard (Reset/All Time), and Analytics (Week/Month/All Time) sync to the browser URL, persisting on refresh and share.
- **Sticky matrix** — Ownership matrix headers and player column stay fixed while scrolling, matching the Ledger pattern.
- **Date-based versioning** — Auto-generated build version shown in footer. Manual `WIPE_STORAGE_KEY` controls when user preferences reset; routine deploys keep all settings.
- **Sidebar** — Collapsed sidebar shows abbreviated section labels (Svrs, Ops, Mgmt, Asts, Ins) at matching font sizes. All items use fixed heights for consistent alignment across collapsed, hover overlay, and expanded states. Auto-collapse on settings pages without persisting.

### 👤 Member Profiles

Deep-dive pages for every member in your guild:

- **Combat Power trends** — 7-day and 30-day CP charts showing progression over time.
- **Loot history** — Every item they've received with rarity-colored borders and backgrounds on item icons.
- **Attendance** — Kill and activity participation history with timestamps.
- **Activity Timeline** — Chronological feed of kills attended, activities joined, and gear changes.
- **Equipment grid** — All equipped gear displayed in a single-row flex layout matching the gear tracking tab sort order. Enhancement level badges (+8, +15) on each item.
- **Public profiles** — Shareable links via unique member slugs for viewer-mode access.

### 📋 Changelog

Daily changelogs track every feature, fix, and improvement. Available at `/changelog` on the site and in the `docs/` folder. Each entry is organized into categories (New Features, UI, Fixes, Bot, Security, Architecture) and automatically loaded from Markdown files. Expand/collapse individual entries or use "Expand all" / "Collapse all" to browse.

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

---

## 🧰 Tech Stack

| Category | Technology | Why |
|----------|-----------|-----|
| **Frontend** | React 19 · TypeScript 5.7 · Vite 6 · Tailwind CSS 4 | Fast builds, strict typing, utility-first styling |
| **Backend** | Supabase — Postgres, Auth, Realtime, Edge Functions, Storage | Managed Postgres with built-in auth, real-time subscriptions, and serverless functions |
| **State** | TanStack React Query 5 · React Context | Automatic caching, background refetching, and optimistic updates |
| **Routing** | React Router 7 | Code-split, lazy-loaded pages for fast initial load |
| **Testing** | Vitest 4 · React Testing Library 16 | 220+ unit tests across 14+ test files — spawn logic, rotation math, bot queries, data integrity, UI components |
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

The bot process runs on Fly.io (Tokyo region) for 24/7 uptime. Deploy with:

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
│   ├── ActivityCard.tsx           # Activity card with timer, guild badge, finish button
│   ├── AddActivityForm.tsx        # Activity creation form with spawn modes
│   ├── AddActivityModal.tsx       # Modal wrapper for adding activities
│   ├── AddBossForm.tsx            # Boss creation form with spawn configuration
│   ├── AddBossModal.tsx           # Modal wrapper for adding bosses
│   ├── AdminGamesTab.tsx          # Admin: game/slug management
│   ├── ApprovedItemsTab.tsx       # Settings: approve/reject catalog item submissions
│   ├── BossCard.tsx               # Boss card: countdown, guild badge, rotation buttons, mark-died
│   ├── BossGuildsTab.tsx          # Settings: assign guilds to bosses with rotation modes
│   ├── BossImage.tsx              # Boss portrait images (webp, size variants)
│   ├── ConfirmDialog.tsx          # Generic confirm/cancel modal with type-to-confirm
│   ├── CountdownTimer.tsx         # HH:MM:SS live countdown with urgent/critical callbacks
│   ├── CreateServerModal.tsx      # New server wizard with duplicate-name check
│   ├── DeathRecordModal.tsx       # Kill recorder: time picker, rally upload, AI scan, attendance
│   ├── DiscordWebhookBanner.tsx   # Banner prompting webhook setup (hidden for viewers)
│   ├── EditActivityForm.tsx       # Activity edit form
│   ├── EditBossForm.tsx           # Boss edit form
│   ├── ErrorBoundary.tsx          # React error boundary with fallback UI
│   ├── ErrorRetry.tsx             # Retry button for failed data fetches
│   ├── FilterBar.tsx              # Search + spawn type + time window filters
│   ├── GearPlanner.tsx            # Gear planning and optimization tool
│   ├── GearTrackingTab.tsx        # Settings: per-member gear slot management table
│   ├── ItemReviewTab.tsx          # Settings: review and manage catalog items
│   ├── Layout.tsx                 # App shell: glass navbar, server selector, footer
│   ├── NoMembersBanner.tsx        # Prompt to add members when list is empty
│   ├── NoServerView.tsx           # Empty state: create or join a server
│   ├── NotificationToggle.tsx     # Browser notification permission toggle
│   ├── ParticipantModal.tsx       # View/edit attendance on existing kills
│   ├── PublicMemberProfile.tsx    # Public-facing member profile page
│   ├── RallyImageOverlay.tsx      # AI-scanned rally screenshot with detected names
│   ├── ResetPasswordForm.tsx      # Password reset flow
│   ├── SavingOverlay.tsx          # Full-screen spinner during server creation
│   ├── SEOHead.tsx                # Per-page meta tags (title, description, OG, Twitter)
│   ├── Skeletons.tsx              # Loading skeleton placeholders
│   ├── UpcomingActivitiesStrip.tsx # Horizontal scroll of upcoming activity spawns
│   ├── UpcomingStrip.tsx          # Horizontal scroll of upcoming boss spawns with guild badges
│   └── ViewerRoute.tsx            # Route wrapper for viewer-mode access control
│
├── contexts/
│   ├── AuthContext.tsx            # Supabase auth: login, signup, logout, viewer mode, session
│   ├── ServerContext.tsx          # Current server selection, server list, role gating
│   └── ToastContext.tsx           # Toast notification queue with auto-dismiss
│
├── hooks/
│   ├── useActivities.ts           # React Query: activity CRUD and spawn tracking
│   ├── useAdminViewAs.ts          # Admin: impersonate server view
│   ├── useAttendance.ts           # React Query: per-kill attendance records
│   ├── useBosses.ts               # React Query: fetch bosses for current server
│   ├── useBossSpawns.ts           # Combines bosses + deaths → computed spawn info
│   ├── useDeathRecords.ts         # React Query + Realtime: death records with live updates
│   ├── useEscapeKey.ts            # Keyboard shortcut hook (Esc to close modals)
│   ├── useLeaderboardSnapshots.ts # React Query: finalized rankings and snapshots
│   ├── useMaintenance.ts          # Maintenance mode detection
│   ├── useMembers.ts              # React Query: member list with guild associations
│   ├── useRecordDeath.ts          # Consolidated kill recording with attendance
│   ├── useServerTimezone.ts       # Detects and formats dates in server's timezone
│   ├── useSpawnAlerts.ts          # Browser notification triggers for spawn windows
│   ├── useTimer.ts                # 1-second interval countdown + status detection
│   └── useUserTimezone.ts         # User's local timezone detection
│
├── lib/
│   ├── activityCalculator.ts      # Activity spawn computation and schedule logic
│   ├── constants.ts               # Boss definitions, guild color palette, app config
│   ├── history.ts                 # URL hash-based navigation history
│   ├── notifications.ts           # Browser Notification API wrapper
│   ├── rotation.ts                # Pure functions: guild rotation math, safeMod, day-of-week logic
│   ├── rotation.test.ts           # 25 unit tests for rotation logic
│   ├── scheduleTimezone.ts        # Server timezone ↔ UTC conversion utilities
│   ├── spawnCalculator.ts         # Fixed-hours & fixed-schedule spawn computation
│   ├── spawnCalculator.test.ts    # 22 unit tests for spawn calculations
│   ├── supabase.ts                # Supabase client, typed API wrappers, Realtime subscriptions
│   ├── timezones.ts               # Timezone database and lookup functions
│   └── vision.ts                  # AI vision: encode image → call ai-vision function
│
├── pages/
│   ├── AdminPanelView.tsx         # Admin: servers, owners, audit log, database, cron, usage
│   ├── AnalyticsView.tsx          # Stats: kills by week, hunter rankings, guild breakdowns
│   ├── BossListView.tsx           # Main view: boss grid, filters, multi-select, kill actions
│   ├── ChangelogView.tsx          # Daily changelog browser with expand/collapse
│   ├── HistoryView.tsx            # Kill log: search, date range, guild badges, edit/delete
│   ├── InventoryView.tsx          # Loot catalog, distribute, history, recipients, analytics
│   ├── LandingPage.tsx            # Public landing: hero, stats, features, bot commands, auth
│   ├── LeaderboardView.tsx        # Rankings: weekly/monthly/all-time, finalize, share
│   ├── MaintenancePage.tsx        # Maintenance mode splash screen
│   ├── MemberProfileView.tsx      # Per-member: CP trends, loot, attendance, gear grid
│   ├── MembersView.tsx            # Member CRUD: add, edit, bulk import, guild assignment
│   ├── NotFoundPage.tsx           # 404 page with navigation back to app
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
├── migrations/                    # SQL migrations (000 through 030)
│   ├── 000_initial_schema.sql    # Core tables: bosses, death_records, servers, guilds, etc.
│   ├── 006_auto_assign_guild.sql  # Auto-assign guild on member creation
│   ├── 007_discord_configs_rls.sql # Discord config RLS policies
│   ├── 008_member_management.sql  # Member CRUD RPCs and policies
│   ├── 009_member_stats_rpc.sql   # Member statistics aggregation
│   ├── 010_member_classes.sql     # Class system for members
│   ├── 011_server_classes_viewer.sql # Viewer access for server classes
│   ├── 012_cp_updates_rls_fix.sql # Combat Power update permissions
│   ├── 013_progress_channel.sql   # Progress tracking channel
│   ├── 014_member_public_slug.sql # Public profile URL slugs
│   ├── 015_viewer_read_cp_notes.sql # Viewer CP and notes access
│   ├── 016_server_classes_policies.sql # Server class management policies
│   ├── 017_member_scores_rpc.sql  # Member scoring for leaderboards
│   ├── 018_gear_tracking.sql      # Gear and equipment tracking tables
│   ├── 019_crowdsourced_catalog.sql # Community item catalog
│   ├── 020_item_catalog_structure.sql # Item catalog schema
│   ├── 021_set_game_slug_on_server_create.sql # Auto game slug assignment
│   ├── 022_gear_slots.sql         # Equipment slot definitions
│   ├── 023_gear_slot_categories.sql # Slot category groupings
│   ├── 024_member_gear_fk_fix.sql # Foreign key fixes for member gear
│   ├── 025_member_is_active.sql   # Active/inactive member flag
│   ├── 026_member_cp_updated_at.sql # CP change timestamps
│   ├── 027_viewer_gear_access.sql # Viewer RLS for gear data
│   ├── 028_death_records_insert_fix.sql # Death record insert policy fix
│   ├── 029_item_approval.sql      # Item approval workflow
│   └── 030_viewer_loot_access.sql # Viewer RLS for distributions and items
├── seed.sql                       # Boss definitions + guild/member sample data
└── functions/
    ├── ai-vision/                 # OpenAI GPT-4o rally screenshot scanner
    │   ├── index.ts               # Edge Function entry point
    │   └── deno.json              # Deno runtime config
    └── discord-notify/            # Discord webhook embed sender
        ├── index.ts               # Edge Function entry point
        └── deno.json              # Deno runtime config

scripts/
├── bot/                           # Discord bot source
│   └── commands.ts               # Bot command handlers (!spawn, !kill, etc.)
└── discord-bot-gateway.ts        # Standalone Discord bot (WebSocket Gateway)

docs/
└── *-changelog.md                 # Daily changelogs (2026-05-23 through 2026-06-15)

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
npm test              # Run all 223 tests
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
| `bot-queries.test.ts` | 14 | Discord bot SQL query correctness |
| `integrity.test.ts` | 63 | Data integrity and schema validation |
| `useTimer.test.ts` | 6 | Countdown hook: tick, expiry, status transitions |
| `useRecordDeath.test.ts` | 13 | Kill recording flow with attendance |
| `useEscapeKey.test.ts` | 4 | Keyboard shortcut behavior |
| `HistoryView.test.tsx` | 5 | History page rendering and interaction |
| `ConfirmDialog.test.tsx` | 11 | Modal open/close, confirm/cancel callbacks |
| `FilterBar.test.tsx` | 12 | Filter UI: search input, type toggle, window buttons |
| `AddBossModal.test.tsx` | 4 | Boss creation modal validation |

---

## 📄 License

MIT © [RaidScout](https://www.raidscout.com)

---

<p align="center">
  <sub>Built with ❤️ for the competitive gamers.</sub>
</p>
