# June 15, 2026 — Changelog (v0.14.4)

## 🆕 New Features

- **Inventory recipients tab** — new tab showing all item recipients grouped by player, with chronologically sorted item history, guild filter (persisted to localStorage), and search. Click any player to open a detailed loot history modal with matching logic across both `member_id` and `player_name`.

## 🎨 UI

- **Recipients item badges** — redesigned with no background fill, neutral `#27272a` border, rarity-colored text, and a subtle rarity tint on the item icon only
- **History item badges** — white player names with colored class icons (matching Members and Leaderboard style)
- **Delete confirmation modal** — type the item name to confirm deletion, preventing accidental removes
- **Search bars** — X clear button added to all five search inputs across analytics, history, and recipients tabs
- **Analytics top recipients** — guild badges (colored + Shield icon) next to player names
- **Item recipients modal** — click any item in analytics to see a modal with every player who received it, complete with guild and class badges
- **Category rarity chart** — stacked bar chart with inline labels for each rarity tier
- **Leaderboard class badges** — replaced old badge component with colored class icon + white name pattern
- **Member carousel** — card styling matched to Ranks section (`bg-[#18181b]`, `border-[#27272a]`, `hover:border-[#3f3f46]`), reduced padding
- **Mobile nav** — compressed layout with `text-[9px]` labels and tighter spacing
- **Modal backgrounds** — black modal bg with gray inner elements across all inventory modals

## 🐛 Fixes

- **Corrupted → arrow** — fixed double-encoded UTF-8 in inventory history item cards (`â†'` → `→`)
- **Activity Timeline TS error** — removed leftover `"loot"` type reference after excluding loot entries from the timeline
- **Member profile loot count** — now uses `loot_history.length` instead of broken `loot_count` field

## 🤖 Bot

- **editkilltime parsing** — `HH:MM` is now found anywhere in the argument string, not just the last element (fixes `HH:MM [date]` format)
- **editkilltime timezone** — corrected offset calculation using proper noon-UTC comparison (was adding 16h instead of subtracting 8h)
- **editkilltime rotation guild** — fixed prev-death lookup to find the death immediately before the new time, not the second-most-recent

## 🔐 Security

- **Viewer RLS** — migration `030_viewer_loot_access` adds anon SELECT policies for `distributions` and `items` tables so viewer mode can see inventory data

## 🔧 Architecture

- **Distribution query** — removed `.limit()` from `fetchDistributions` (was capped at 100, then 1000, now unlimited up to Supabase default)
- **Top recipients default** — increased default limit from 10 to 200
