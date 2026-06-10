# June 7, 2026 — Changelog

## Discord Bot Refactor

- Split monolith into **13 modules**: commands, config, discord-api, guild-join, notifications, party-utils, server-cache, spawn-cron, spawn-utils, supabase, bot-queries (tests)
- **64 unit tests** for bot queries and spawn calculations
- **Party-list threads**: auto-threads show party members, guild ownership gate
- **Activity support**: bot now handles activity kills/instances
- **Spawn-time notifications**: bot alerts for upcoming spawns
- **Encoding fix**: Unicode characters in boss names now display correctly

