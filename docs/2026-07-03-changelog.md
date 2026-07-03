# July 3, 2026 — Changelog (v0.15.9)

## 🐛 Bug Fixes

- **Bot status chart — false red line on long uptime** — The tick trend chart in the bot status popup always showed a red dashed "stalled" line at the right edge because `dataEnd` was set to `Date.now()`, leaving a gap between the last tick and the chart edge even when the bot ticked seconds ago. Now the red extension only appears when the bot has been silent for more than 3 minutes (`GAP_THRESHOLD`). Bots running 30+ hours show a clean green line as expected.
