# June 5, 2026 — Changelog

## Bot Fix: Roderick Guild Discrepancy

- **Problem**: Bot `!nextspawn Roderick` showed PANORTH while website showed PARAK
- **Root Cause**: Two issues in `scripts/discord-bot-gateway.ts`:
  1. Missing `sort_order > 0` filter in rotation mode (bot included sort_order=0 entries that website excluded)
  2. `dist/bot.js` was cached by Docker — TypeScript changes weren't deployed
- **Fix**: Added `bg.sort_order > 0` to rotation filter + ran `npm run build:bot` before `fly deploy`
- **Lesson**: Always rebuild `dist/bot.js` before deploying to Fly.io

## Landing Page: Active Guilds Count

- **Problem**: Landing page showed "22+" active guilds instead of 53
- **Root Cause**: `get_public_stats()` RPC used `COUNT(DISTINCT server_id)` instead of `COUNT(*)`
- **Fix**: Changed to `COUNT(*) FROM public.guilds`
- **Migration**: `093_fix_public_stats_guild_count.sql`

## Cron Jobs: Test Server Auto-Kill

- Created `auto_kill_test_servers()` function — generates realistic boss kill data for servers with "test" in name
- Created `get_cron_test_status()` RPC — shows active/inactive, last run, per-server kill counts
- Scheduled via `pg_cron` every 30 minutes
- Cron status indicator changed to green (dot, text, border) when active

## Admin Panel: Search Bars

Added search bars to:
- **Servers tab**: Filters by server name
- **Users tab**: Filters by email or user ID, shows "Users (5 / 120)" count
- **Deleted tab**: Filters by server name
- **Games tab (Boss Templates)**: Filters boss templates by name

## Admin Panel: Restore Server Fix

- **Problem**: Clicking Restore did nothing
- **Root Cause**: `restoreServer` used direct UPDATE on `servers` — RLS blocked because admin ≠ server owner
- **Fix**: Created `restore_server(UUID)` SECURITY DEFINER RPC to bypass RLS
- **Bonus**: Added type-to-confirm dialog requiring admin to type the server name before restoring

## Admin Panel: Spawn Type Badges

- Boss templates now show colored badges instead of plain text:
  - **Purple** `schedule` for `fixed_schedule` bosses
  - **Blue** `hours` for `fixed_hours` bosses

## User Menu Dropdown Position

- Dropdown now calculates position from the username button using `getBoundingClientRect()`
- Sticks to the arrow regardless of screen size (desktop)
- Mobile centered layout preserved

## RLS / Policy Fixes

- Fixed duplicate `is_admin()` functions (DROP CASCADE + recreate)
- Recreated RLS policies on `games`, `boss_templates`, `activity_templates` tables
- Added `server_members` RLS policies for moderator server access

## Files Changed

| File | Change |
|------|--------|
| `scripts/discord-bot-gateway.ts` | Added `sort_order > 0` to rotation filter |
| `src/pages/LandingPage.tsx` | (indirect — RPC fix) |
| `src/pages/AdminPanelView.tsx` | Search bars, restore confirmation, cron green indicator |
| `src/components/AdminGamesTab.tsx` | Spawn type badges, boss search bar |
| `src/components/Layout.tsx` | User menu dropdown positioning |
| `src/lib/supabase.ts` | `restoreServer` now uses RPC |
| `supabase/migrations/093_fix_public_stats_guild_count.sql` | New migration |
| `supabase/migrations/094_cron_test_servers.sql` | Cron migration |
| `supabase/functions/` | `restore_server` RPC, cron functions |

## Git

- Branch: `master-multi-game-scaling`
- Commit: `012c2ac` — feat: admin panel search bars, restore confirmation, spawn type badges, cron green indicator, user menu position fix
