# July 15, 2026 — Changelog

## 🖼️ Boss Template Images

- **Boss templates now support image upload** — Added `image_url` column to `boss_templates` and `bosses` tables. Admin panel "Add Boss" form now uploads and displays custom boss images instead of auto-generated initials.
- **Storage RLS fix** — Replaced granular `game_icons_insert`/`game_icons_select` policies with a single `game_icons_all` policy to fix authenticated upload failures ("new row violates row-level security policy").
- **Image size consistency** — Boss template thumbnails now render at 32×32 (`w-8 h-8`) matching the `BossImage` "sm" size, instead of 20×20.
- **Images propagate to all servers** — New `AFTER INSERT` trigger `trg_insert_boss_template` automatically inserts new boss templates into every server under the same game, including `image_url`. Updated `sync_boss_template` trigger and `create_server_with_bosses` RPC to include `image_url`.

## 🐛 Bug Fixes

- **`AddBossForm` 400 error** — Fixed `image_url` being sent to `boss_templates` before the column existed. Added column to both staging and production databases.
- **`AdminGamesTab` infinite re-render** — `setItemLoadedGames(new Set())` was creating a new Set reference on every render when no game was expanded. Fixed with conditional that only creates a new Set when already non-empty.
- **PostgREST schema cache** — New columns weren't visible to the REST API until schema reload. Dropping and recreating the column forced PostgREST to refresh.

## 📦 Inventory — Recipients Tab

- **Date grouping** — Added "Group by Day" and "Group by 3 Days" dropdowns. Items are now organized under date headers ("Today", "Yesterday", "Wed, Jul 15", etc.) instead of a flat list.
- **Scrollable items** — Player item cells now have `max-h-[300px]` with scroll, so players with dozens of items can see them all.
- **Performance** — Replaced `items.find()` with `useMemo`-ized `itemsById` Map for O(1) lookups in sort and render functions.
- **Input validation** — Dropdown values validated before state set. Invalid dates handled with "Unknown Date" fallback.

## 📄 Legal Docs

- **Terms of Service & Privacy Policy refreshed** — Expanded from 16→18 and 12 sections respectively with stronger legal language, GDPR citations, indemnification, force majeure, and clearer data handling disclosures.

## 🤖 CI/CD

- **AI Code Review workflow** — New GitHub Action triggers on PR open/sync, sends diff to GPT-4o-mini, and posts a review comment. Added `scripts/ai-review.mjs` and `.github/workflows/ai-review.yml`.
- **Env file cleanup** — Created `.env.production` with production Supabase keys. `.env.local` now correctly points to staging for local development. `sync-staging.ps1` reads service role keys from env files instead of requiring manual env vars.

## 🗄️ Database

- **Boss template auto-propagation** — `trg_insert_boss_template` ensures new templates are instantly available on all servers under the same game, with fixed_hours bosses marked alive on each server.
