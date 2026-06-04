# May 31, 2026 — Changelog

## Discord Bot (24 commits)
- **Guild logic**: `computeOwnerGuild` — exact replica of `rotation.ts` (schedule→daily→rotation, timezone-aware)
- **Server-scoped boss_guilds**: filter by server guild IDs
- **Partial name matching**: `!kill dalia` matches "Lady Dalia"
- **`!killed` unified**: uses same `computeOwnerGuild` as nextspawn
- **Multi-Discord**: `broadcastNotification()` sends to ALL linked Discord servers
- **Role resolution**: `@Y6` → `<@&role_id>` in notification prefixes
- **@mention support**: tag bot to use commands without prefix
- **2-hour cooldown**: `!killed` blocked for same boss within 2h
- **Prefix cache**: 5-min TTL, no restart needed
- **Error handling**: `supabaseQuery` throws, `supabaseQuerySafe` for non-critical
- **Custom domain**: `bot.raidscout.com` for notify endpoint

## Fly.io Migration
- Combined backend: auth+data+notify+vision on 1 VM
- Bot on 1 VM
- Fly Postgres (`raidscout-db`) created
- Both apps deployed: `raidscout-backend.fly.dev`, `raidscout-bot.fly.dev`

## Railway Migration Branch
- Better Auth replacing custom JWT
- Data API (CRUD with Better Auth sessions)
- Realtime (WebSocket + Postgres NOTIFY)
- Feature flag: `VITE_USE_RAILWAY=true`
- 25 tables on Railway Postgres
- `data.ts`: full drop-in replacement for supabase.ts (40+ exports)

## Key Config
- `VITE_BOT_NOTIFY_URL` = `https://bot.raidscout.com`
