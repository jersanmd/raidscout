# June 19, 2026 — Changelog

## 🚀 Performance

- **Smooth startup** — Single dark loading screen covers everything until all data is ready. No more flashing banners, empty states, or partial screens during app load or refresh.
- **Seamless server switching** — Switching between servers now shows a clean loading overlay until data settles. No more flash of old guild badges or empty boss cards.
- **Stale build recovery** — If a new version is deployed while you have the app open, navigating to another tab now auto-refreshes instead of showing an error.

## 🤖 Discord Bot — Activities

- **Activity guild mentions** — Activity notifications now tag the assigned guilds: `📋 Siege War starting in 5 min — Titans · Phoenix — 8:00 PM`
- **Both warnings now fire** — The 5-minute heads-up AND the "starting now!" notification both send correctly (previously only one would fire).
- **Auto-threads for every guild** — Activities with multiple guilds now create a Discord thread for each guild, complete with party lists.
- **`!nextspawn` by name** — When you search for a specific boss or activity, it now shows the spawn time even if it's days away. No more "No spawn data in 24h."

## 📦 Inventory — Collection Ownership Matrix

- **Combat Power column** — Each player now shows their CP next to their guild badge. Sort by CP (high → low or low → high) by clicking the header.
- **Multi-guild activity badges** — Activities owned by multiple guilds now show all guild badges instead of just one.

## 🎨 UI

- **Create Server modal** — Darker background with improved contrast between the modal and game option buttons.
- **Server sidebar** — Selected server no longer shows the role badge ("Owner"/"Mod"). Guild subscription badges now appear on every server. Servers are sorted alphabetically.
- **Top bar** — Cleaner desktop header without redundant server info.

## 📊 Analytics

- **Kills per Day trend chart** — Replaced "Kills per Week" bar chart with an animated SVG trend chart showing daily kill counts. Lines draw in on load, area fills fade in, dots appear staggered. Supports all periods (Week/Month/All Time).
- **Per-guild trend lines** — Kill counts split by guild with separate colored lines, area fills, and value labels. Guild colors match badge colors. Legend above chart.
- **Hover tooltip with boss details** — Hovering any data point shows date, per-guild kill counts, and a sorted list of bosses with kill counts (`Ego ×2`) and guild badges. Sorted by most recent death.
- **Per-guild bar charts** — "Most Killed Bosses" and "Activity by Day" now use stacked bars with guild badge dark colors, showing each guild's portion with count labels.
- **Average attendance per boss** — "Most Killed Bosses" now shows `👤 ~N` (average attendees per kill) next to each boss name.
- **Consistent bar sizing** — Guild badge and attendance wrappers use fixed widths so bars don't shift between rows with different content.
- **CP Growth fix** — New `get_member_growth` RPC returns 7d / 30d / all-time growth. "This Week" uses 7-day growth, "This Month" uses 30-day, "All Time" uses cumulative.
- **CP bar colors** — "Top Combat Power" bars now use each player's guild badge color instead of emerald.
- **Hunter bar colors** — "Most Active Hunters" bars now use each player's guild badge color instead of amber.
- **Class icon spacers** — Missing class icons now render invisible spacers so bar widths stay consistent across rows.
- **Export button removed** — No longer needed.

## 🏷️ Leaderboard

- **Export assist info** — Boss names in the Excel export now include assist status: `Venatus — Assist (PANORTH)`, `Venatus — Attended (PARAK)`, or `Venatus` for own kills.
- **Export alignment** — Boss/Activity column now left-aligned in export.

## 📦 Inventory — Analytics

- **Items per Day trend chart** — "Items by Category" converted to an SVG trend chart showing daily item distributions per category with colored lines, area fills, and legend.
- **Class icons in Top Recipients** — Circle now shows colored class icon instead of rank number. Falls back to rank number if player has no class.
- **Lighter rarity bars** — "Most Distributed Items" progress bars now use 65% opacity for a softer appearance.

## 🎨 UI — Weekly Schedule

- **Attendance badges** — Killed bosses now show a green `✓✓ N` pill badge when attendance exists. Updates immediately after adding/removing attendance in the modal.
