# October 3, 2026 — Changelog

## 🐛 Bug Fixes

- **`!kill` said "not currently alive" when the boss had already been marked dead** — Reported from CoffeeVN: the owner marked Libitina dead on the website at 20:06 (GMT+7), six minutes after it spawned. A member's `!kill` at 20:16 got "Libitina is not currently alive", which read as a bot bug while the boss was standing in game — and was first suspected to be the server's GMT+7 timezone. It wasn't: scheduled bosses are stored and checked in UTC, and CoffeeVN's schedules match every other server's.

  For scheduled bosses, a kill already recorded in the current spawn window made the alive check fail first, so the "already declared dead" reply further down could never fire. Now, when the only thing keeping the boss from being alive is a kill in its still-open window, `!kill` says so:

  ```
  ⏳ Libitina was already marked dead on the website at 8:06 PM (10 minutes ago).
  -# Wrong time? Use `!editkilltime Libitina HH:MM 2026-10-03` (server time),
     or edit it on the website's History page.
  ```

  Details of the new reply: "on the website" appears only when the death row has a `user_id` (a signed-in web user); bot, automation and viewer-link kills get no source rather than a wrong one. The `editkilltime` hint carries the kill's date in server time — without one, the command assumes today and would move an older kill. There's no "delete it" hint because History has had no delete action. Outside a scheduled boss's alive window, or for force-spawn overrides, the plain "not currently alive" reply is unchanged, and mention-invoked commands fall back to the server's prefix in hints (which previously rendered as "undefinededitkilltime").

  Whether a kill is accepted is unchanged; only the rejection text differs. The spawn-window computation moved verbatim into `scheduledSpawnWindow()` so the CoffeeVN case is tested end-to-end; a scratch comparison against the old inline code found 0 differences over 4,548 timestamps in each of UTC, +0800 and America/New_York (across a DST change).

  Deployed to Fly as `raidscout-bot` v250.
