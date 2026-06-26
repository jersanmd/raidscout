# June 26, 2026 — Changelog (v0.15.8)

## 🔧 Admin Panel

- **Audit log — 9 missing filter actions added** — Activity time edits, activity end records, party member add/remove, rally image add/scan, and point rule create/update/delete now have their own filter checkboxes. `party_leaders_set` moved from "Death Records" to "Parties & Classes" group where it belongs. Rally and point rule actions added to the "Settings" group.

## 🤖 Discord Bot

- **Bot status trend chart now shows full 24 hours** — The tick-metrics endpoint was missing `"24h"` in its range map, causing the chart to fall back to just 1 hour of data. Now shows the full day as intended.
- **Trend chart X-axis shows dates** — When the 24-hour window spans two calendar days, the first and last axis labels now include the date (e.g., "Jun 25 20:00" and "Jun 26 20:00").
- **Trend chart tooltip shows combined date + time** — Hover tooltip now displays "Jun 26 14:30:45" instead of separate time and date lines, making it clearer which day each data point belongs to.

## 🐛 Bug Fixes

- **BotStatusIndicator TypeScript build errors** — The `BotStatus` interface was missing `spawn_cron`, `memory_mb`, `active_commands`, and `node_version` fields that the status API actually returns. Added all four, fixing 3 TS2339 errors.
- **Trend chart `TickMetric.ts` type** — Was typed as `string` but the API sends Unix millisecond timestamps as numbers. Fixed to `number`.
