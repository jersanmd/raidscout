# July 6, 2026 — Changelog (v0.15.10)

## 🐛 Bug Fixes

- **Bot status chart — red gap backgrounds removed** — Gaps in tick_metrics data (from restarts, network blips, or failed DB writes) no longer render as red rectangles filling the chart. Gap backgrounds and boundary dashes are now neutral gray.
- **Bot status chart — red stalled line gated on online status** — The red "stalled" dashed line now only appears when the bot is actually offline AND data is stale (> 3 min). If the bot reports as online, the chart shows clean green segments regardless of data gaps.
- **Bot status chart — 6-hour cap** — Chart now shows a maximum of 6 hours of tick data, down from 24 hours. Long-running bots (54h+) won't have excessively compressed charts.

## ✨ UI

- **Member Profile — "This Week" filter** — The Activity section's time range button changed from "7d" to "This Week" for clarity.
