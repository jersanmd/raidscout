# June 5, 2026 — Changelog

## Bot Fix: Roderick Guild Discrepancy

- **Problem**: Bot `!nextspawn Roderick` showed PANORTH while website showed PARAK
- **Root Cause**: Two issues in `scripts/discord-bot-gateway.ts`:
  1. Missing `sort_order > 0` filter in rotation mode (bot included sort_order=0 entries that website excluded)
  2. `dist/bot.js` was cached by Docker — TypeScript changes weren't deployed
- **Fix**: Added `bg.sort_order > 0` to rotation filter + ran `npm run build:bot` before `fly deploy`
- **Lesson**: Always rebuild `dist/bot.cjs` before deploying to Fly.io (`npx esbuild scripts/discord-bot-gateway.ts --bundle --platform=node --target=node22 --outfile=dist/bot.cjs --external:ws --format=cjs`)

## Landing Page: Active Guilds Count

- **Problem**: Landing page showed "22+" active guilds instead of 53
- **Root Cause**: `get_public_stats()` RPC used `COUNT(DISTINCT server_id)` instead of `COUNT(*)`
- **Fix**: Changed to `COUNT(*) FROM public.guilds`
- **Migration**: `093_fix_public_stats_guild_count.sql`

## User Menu Dropdown Position

- Dropdown now calculates position from the username button using `getBoundingClientRect()`
- Sticks to the arrow regardless of screen size (desktop)
- Mobile centered layout preserved

## RLS / Policy Fixes

- Recreated RLS policies on `games`, `boss_templates`, `activity_templates` tables
- Added `server_members` RLS policies for moderator server access
