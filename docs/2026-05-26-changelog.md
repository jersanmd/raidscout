# May 26, 2026 — Changelog (v1.13.16 → v1.13.19)

## Discord Bot Fixes
- **!kill timezone fix**: `!kill boss 12:00` now converts local time to UTC correctly
- **Smart !kill date logic**: If HH:MM already passed → today; if future → yesterday. Keywords `today`/`yesterday` override
- Updated `!commands` help text

## NoMembersBanner
- Blue banner when 0 members exist, reminds owners to add raid members
- Links to `/members?highlight=add-member`

## Input Highlight on Banner Clicks
- CSS animation `animate-highlight-input` (blue pulsing glow)
- DiscordWebhookBanner "Configure" → highlights Discord Server ID input
- NoMembersBanner "Add Members" → highlights member name input

## Admin Panel (v1.13.16)
- "Users" tab → "Server Owners"
- "Raid Members" → "Players", "Members" → "Mods"
- Webhook stat checks both legacy + discord_configs
- Removed "X Unknown" counter from Bosses tab

## Landing Page Rebrand (v1.13.17)
- **Hero**: "The Operating System for Competitive MMO Guilds"
- **Live boss timer**: cycles 5 bosses from Yvonne 6, shows countdown or ALIVE
- **Animated stat counters**: count up from 0 on scroll (IntersectionObserver)
- **Hover glow**: each feature card with colored glow shadow
- **Activity pulse**: 10 animated dots in hero background
- **Social proof**: 5 live stats from Supabase

## Admin Panel (v1.13.17)
- **Test Cron tab**: pg_cron status, last run, per-server kills with bars
- **Servers tab**: split into Regular + Test Servers sections
- **Compact tabs**: 6 tabs in single row, flex-1 fill

## Premium Polish (v1.13.18)
- Antialiased fonts, premium scrollbar
- Body: subtle red + blue radial background glow
- Boss cards: gradient backgrounds for Unknown/Alive/Countdown states
- Weekly Schedule: gradient backgrounds, today column highlight
- Glass navbar: `bg-slate-950/70 backdrop-blur-xl`

## v1.13.19
- Ranks: "Weekly Results" → "Previous Results" with numbering
- Landing: 8-row bot commands table
- Landing stats: `get_public_stats()` SECURITY DEFINER RPC
- Rally images: clickable fullscreen overlay
- Vercel Analytics: page views, visitors, performance tracking

## DB Migrations (010-019)
- `auto_kill_test_servers()`: cron job every 5 min
- `get_cron_test_status()`: RPC for admin panel
- 4-week simulation for test servers
