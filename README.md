# LordNine Boss Timer

Track boss spawn timers for LordNine — plan your boss hunt schedules with live countdowns, weekly calendar views, and spawn-window filters.

## Features

- **39 Bosses** — 22 fixed-hour respawn bosses + 17 fixed-schedule bosses
- **Live Countdowns** — Real-time HH:MM:SS timers ticking down to each spawn
- **One-Click Death Record** — "Mark as Died" instantly starts the respawn timer
- **Weekly Schedule View** — 7-day calendar showing all upcoming spawns
- **Filter by Spawn Window** — Show only bosses spawning in 1h, 2h, 4h, 8h, or 24h
- **Browser Notifications** — Get alerted 5 minutes before a boss spawns
- **Offline Mode** — Works fully in-browser with localStorage (no Supabase needed)
- **Supabase Sync** — Optional: multi-device sync & data backup via Supabase

## Quick Start (Offline Mode)

The app works immediately without any setup — all boss data is built-in and death records are saved to localStorage.

```bash
npm install
npm run dev
```

Open http://localhost:5173 — you're ready to go!

## Supabase Setup (Optional — for multi-device sync)

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run:
   - `supabase/migrations/001_initial_schema.sql` (creates tables + RLS)
   - `supabase/seed.sql` (seeds all 39 bosses)
3. Go to **Project Settings → API** and copy:
   - Project URL
   - `publishable` key
4. Enable **Email/Password** auth in **Authentication → Providers**
5. Set your env vars in `.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key-here
```

6. Go to **Database → Replication** and enable Realtime on the `death_records` table (for live sync across devices)

7. Restart the dev server — the auth screen will appear.

## Tech Stack

- **React 19** + TypeScript
- **Vite 6** (build tool)
- **Tailwind CSS 4** (styling via Vite plugin)
- **Supabase** (optional backend: auth, database, realtime)
- **React Query** (data fetching + caching)
- **React Router 7** (client-side routing)
- **date-fns** (date utilities)
- **Lucide React** (icons)
- **PWA** (installable as a native-like app)

## Project Structure

```
src/
├── components/          # UI components
│   ├── AuthForm.tsx     # Login / signup form
│   ├── BossCard.tsx     # Individual boss card with countdown
│   ├── CountdownTimer.tsx  # Live HH:MM:SS display
│   ├── DeathRecordModal.tsx  # Record boss death time
│   ├── FilterBar.tsx    # Search + filter controls
│   ├── Layout.tsx       # App shell with navigation
│   └── NotificationToggle.tsx  # Per-boss notification toggle
├── contexts/
│   └── AuthContext.tsx   # Supabase auth state management
├── hooks/
│   ├── useBosses.ts     # Fetch boss data
│   ├── useBossSpawns.ts # Combine bosses + death records → spawn info
│   ├── useDeathRecords.ts  # Fetch + realtime death records
│   └── useTimer.ts      # 1-second interval countdown hook
├── lib/
│   ├── constants.ts     # Boss data + shared constants
│   ├── notifications.ts # Browser notification API wrapper
│   ├── spawnCalculator.ts  # Core spawn time calculation logic
│   └── supabase.ts      # Supabase client + typed queries
├── pages/
│   ├── BossListView.tsx     # Main boss list page
│   └── WeeklyScheduleView.tsx  # Weekly calendar page
├── types/
│   └── index.ts         # TypeScript interfaces
├── App.tsx              # Root app with routing + auth gate
├── index.css            # Tailwind + custom styles
└── main.tsx             # Entry point
supabase/
├── migrations/
│   └── 001_initial_schema.sql  # Tables + RLS policies
└── seed.sql             # All 39 boss seed data
```

## Boss Spawn Mechanics

| Type | Behavior | Count |
|------|----------|-------|
| **Fixed Hours** | Respawns N hours after death. Record a death to start the timer. | 22 |
| **Fixed Schedule** | Always spawns on specific weekdays at specific times. No death record needed — next spawn is auto-calculated. | 17 |

## License

MIT
