# June 2, 2026 — Changelog

## Boss Points Tab — Per-Guild Points + Salary Matrix
- New "Boss Points" tab in Server Settings with matrix: bosses (rows) × guilds (columns: points + salary)
- `boss_guilds` got `points INTEGER` and `has_salary BOOLEAN` columns
- `get_leaderboard` RPC updated to use per-guild points via `COALESCE(bg.points, b.boss_points, 1)`
- Check-all salary toggle per guild with batch `upsertBossGuildPoints`
- Old global salary checkbox deprecated

## Dark/Light Mode Toggle
- `ThemeContext` stores theme in localStorage, toggles `dark` class on `<html>`
- User dropdown: ☀️ Light Mode / 🌙 Dark Mode switch
- Custom light palette, borders and inputs adapted for light mode

## Production Polish
- Shadow system (`shadow-card`, `shadow-card-hover`), glass header, gradient text/borders
- Glass morphism header (`backdrop-blur-xl saturate-180`)
- Boss cards: `card-lift shadow-card hover:shadow-card-hover`
- Skeleton loaders (`CardGridSkeleton`, `TableRowSkeleton`, `BossCardSkeleton`)
- `ErrorRetry` component
- Micro-interactions: glow-pulse, shake, pop-in
- Page titles per route, skip-to-content, focus-visible rings, aria-labels
- `NotFoundPage` 404 with skull icon
- Animations: card-enter, timer-pulse, kill-flash, modal-enter, toast-in, shimmer, reveal-up

## Landing Page Improvements
- Hero CTA: `glow-pulse` breathing animation
- 10-question FAQ accordion
- ToS + Privacy Policy checkbox on sign-up
- Dynamic copyright year in footer
- Professional 4-column footer grid

## Performance & Accessibility
- Supabase preconnect in `index.html`
- `loading="lazy"` on boss images
- React Query staleTime tuning
- Focus-visible rings, skip-to-content, reduced-motion media query

## Notification Polish
- Kill notifications: plain text only
- Reply embed keeps skull + timestamps

## Bug Fixes
- Leaderboard: dropped duplicate `get_leaderboard` function causing PostgREST 300
- Leaderboard: `boss_guilds` LEFT JOIN causing duplicate rows → points inflated
- `boss_guilds_mode_check` constraint fix
- `batchSetGuildSalary` RPC: 400 errors resolved
