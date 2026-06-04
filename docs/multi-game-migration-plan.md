# Multi-Game Database Migration Plan

**Date:** June 4, 2026  
**Branch:** `master-multi-game-scaling`  
**New Database:** `cjuacehmienztxrhwnlg.supabase.co`

---

## Overview

Migrate from the current single-game LordNine database to the new multi-game schema while preserving all player data, guilds, points, and history.

### Architecture
- **1 Game**: "LordNine: Infinite Class" (ID `00000000-0000-0000-0000-000000000001`)
- **39 Boss Templates**: seeded in `009_games_and_templates.sql`, shared by all LordNine servers
- **All existing servers** → linked to LordNine game via `servers.game_id`
- **All existing bosses** → matched to templates by name via `bosses.template_id`
- **Custom bosses** (no template match) → marked `is_custom = true`
- **Schedules stored as UTC** — runtime converts UTC → server timezone for display

### Key Facts
- All `timestamptz` columns (death_time, created_at, etc.) are already stored as **UTC** — no conversion needed
- `boss_templates.schedule` and `bosses.schedule` **must be stored as UTC** — see Step 2
- Boss IDs must be preserved so death records don't break

---

## Step 1: Apply Migrations to New Database

Push all migrations in order. The 50+ files handle schema creation, RLS, RPCs, and seed data.

Command:
```bash
supabase link --project-ref cjuacehmienztxrhwnlg
supabase db push --linked
```

This creates all tables, seeds the "LordNine: Infinite Class" game, 39 boss templates, and auto-backfills `servers.game_id` and `bosses.template_id` (migration 011).

---

## Step 2: Convert Boss Template Schedules (GMT+8 → UTC)

The 39 LordNine boss templates in `009_games_and_templates.sql` currently have schedules in GMT+8. **These must be converted to UTC** before pushing migrations. The runtime code will use `"UTC"` as the conversion timezone for template-based bosses, then display times in the server's local timezone.

### Rule: Subtract 8 hours from GMT+8

