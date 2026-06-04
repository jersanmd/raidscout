# June 1, 2026 — Changelog

## User Dropdown
- GitHub-style dropdown: click username → shows email + menu items
- Server Settings + Sign Out
- Fixed positioning, z-index 9999, backdrop overlay to close

## Weekly Schedule Navigation
- Prev/Next week buttons on same line as title
- `weekOffset` state offsets Monday calculation
- Loading spinner on week switch
- Label: "This Week" / "Last Week" / "X weeks ago"

## Analytics Fix
- Activity by Day: abbreviated day names (Mon, Tue, Wed) to prevent bar overlap

## Server Settings
- Per-server `notifhere`/`cmdhere` instructions with dynamic prefix

## Previous Features (May 31 continued)
- Channel separation: `;cmdhere` + `;notifhere` with DB column `command_channel_id`
- Boss killed notifications route to commands channel
- Spawn time + recorded by role in kill embeds
- Gentle chime sound + mute button
- Removed Post 24h Spawns, cron, browser Discord notifs
