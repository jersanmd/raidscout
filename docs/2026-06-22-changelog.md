# June 22, 2026 — Changelog (v0.15.6)

## 🐛 Bug Fixes

- **AnalyticsView "Rendered more hooks" crash** — `guildKillTotals` useMemo and `guildSubItems` were declared after an early return (`if (isLoading || !data)`), causing hooks to run in different order across renders. Moved before the early return with optional chaining for the loading state.
- **Analytics `serverActivities` not in scope** — `serverActivities` and `serverActivityIds` were declared with `const` inside a `try` block but referenced in a second `try` block. Hoisted to `let` declarations before the first `try`.
- **Members -> Items Received bar overflow** — Bar height was unbounded (`(count/max) * 16`), causing bars to reach 128px+ when one time window vastly outnumbered another. Added `Math.min(24, ...)` hard cap and `overflow-hidden` on the card to prevent bars spilling past the "Items Received" label.
- **CP Trend last label off-screen** — The rightmost CP value label used `textAnchor="middle"`, causing half the text to overflow past the chart edge. Last data point now uses `textAnchor="end"` to keep text within bounds.

## 🎨 UI

- **Items Received card clicks to Loot History** — Clicking the Items Received stat card now smooth-scrolls to the Loot History section. Added `cursor-pointer` and hover background transition for affordance.

## 🤖 Discord Bot

- **`!updatestats` no longer auto-creates members** — Previously, if the member name didn't match, it would `POST` a new member row. Now returns: *"{name} does not exist. Make sure to enter the correct name or contact your guild officers."*
- **`!editstats` message updated** — Now shows the same "contact your guild officers" message instead of directing users to `!updatestats` to create a new entry.