All 17 schedule bosses (22 fixed-hours bosses don't have schedules — no conversion needed):

| Boss | Schedule (GMT+8) | → UTC |
|---|---|---|
| Auraq | Fri 22:00, Wed 21:00 | Fri 14:00, Wed 13:00 |
| Benji | Sun 21:00 | Sun 13:00 |
| Catena | Wed 15:00, Sat 19:00 | Wed 07:00, Sat 11:00 |
| Chaiflock | Sun 15:00 | Sun 07:00 |
| Clemantis (schedule) | Mon 11:30, Thu 19:00 | Mon 03:30, Thu 11:00 |
| Icaruthia | Tue 21:00, Fri 21:00 | Tue 13:00, Fri 13:00 |
| Larba | Tue 18:00 | Tue 10:00 |
| Libitina | Mon 21:00, Sat 21:00 | Mon 13:00, Sat 13:00 |
| Lucus | Sat 22:00 | Sat 14:00 |
| Motti | Tue 22:00 | Tue 14:00 |
| Nevaeh | Wed 22:00 | Wed 14:00 |
| Ordo | Thu 22:00, Fri 17:00 | Thu 14:00, Fri 09:00 |
| Rakajeth | Sat 20:00, Mon 15:00 | Sat 12:00, Mon 07:00 |
| Secreta | Tue 20:00, Thu 18:00 | Tue 12:00, Thu 10:00 |
| Supore | Sun 19:00, Wed 14:00 | Sun 11:00, Wed 06:00 |
| Titore | Sun 18:00 | Sun 10:00 |
| Tumier | Fri 15:00 | Fri 07:00 |

### Day wrapping rule:
If GMT+8 time is between 00:00–07:59, the UTC time wraps to the **previous day**:
- GMT+8 Mon 06:00 → UTC Sun 22:00 (day -1)
- GMT+8 Mon 10:00 → UTC Mon 02:00 (same day)

**None of the current 17 bosses trigger day wrapping** (earliest GMT+8 time is 11:30).

---

## Step 3: Transfer Data from Old to New Database

### Direct copy tables (same structure):
Export from old DB, import into new DB **preserving all IDs**:

| Table | Notes |
|---|---|
| `servers` | `game_id` backfilled by migration 011 |
| `server_members` | |
| `guilds` | |
| `members` | |
| `death_records` | Preserve IDs |
| `attendance_records` | |
| `boss_guilds` | Rotation + points preserved |
| `point_adjustments` | |
| `point_rules` | Time multipliers preserved |
| `leaderboard_snapshots` | Per-guild history preserved |
| `app_settings` | Per-guild resets preserved |
| `moderator_permissions` | |
| `discord_configs` | Discord guild/server links |
| `spawn_notifications` | Dedup records |
| `boss_spawn_overrides` | Force-spawn records |

### Special handling:

**`bosses` table** — After importing old bosses:
```sql
-- Add multi-game columns (migration 011 handles most, 025 adds has_salary)
ALTER TABLE bosses ADD COLUMN IF NOT EXISTS has_salary BOOLEAN NOT NULL DEFAULT false;

-- Backfill template_id by matching boss name to template (migration 011 does this)
-- UPDATE bosses b SET template_id = bt.id
-- FROM boss_templates bt WHERE b.name = bt.name
--   AND bt.game_id = '00000000-0000-0000-0000-000000000001';

-- Any boss without a template match is a custom boss
UPDATE bosses SET is_custom = true WHERE template_id IS NULL;
```

**Schedule bosses** — After import, convert their schedules to UTC:
```sql
-- Apply the same GMT+8 → UTC conversion from Step 2 to all schedule bosses
-- Use the conversion table above to UPDATE bosses.schedule for each boss
```

**`servers` linkage** — Already handled by migration 011 backfill:
```sql
-- Migration 011 runs: UPDATE servers SET game_id = '00000000-0000-0000-0000-000000000001' WHERE game_id IS NULL;
```

---

## Step 4: Update Configurations

### Web App (`src/lib/supabase.ts`):
```ts
const SUPABASE_URL = "https://cjuacehmienztxrhwnlg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Ia2ROWLd0gCeq9lCRoHgmQ_OJyUoX81";
```

### Discord Bot (env vars):
```
SUPABASE_URL=https://cjuacehmienztxrhwnlg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<new project service role key>
```

### Edge Functions:
Redeploy to new project:
```bash
supabase functions deploy discord-notify
supabase functions deploy ai-vision
```

---

## Step 5: Code Changes Required

### Schedule timezone handling

Since templates now store UTC schedules, the code must pass `"UTC"` instead of the server timezone when computing spawn times for **template-based bosses**. Custom bosses (no `template_id`) still use the server timezone.

**Files to update:**
- `scripts/discord-bot-gateway.ts` — `scheduleSlotToUTC` and `findNextScheduleSlot` calls
- `src/lib/spawnCalculator.ts` — schedule calculation functions

**Logic:** If `boss.template_id` exists → pass `"UTC"` to schedule conversion. Otherwise → pass `server.timezone`.

---

## Step 6: Deployment — Maintenance Window

1. Enable maintenance mode (admin panel → Infra tab)
2. Export final data from old DB
3. Convert boss schedules to UTC in export
4. Import into new DB
5. Run Step 3 special handling SQL
6. Update `supabase.ts` config
7. Update bot env vars
8. Redeploy edge functions
9. Build & deploy web app (`fly deploy`)
10. Restart Discord bot
11. Disable maintenance mode
12. ~20-30 minutes downtime

---

## TODO Checklist

- [ ] Update `009_games_and_templates.sql` — convert 17 schedule bosses GMT+8 → UTC
- [ ] Link CLI to new project
- [ ] Push all migrations
- [ ] Export old DB data (all tables from Step 3)
- [ ] Convert old boss schedules to UTC in export
- [ ] Import data into new DB
- [ ] Run `has_salary` ALTER + `is_custom` UPDATE
- [ ] Verify `servers.game_id` and `bosses.template_id` backfills
- [ ] Update `scheduleSlotToUTC` calls to use `"UTC"` for template bosses
- [ ] Update `supabase.ts` config
- [ ] Update bot env vars
- [ ] Redeploy edge functions (`discord-notify`, `ai-vision`)
- [ ] Test locally against new DB
- [ ] Deploy web app
- [ ] Restart bot
