# June 19, 2026 — Changelog (v1.14.1)

## 🆕 New Features

- **Copy attendance between bosses** — Each killed boss row in the Weekly Schedule has a copy icon. Click to enter copy mode, then click any other killed boss to paste the same attendance list. Duplicate members are automatically skipped. ESC exits copy mode and dismisses confirm dialogs. Copy icon hidden when attendance is 0.

## 🎨 UI

- **Smooth startup** — Single dark loading screen covers everything until all data is ready. No more flashing banners, empty states, or partial screens during load or refresh.
- **Seamless server switching** — Switching servers shows a clean loading overlay until data settles. No flash of old guild badges or empty boss cards.
- **Stale build recovery** — Navigating to another tab after a new deploy auto-refreshes instead of showing an error.
- **Weekly Schedule attendance badges** — Killed bosses now show a green pill badge with the attendance count. Updates immediately after adding or removing members.
- **Create Server modal** — Darker background with improved contrast between the modal and game option buttons.
- **Server sidebar** — Selected server no longer shows the role badge. Guild subscription badges appear on every server. Servers sorted alphabetically.
- **Top bar** — Cleaner desktop header without redundant server info.
- **Billing page refreshed** — Dark theme consistent with the rest of the app. Added helpful notes about per-server billing, payment processing, all-inclusive pricing, refund policy, and PayPal security.

## 🐛 Bug Fixes

- **Attendance badges for shared links** — Badges now appear correctly when viewing a shared server link.
- **Email verification detection** — Verified emails are now correctly recognized on all environments.

## 🤖 Discord Bot

- **Activity guild mentions** — Activity notifications now tag the assigned guilds.
- **Both warnings now fire** — The 5-minute heads-up and the "starting now!" notification both send correctly.
- **Auto-threads for every guild** — Activities with multiple guilds create a Discord thread for each guild, complete with party lists.
- **`!nextspawn` by name** — Searching for a specific boss or activity now shows the spawn time even if it's days away.

## 📦 Inventory

- **Collection Ownership Matrix** — Added Combat Power column with sortable CP values. Multi-guild activity badges now show all guilds.
- **Items per Day trend chart** — Items by Category now shown as an animated trend chart with per-category lines, area fills, and legend.
- **Class icons in Top Recipients** — Recipient circles now show colored class icons instead of rank numbers.
- **Lighter rarity bars** — Most Distributed Items progress bars use softer appearance.

## 📊 Analytics

- **Kills per Day trend chart** — Animated daily kill counts with per-guild colored lines, area fills, and staggered dot animations. Supports Week, Month, and All Time views.
- **Hover tooltip with boss details** — Hovering any data point shows date, per-guild kill counts, and the specific bosses killed with guild badges.
- **Per-guild bar charts** — Most Killed Bosses and Activity by Day now use stacked guild-colored bars with count labels.
- **Average attendance per boss** — Most Killed Bosses now shows average attendees per kill next to each boss name.
- **CP Growth tracking** — Weekly view shows 7-day growth, Monthly shows 30-day, All Time shows cumulative.
- **Bar colors match guilds** — Combat Power and Most Active Hunters bars now use each player's guild color.

## 🛠️ Infrastructure

- **PayPal checkout streamlined** — Digital purchase detection means PayPal only asks for name, email, and payment details — no full address required.

## 🏷️ Leaderboard

- **Export assist info** — Boss names in Excel exports include assist status.
- **Export alignment** — Boss and Activity columns now left-aligned for readability.
