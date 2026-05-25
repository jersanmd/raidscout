<p align="center">
  <img src="public/logo.png" alt="RaidScout" width="80" height="80" />
</p>

<h1 align="center">RaidScout</h1>

<p align="center">
  <strong>Boss Spawn Timer &amp; Hunt Scheduler for Guilds</strong><br />
  Track 39+ bosses, rotate multi-guild kills, scan rallies with AI, and compete on leaderboards.
</p>

<p align="center">
  <a href="https://www.raidscout.com"><img src="https://img.shields.io/badge/live-raidscout.com-ef4444?style=flat-square" alt="Website" /></a>
  <a href="https://vercel.com"><img src="https://img.shields.io/badge/deployed%20on-Vercel-black?style=flat-square&logo=vercel" alt="Vercel" /></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/backend-Supabase-3ECF8E?style=flat-square&logo=supabase" alt="Supabase" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" /></a>
  <a href="https://discord.gg/738AmkeQtU"><img src="https://img.shields.io/badge/discord-join%20server-5865F2?style=flat-square&logo=discord" alt="Discord" /></a>
</p>

---

<br />

## ✨ Features

<table>
  <tr>
    <td width="50%">
      <h3>⏱️ Live Countdown Timers</h3>
      <p>Real-time HH:MM:SS countdowns for 39+ bosses. Filter by spawn window — 1h, 2h, 4h, 8h, or 24h.</p>
    </td>
    <td width="50%">
      <h3>🔄 Multi-Guild Rotation</h3>
      <p>Per-kill or daily rotation modes. Weighted turns — Guild A gets 2 kills, Guild B gets 1.</p>
    </td>
  </tr>
  <tr>
    <td>
      <h3>📢 Discord Webhook Alerts</h3>
      <p>Per-guild webhooks with <code>@everyone</code> pings, branded embeds, and 24h spawn forecasts. Multi-Discord support.</p>
    </td>
    <td>
      <h3>🤖 Discord Bot Commands</h3>
      <p><code>!spawn</code> <code>!kill</code> <code>!list</code> <code>!commands</code> — manage bosses right from Discord. No website needed.</p>
    </td>
  </tr>
  <tr>
    <td>
      <h3>🧠 AI Rally Scanning</h3>
      <p>Upload rally screenshots — AI detects player names with exact, fuzzy, and unmatched results.</p>
    </td>
  </tr>
  <tr>
    <td>
      <h3>🏆 Leaderboard &amp; Points</h3>
      <p>Configurable points per boss. Weekly, monthly, all-time rankings. Finalize, snapshot, and share.</p>
    </td>
    <td>
      <h3>👥 Attendance Tracking</h3>
      <p>Per-kill participant records with member management and guild assignments.</p>
    </td>
  </tr>
  <tr>
    <td>
      <h3>📅 Weekly Schedule</h3>
      <p>7-day grid showing which guild owns each boss every day. Click to manage kills.</p>
    </td>
    <td>
      <h3>📜 Death History</h3>
      <p>Complete kill log with guild badges, search, and edit/delete support.</p>
    </td>
  </tr>
  <tr>
    <td>
      <h3>👁️ Viewer Mode</h3>
      <p>Share a link so members can watch timers without an account. Configurable permissions.</p>
    </td>
    <td>
      <h3>📊 Analytics Dashboard</h3>
      <p>Hunter statistics, kill trends, and performance insights at a glance.</p>
    </td>
  </tr>
  <tr>
    <td>
      <h3>📱 PWA Support</h3>
      <p>Installable as a native-like app with offline support and service worker caching.</p>
    </td>
    <td>
      <h3>💸 Forever Free</h3>
      <p>No paywalls. No subscriptions. All features included. Everywhere.</p>
    </td>
  </tr>
</table>

<br />

## 🧰 Tech Stack

| Category | Technology |
|----------|-----------|
| **Frontend** | React 19 · TypeScript 5.7 · Vite 6 · Tailwind CSS 4 |
| **Backend** | Supabase (Postgres · Auth · Realtime · Edge Functions) |
| **State** | TanStack React Query 5 · React Context |
| **Routing** | React Router 7 (code-split, lazy-loaded) |
| **Testing** | Vitest 4 · React Testing Library 16 |
| **Icons** | Lucide React |
| **Dates** | date-fns 4 |
| **SEO** | react-helmet-async · JSON-LD · sitemap.xml · OG/Twitter cards |
| **Hosting** | Vercel (SPA with PWA service worker) |

