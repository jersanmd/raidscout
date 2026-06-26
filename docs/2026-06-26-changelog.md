# June 26, 2026 — Changelog (v0.15.9)

## 📊 Bot Status Trend Chart

- **Latest data point now renders at the chart's right edge** — The X-axis range was extending to `Date.now()` instead of the last data point's timestamp, leaving the latest tick stranded to the left. The range now ends at the data, and the last segment's line extends flat to the right edge.
- **Red "no data" indicator for pending ticks** — When no new tick has arrived yet, the extension from the last data point to "now" renders as a red dashed line with a red fill, clearly distinguishing it from known-green data.
- **X-axis labels show current time** — The rightmost label now displays the current time (in the user's timezone) instead of stopping at the last data point's time.
- **Tick metrics range adapts to bot uptime** — The popup fetches `range={uptime}h` capped at 24h, so freshly restarted bots fill the chart from boot rather than fetching a large stale window.
- **Popup no longer auto-refreshes** — The tick chart is fetched once on open. No interval, no distracting canvas redraws.

## 🤖 Discord Bot

- **Adaptive tick interval thresholds widened** — The bot now uses much more relaxed thresholds: `<15s → 30s, 15-45s → 60s, 45-75s → 90s, 75s+ → 120s` (was `<5s → 30s, 5-10s → 60s, 10-20s → 90s, 20s+ → 120s`). This reduces CPU churn under normal load and reserves fast ticks for truly light scans.

## 🔧 Admin Panel

- **Audit log — 9 missing filter actions added** — Activity time edits, activity end records, party member add/remove, rally image add/scan, and point rule create/update/delete now have their own filter checkboxes. `party_leaders_set` moved from "Death Records" to "Parties & Classes" group where it belongs. Rally and point rule actions added to the "Settings" group.

## 🤖 Discord Bot

- **Bot status trend chart now shows full 24 hours** — The tick-metrics endpoint was missing `"24h"` in its range map, causing the chart to fall back to just 1 hour of data. Now shows the full day as intended.
- **Trend chart X-axis shows dates** — When the 24-hour window spans two calendar days, the first and last axis labels now include the date (e.g., "Jun 25 20:00" and "Jun 26 20:00").
- **Trend chart tooltip shows combined date + time** — Hover tooltip now displays "Jun 26 14:30:45" instead of separate time and date lines, making it clearer which day each data point belongs to.

## 🐛 Bug Fixes

- **BotStatusIndicator TypeScript build errors** — The `BotStatus` interface was missing `spawn_cron`, `memory_mb`, `active_commands`, and `node_version` fields that the status API actually returns. Added all four, fixing 3 TS2339 errors.
- **Trend chart uses server timezone** — X-axis labels, date labels, and hover tooltip now all respect the server's configured timezone instead of the browser's local timezone.
