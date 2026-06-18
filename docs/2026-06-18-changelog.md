# June 18, 2026 — Changelog (v0.15.1)

## 🎨 UI — Sidebar Refactor

- **Single sidebar** — Collapsed, hover overlay, and expanded states now use one shared `renderSidebarNav()` function. Removed ~150 lines of duplicate code.
- **Abbreviated headers** — Collapsed sidebar shows section labels (Svrs, Ops, Mgmt, Asts, Ins) instead of invisible spacers, matching expanded label font sizes.
- **Consistent heights** — All nav items, server icons, and bottom buttons use fixed `h-9` with `py-2` and `flex items-center` — collapsed and expanded heights are now identical.
- **Selected server highlight** — Current server icon in collapsed mode now has `bg-[#18181b] rounded-md` background matching expanded mode.
- **Auto-collapse fix** — Visiting Server Settings/Billing auto-collapses the sidebar but no longer persists to localStorage. Closing the browser on those pages won't leave the sidebar stuck collapsed.
- **Default expanded** — Sidebar now defaults to expanded on first visit.

## 🎨 UI — Tab Redesign

- **Leaderboard tabs** — "Since Reset" / "All Time" now use Members-style tab buttons with `border-b border-[#27272a]` and rounded-top active state, replacing the old pill-style container.
- **Inventory tabs** — Catalog, Collections, History, Recipients, Analytics all switched to the same Members-style tab design.

## 🎨 UI — Search Bar Consistency

- **Recipients search** — Redesigned to match History tab: `w-48 rounded-xl text-sm py-2.5` with larger icon and clear button.
- **Matrix search** — Same redesign applied to Collection Ownership player search bar.
- **Recipients filters** — Guild and Sort dropdowns now use `rounded-xl py-2.5 text-sm` matching the History style.

## 🛠️ Infrastructure

- **Date-based auto-versioning** — `APP_VERSION` now auto-generates from build date/time (e.g., `2026.06.18.0730`). No manual version bumping needed.
- **Build version in footer** — Desktop footer now shows `© RaidScout · v2026.06.18.0730`.
- **Manual localStorage wipe control** — `WIPE_STORAGE_KEY` in `main.tsx` controls when user preferences reset. Bump it (e.g., `"v1"` → `"v2"`) only for breaking changes. Routine deploys keep all user settings intact.