<br />

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:5173**

> ⚠️ A Supabase project is required for auth, data persistence, and multi-device sync.

<br />

## 🗄️ Supabase Setup

1. Create a free project at [supabase.com](https://supabase.com)
2. Run migrations **in order**:
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

### 🔔 Discord Webhooks & Bot

**Webhooks** (per-guild notifications):
```bash
supabase functions deploy discord-notify
```

Add webhook URLs in **Server Settings → Integrations → Discord Bot & Webhooks**. Supports multiple Discord servers per RaidScout server.

**Bot** (prefix commands from Discord):
```bash
# Set secrets
supabase secrets set DISCORD_BOT_PUBLIC_KEY=your-public-key

# Deploy the HTTP endpoint (for future slash command support)
supabase functions deploy discord-bot --no-verify-jwt

# Run the Gateway bot (persistent WebSocket connection)
npx tsx scripts/discord-bot-gateway.ts
```

| Command | What it does |
|---------|-------------|
| `!spawn` | List boss spawns in 24h |
| `!spawn <boss>` | Check a specific boss |
| `!kill <boss>` | Record a kill now |
| `!kill <boss> HH:MM` | Kill at custom time |
| `!list` | Show all boss names |
| `!commands` | Show all commands |

The bot requires 24/7 hosting (Railway, Fly.io, or a VPS).

### 🧠 AI Rally Scanning *(optional)*

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase functions deploy ai-vision
```

<br />

## 📦 Deploy

Build the SPA, serve the `dist/` folder:

```bash
npm run build
```

**Vercel** (production):

```bash
npx vercel --prod
```

| Environment Variable | Description |
|---------------------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |

<br />

## 📁 Project Structure

<details>
<summary><strong>Click to expand</strong></summary>

```
src/
├── components/               # Reusable UI components
│   ├── BossCard.tsx          # Boss card with countdown + rotation
│   ├── DeathRecordModal.tsx  # Kill recorder + AI scan attendance
│   ├── ParticipantModal.tsx  # Player attendance per kill
│   ├── CountdownTimer.tsx    # Live HH:MM:SS display
│   ├── FilterBar.tsx         # Search + type/window filters
│   ├── Layout.tsx            # App shell with nav + server selector
│   └── SEOHead.tsx           # Per-page meta tags
├── contexts/
│   ├── AuthContext.tsx       # Supabase auth + viewer mode
│   ├── ServerContext.tsx     # Server selection + state
│   └── ToastContext.tsx      # Toast notifications
├── hooks/
│   ├── useBosses.ts          # Fetch bosses
│   ├── useBossSpawns.ts      # Bosses + deaths → spawn info
│   ├── useDeathRecords.ts    # Fetch + realtime death records
│   ├── useMembers.ts         # Member management
│   ├── useAttendance.ts      # Attendance + leaderboard
│   └── useTimer.ts           # 1-second interval countdown
├── lib/
│   ├── constants.ts          # 39 boss definitions + guild colors
│   ├── spawnCalculator.ts    # Fixed-hours & fixed-schedule logic
│   └── supabase.ts           # Supabase client + typed queries
├── pages/
│   ├── LandingPage.tsx       # Public landing + auth
│   ├── BossListView.tsx      # Main boss list with filters
│   ├── WeeklyScheduleView.tsx # 7-day guild rotation grid
│   ├── HistoryView.tsx       # Death history with guild badges
│   ├── LeaderboardView.tsx   # Rankings + finalize + share
│   ├── MembersView.tsx       # Member management
│   └── AnalyticsView.tsx     # Hunter stats dashboard
├── types/index.ts            # TypeScript interfaces
├── App.tsx                   # Providers + routing
├── index.css                 # Tailwind + animations
└── main.tsx                  # Entry point

supabase/
├── migrations/               # SQL schema migrations
├── seed.sql                  # 39 boss seed data
└── functions/
    ├── discord-notify/       # Discord webhook embeds
    └── ai-vision/            # OpenAI rally screenshot scanner

public/
├── logo.png
├── og-image.png              # Social share card (1200×630)
├── robots.txt
├── sitemap.xml
└── screenshots/              # Landing page carousel
```

</details>

<br />

## 📄 License

MIT © [RaidScout](https://www.raidscout.com)
