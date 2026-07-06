# July 6, 2026 — Changelog (v0.15.10)

## 🐛 Bug Fixes

- **Bot status chart — red gap backgrounds removed** — Gaps in tick_metrics data (from restarts, network blips, or failed DB writes) no longer render as red rectangles filling the chart. Gap backgrounds and boundary dashes are now neutral gray. Only the "bot stalled" dashed line at the chart edge remains red, and only when the bot hasn't ticked in > 3 minutes.

## ✨ UI

- **Member Profile — "This Week" filter** — The Activity section's time range button changed from "7d" to "This Week" for clarity.
