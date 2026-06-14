# June 14, 2026 — Changelog (v0.14.3)

## 🆕 New Features

- **Member profile equipment section** — each member profile now shows their equipped gear in a dedicated card with item icons, rarity-colored backgrounds, enhancement level badges (gold text), and equipped/total slot counter
- **Gear tab direct slot editing** — click any gear slot cell in the gear tracking table to directly open the item picker for that slot. Auto-scrolls to the editor section so you can immediately pick a new item.
- **Mobile member action menu** — on mobile screens, Edit/Disable/Delete buttons are hidden and replaced with a `⋯` menu button. Tap it to reveal a dropdown with all three actions, keeping the member list clean and tappable on small screens.

## 🎨 UI

- **Equipment card layout** — single-line flex layout using the same sort order as the gear tracking tab, with borders on every gear card (solid for equipped, dashed for empty)
- **Enhancement badge positioning** — moved to bottom-right of item icon at `right-[8%] bottom-[8%]`, gold text on dark background
- **Gear card sizing** — scaled up to `w-16 h-16` icon containers with `text-[9px]` labels for better readability
- **Centered equipment row** — gear cards centered horizontally in the equipment section

## 🔐 Security

- **Viewer RLS for gear data** — migration `027_viewer_gear_access` adds anon/viewer read policies for `items`, `servers`, `members`, and `guilds` so the gear tracking tab and member profile equipment are visible in viewer mode

## 🧱 Architecture

- **GearSlot component** — extracted reusable `GearSlot` component in `MemberProfileView` for consistent gear card rendering
