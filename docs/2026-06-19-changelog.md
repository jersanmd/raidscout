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
