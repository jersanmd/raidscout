# May 25, 2026 — Changelog (v0.13.2 → v0.13.8)

## v0.13.2-1.13.3 Bug Fixes
- **Viewer 406**: `get_server_by_viewer_key` RPC returns viewer settings; AuthContext stores them
- **Stale death records**: `staleTime: 0`, `refetchOnMount: true`
- **Search empty state**: "No bosses match" message
- **Viewer kill in Weekly Schedule**: `!isViewer` → `!isViewer || viewerCanMarkDied`
- **Analytics pagination reset**: huntersPage resets on period change
- **rotation_counter default**: 0 → 1 in DB
- **get_leaderboard RPC**: UNION includes point-adjustment-only members

## v0.13.4
- Member kills modal respects leaderboard reset date

## v0.13.5
- Viewer server webhook URL in ServerContext
- `get_server_viewer_key` RPC replaces REST query
- Removed dead NotificationToggle

## v0.13.6
- `saveLeaderboardSnapshot` accepts `serverId` param
- `subscribeToServerSettings`: multi-subscriber via callbacks Set
- `useBosses` staleTime: 0, refetchOnMount: true

## v0.13.7
- Viewer settings re-verification on every page load
- Viewer timezone from `get_server_by_viewer_key`
- ViewerRoute key switching for re-auth
- `get_latest_deaths` excludes initial spawn records

## v0.13.8
- Dead code removal: AuthForm, useAutoFinalize, notifications.ts, dead history.ts functions
- `useMembers` staleTime: 0 / subscribeToDeathRecords/Bosses accept serverId param

## DB Migrations Deployed
- `auto_mark_alive_on_server_create`
- `fix_rotation_counter_default`
- `fix_leaderboard_zero_attendance`
- `viewer_settings_in_get_server_by_viewer_key`
- `add_timezone_to_viewer_key_rpc`
- `get_server_viewer_key_rpc`
- `filter_initial_spawn_from_latest_deaths`

## Test Status
- 93 tests across 5 files, all passing
