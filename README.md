# RaidScout

[![Deployed on Vercel](https://img.shields.io/badge/deployed%20on-Vercel-black?logo=vercel)](https://www.raidscout.com)
[![Supabase](https://img.shields.io/badge/backend-Supabase-3ECF8E?logo=supabase)](https://supabase.com)

Track 39+ boss spawn timers, manage multi-guild rotations, scan rallies with AI, and compete on leaderboards. Built for guilds running coordinated boss hunts.

**[www.raidscout.com](https://www.raidscout.com)**

## Features

- **Live Countdown Timers** — Real-time HH:MM:SS countdowns for 39+ bosses with spawn-window filters (1h, 2h, 4h, 8h, 24h)
- **Multi-Guild Rotation** — Per-kill or daily rotation modes. Weighted turns — Guild A gets 2 kills, Guild B gets 1.
- **Discord Webhook Alerts** — Auto-post boss deaths, spawns, and 24h forecasts to your Discord server with `@everyone` pings and "Powered by RaidScout" branding
- **AI Rally Scanning** — Upload rally screenshots and AI auto-detects player names. Supports exact, fuzzy, and unmatched results with inline editing.
- **Leaderboard & Points** — Configurable points per boss. Weekly, monthly, and all-time rankings. Finalize and snapshot results. Share rankings to Discord, Facebook, and X/Twitter.
- **Attendance Tracking** — Per-kill participant records with member management and guild assignments.
- **Weekly Schedule View** — 7-day grid showing which guild owns each boss every day. Click to manage kills.
- **Death History** — Complete kill log with guild badges, search, and edit/delete support.
- **Viewer Mode** — Share a link so members can watch timers without an account. Configurable permissions (read-only or allow marking deaths).
- **Analytics Dashboard** — Hunter statistics, kill trends, and performance insights.
- **PWA Support** — Installable as a native-like app with offline support.
- **Forever Free** — No paywalls. All features included.

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | React 19, TypeScript 5.7, Vite 6, Tailwind CSS 4 |
| **Data** | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| **State** | TanStack React Query 5, React Context |
| **Routing** | React Router 7 (code-split, lazy-loaded routes) |
| **Testing** | Vitest 4, React Testing Library 16 |
| **Icons** | Lucide React |
| **Dates** | date-fns 4 |
| **SEO** | react-helmet-async, JSON-LD, sitemap.xml, OG/Twitter cards |
| **Hosting** | Vercel (SPA with PWA service worker) |

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

> A Supabase project is required for auth, data persistence, and multi-device sync.

## Supabase Setup

1. Create a free project at [supabase.com](https://supabase.com)
2. Run migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_attendance.sql`
   - `supabase/migrations/003_leaderboard_snapshots.sql`
   - `supabase/migrations/004_helper_functions.sql`
3. Run `supabase/seed.sql` to seed all 39 bosses
4. Enable **Email/Password** auth in **Authentication → Providers**
5. Enable **Realtime** on `death_records` and `leaderboard_snapshots`
6. Create `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key-here
```

### Discord Webhooks

The `discord-notify` edge function sends rich embeds to Discord. Deploy it:

```bash
supabase functions deploy discord-notify
```

Configure your webhook URL in **Server Settings** within the app.

### AI Rally Scanning (optional)

The "Scan Image" feature uses OpenAI vision. Store the key as a Supabase secret:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase functions deploy ai-vision
```

## Deploy

This is a Vite SPA — deploy anywhere that serves static files:

```bash
npm run build  # outputs to dist/
```

For Vercel (used in production):

```bash
npx vercel --prod
```

Environment variables required:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── BossCard.tsx     # Boss card with countdown, rotation, actions
│   ├── DeathRecordModal.tsx  # Record boss kills + AI scan attendance
│   ├── ParticipantModal.tsx  # Mark player attendance per kill
│   ├── CountdownTimer.tsx    # Live HH:MM:SS display
│   ├── FilterBar.tsx    # Text search + type/window filters
│   ├── Layout.tsx       # App shell with nav, server selector
│   ├── SEOHead.tsx      # Per-page meta tags (Helmet wrapper)
│   └── ...
├── contexts/
│   ├── AuthContext.tsx   # Supabase auth + viewer mode
│   ├── ServerContext.tsx # Server selection + state
│   └── ToastContext.tsx  # Toast notifications
├── hooks/
│   ├── useBosses.ts     # Fetch bosses for server
│   ├── useBossSpawns.ts # Combine bosses + deaths → spawn info
│   ├── useDeathRecords.ts  # Fetch + realtime death records
│   ├── useMembers.ts    # Member management
│   ├── useAttendance.ts # Attendance + leaderboard queries
│   ├── useTimer.ts      # 1-second interval countdown
│   └── ...
├── lib/
│   ├── constants.ts     # 39 boss definitions + guild colors
│   ├── spawnCalculator.ts  # Fixed-hours & fixed-schedule logic
│   ├── supabase.ts      # Supabase client + all typed queries/RPCs
│   └── ...
├── pages/
│   ├── LandingPage.tsx       # Public landing with auth + screenshots
│   ├── BossListView.tsx      # Main boss list with filters
│   ├── WeeklyScheduleView.tsx   # 7-day guild rotation grid
│   ├── HistoryView.tsx       # Death history with guild badges
│   ├── LeaderboardView.tsx   # Rankings + finalize + share
│   ├── MembersView.tsx       # Member management
│   ├── AnalyticsView.tsx     # Hunter stats dashboard
│   └── ...
├── types/
│   └── index.ts         # All TypeScript interfaces
├── App.tsx              # Root app: providers + routing
├── index.css            # Tailwind + custom animations
└── main.tsx             # Entry point
supabase/
├── migrations/          # SQL schema migrations
├── seed.sql             # Boss seed data
└── functions/           # Edge Functions
    ├── discord-notify/  # Discord webhook embeds
    └── ai-vision/       # OpenAI rally screenshot scanning
public/
├── logo.png
├── og-image.png         # Social share card (1200×630)
├── robots.txt
├── sitemap.xml
└── screenshots/         # Landing page carousel images
```

## License

MIT
