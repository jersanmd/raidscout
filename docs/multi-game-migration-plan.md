# Multi-Game Database Migration Plan

**Date:** June 4, 2026  
**Branch:** `master-multi-game-scaling`  
**New Database:** `cjuacehmienztxrhwnlg.supabase.co`

---

## Overview

Migrate from the current single-game LordNine database to the new multi-game schema while preserving all player data, guilds, points, and history.

### Key Facts
- All `timestamptz` columns (death_time, created_at, etc.) are already stored as **UTC** — no conversion needed
- Only `bosses.schedule` JSONB times need GMT+8 → UTC conversion
- Boss IDs must be preserved so death records don't break

---

## Step 1: Apply Migrations to New Database

Push ALL migrations in order:
```
000_core_tables.sql
001_initial_schema.sql
002_attendance.sql
002b_schema_fixes.sql
003_leaderboard_snapshots.sql
004_helper_functions.sql
005_viewer_rpcs.sql
005_spawn_notifications.sql
006_multi_server_prefix.sql
006_discord_configs.sql
007_create_server_with_bosses.sql
007_get_all_servers_with_counts.sql
007b_helper_functions.sql
008_get_server_stats_with_guilds.sql
008_guild_analytics.sql
009_command_aliases.sql
009_games_and_templates.sql
010_activities_and_parties.sql
011_server_game_association.sql
012_update_create_server_rpc.sql
013_leaderboard_activity_points.sql
014_auto_sync_templates.sql
015_activity_parties_rpc.sql
015_rally_image_storage.sql
016_viewer_activity_rpcs.sql
017_find_daily_slot.sql
018_command_channel.sql
019_soft_delete_servers.sql
020_game_icons_bucket.sql
021_game_templates_rls.sql
022_activity_template_image.sql
023_activity_category_tags.sql
024_moderator_permissions.sql
025_boss_salary.sql
026_party_leader.sql
027_party_leaders_guild.sql
028_thread_config.sql
029_notification_prefix_per_config.sql
030_boss_guild_points.sql
031_fix_leaderboard_points.sql
031_fix_server_select_policy.sql
032_bundle_guild_into_create_server.sql
032_fix_snapshot_period_constraint.sql
033_per_guild_leaderboard_reset.sql
033_relax_rls_for_staging.sql
034_fix_leaderboard_per_guild.sql
034_fix_user_roles_rls.sql
035_fix_rpc_signature.sql
035_server_boss_activity_mgmt.sql
036_add_guild_reset_flag.sql
037_drop_all_leaderboard.sql
038_fix_leaderboard_per_guild.sql
039_add_time_multiplier_to_rpc.sql
```

Command:
```bash
supabase link --project-ref cjuacehmienztxrhwnlg
supabase db push --linked
```

---

## Step 2: Convert Boss Schedule Times (GMT+8 → UTC)

The 39 LordNine boss templates in `009_games_and_templates.sql` have schedules in GMT+8. Convert them to UTC by subtracting 8 hours.

### Schedule conversion examples:

| Boss | Schedule (GMT+8) | → UTC |
|---|---|---|
| Auraq | Fri 22:00, Wed 21:00 | Fri 14:00, Wed 13:00 |
| Benji | Sun 21:00 | Sun 13:00 |
| Clemantis | Mon 11:30, Thu 19:00 | Mon 03:30, Thu 11:00 |
| Icaruthia | Tue 21:00, Fri 21:00 | Tue 13:00, Fri 13:00 |
| Libitina | Mon 21:00, Sat 21:00 | Mon 13:00, Sat 13:00 |
| Lucus | Sat 22:00 | Sat 14:00 |
| Motti | Tue 22:00 | Tue 14:00 |
| Nevaeh | Wed 22:00 | Wed 14:00 |
| Ordo | Thu 22:00, Fri 17:00 | Thu 14:00, Fri 09:00 |
| Rakajeth | Sat 20:00, Mon 15:00 | Sat 12:00, Mon 07:00 |
| Secreta | Tue 20:00, Thu 18:00 | Tue 12:00, Thu 10:00 |
| Supore | Sun 19:00, Wed 14:00 | Sun 11:00, Wed 06:00 |
| Titore | Sun 18:00 | Sun 10:00 |
| Larba | Tue 18:00 | Tue 10:00 |
| Catena | Wed 15:00, Sat 19:00 | Wed 07:00, Sat 11:00 |
| Tumier | Fri 15:00 | Fri 07:00 |
| Chaiflock | Sun 15:00 | Sun 07:00 |

### Day wrapping rule:
If GMT+8 time is between 00:00–07:59, the UTC time wraps to the **previous day**:
- GMT+8 Mon 06:00 → UTC Sun 22:00 (day -1)
- GMT+8 Mon 10:00 → UTC Mon 02:00 (same day)

---

## Step 3: Transfer Data from Old to New Database

### Direct copy tables (same structure):
Export from old DB, import into new DB:

| Table | Notes |
|---|---|
| `servers` | Add defaults for new columns |
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

### Special handling:

**`bosses` table** — After importing old bosses, run:
```sql
ALTER TABLE bosses ADD COLUMN IF NOT EXISTS template_id UUID;
ALTER TABLE bosses ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT true;
ALTER TABLE bosses ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true;
ALTER TABLE bosses ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false;
ALTER TABLE bosses ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 1;
ALTER TABLE bosses ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE bosses ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE bosses ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

UPDATE bosses SET is_custom = true WHERE template_id IS NULL;
```

**`server_game_association`** — Link servers to LordNine:
```sql
INSERT INTO server_game_association (server_id, game_id)
SELECT id, '00000000-0000-0000-0000-000000000001'
FROM servers
ON CONFLICT DO NOTHING;
```

---

## Step 4: Update App Configuration

Update `src/lib/supabase.ts`:
```ts
const SUPABASE_URL = "https://cjuacehmienztxrhwnlg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Ia2ROWLd0gCeq9lCRoHgmQ_OJyUoX81";
```

---

## Step 5: Recommended Approach — Maintenance Window

1. Take old app offline
2. Export final data from old DB
3. Import into new DB
4. Deploy updated app pointing to new DB
5. ~15-30 minutes downtime

---

## TODO Checklist

- [ ] Link CLI to new project
- [ ] Push all migrations
- [ ] Convert boss schedules GMT+8 → UTC
- [ ] Export old DB data
- [ ] Import data into new DB
- [ ] Add missing boss columns
- [ ] Link servers to LordNine game
- [ ] Update supabase.ts config
- [ ] Test locally against new DB
- [ ] Deploy
