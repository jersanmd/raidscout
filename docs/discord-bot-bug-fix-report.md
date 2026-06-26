# Discord Bot Bug Fix Report — Speaking Notes

**For**: Reading aloud / presentation
**Date**: Late May – Late June 2026

---

## Opening

Alright, let me walk you through the Discord bot issues we found and fixed over the last month. There were quite a few — some critical, some just annoying — but together they explain why the bot was acting flaky during peak raid hours. I'll go through each one, what was happening, why it happened, and what we did about it.

---

## 1. The Bot Would Go Completely Silent for Half an Hour

This was the big one. Users would report that the bot just… stopped. No spawn notifications, no responses to commands — complete radio silence for thirty, sometimes forty minutes at a time. Then it would suddenly come back like nothing happened.

Here's what was going on. Node.js has this quirk where the built-in `fetch` function — you know, the thing you use to make HTTP requests — has *no default timeout*. If the server on the other end hangs, your fetch hangs forever. It just sits there. So what was happening is: during peak hours, when Supabase or Discord's API was under load, a single request would hang. And because our cron tick runs everything in sequence, that one hung request blocked the entire tick. The bot couldn't do anything else until that request either completed or… well, it never completed.

The fix was straightforward once we understood it. We added what's called an `AbortController` to every single HTTP request the bot makes. Think of it as a kill switch on a timer. If a Supabase query doesn't respond within thirty seconds, we kill it and retry. If Discord's API doesn't respond within twenty seconds, same thing — kill it, retry. We also added proper retry logic with exponential backoff, so if a request fails due to a network blip or Discord rate-limiting us, it'll automatically retry up to three times before giving up.

Two files changed: the Supabase helper and the Discord API helper. That's it. But it's probably the most impactful fix we made.

---

## 2. Each Tick Was Taking 35 Seconds — Now It Takes 5

So even when the bot wasn't hanging, it was slow. During the big spawn wave around 3 to 7 AM UTC, each tick was taking twenty-five to thirty-five seconds. That meant we were skipping ticks — the bot couldn't keep up. Notifications were arriving late. Bosses would spawn and nobody would know for minutes.

We found five separate problems causing this, and honestly, most of them were just… redundant work.

**First**, we discovered that every time the bot sent a notification or created a thread, it was re-querying the database for data it already had. Imagine you have thirty bosses on a server. For each boss, when it spawns, the bot would query `discord_configs`, `servers`, `boss_assists`, and `guilds` — all data that was already fetched at the beginning of the tick. That's over two hundred completely redundant database calls per tick. We fixed this by passing the pre-fetched data through to the notification and thread functions instead of letting them query again.

**Second**, we were querying `discord_configs` three separate times at the start of each tick — once for notification channels, once for thread channels, once for command channels. Three separate queries returning mostly the same rows. We merged them into one.

**Third**, notifications and Discord threads were firing one after another inside the boss loop. So boss one spawns, we send its notification, we create its thread — then boss two, then boss three, and so on. We changed it so all the promises get collected into an array and fired concurrently with a concurrency cap of ten. Much faster.

**Fourth**, we added a concurrency limiter. Without it, if a server had a lot of bosses spawning at once, we'd fire off fifty Discord API calls simultaneously and hit their rate limit. Now we cap it at ten at a time. We also had to add a second batch run at the end for activity-related tasks, because those were leaking into the next tick as zombie background tasks.

**Fifth**, the party list function — which queries static parties, party members, members, and guilds — was being called once per Discord config per boss. So if a server had three linked Discord servers with threads, we'd call it three times for the same boss. We moved it outside the configs loop so it runs once.

The result? Ticks went from thirty-five seconds to about five seconds. During peak. That's an eighty-five percent reduction.

---

## 3. The Kill Command Was Timing Out

This one was frustrating for players. During raid hours, when everyone's trying to report kills quickly, the `!killed` command would take fifteen to eighteen seconds. Sometimes it would just time out entirely and the kill wouldn't register.

Three fixes here. First, three database queries in the kill handler were running one after another — `guilds`, `boss_guilds`, and `death_records`. We made them run in parallel with `Promise.all`. Second, the spawn notification that fires after a kill was blocking the response — we made it fire-and-forget, so the confirmation comes back immediately. Third, we bumped the command timeout from fifteen seconds to twenty-five seconds to give a bit more breathing room.

Kill command now completes in three to five seconds instead of fifteen to eighteen.

---

## 4. Role Mentions Were Wrong

This one was subtle. Server owners would set up per-channel notification prefixes — like `@Raiders` for one channel, `@GuildLeads` for another. But the bot was ignoring these. Every notification just used `@everyone` or whatever the server-level default was.

Turns out the global query that fetches `discord_configs` at the start of each tick was simply missing the `notification_prefix` column in its select. One line. Added it back, and role mentions started working correctly.

---

## 5. Activity Notifications Never Went Out

Activities — like guild events, scheduled raids — they have spawn schedules just like bosses. But their notifications were completely silent. No five-minute warning. No thread. No "starting now" message.

The problem was a type mismatch. The activity handler in the spawn cron was looking for schedule types called `"one_time"` and `"recurring"`. But in the actual database, activities use `"fixed_hours"` and `"fixed_schedule"`. There is no `"recurring"` type anywhere in the database. So the handler was just… skipping every activity.

We renamed `"recurring"` to `"fixed_schedule"` and added a handler for `"fixed_hours"` that parses the time string and computes when it should fire next. Activities now get the same treatment as bosses.

---

## 6. Database Was Doing Way Too Much Work

On the database side, every cron tick was making seven to eight separate REST calls per server. Bosses, death records, guilds, spawn overrides, boss-guild assignments, boss assists, activities — all separate queries. We created a single database function called `bot_server_snapshot` that returns all of that in one call, as a single JSON object. One round trip instead of seven. The spawn cron uses it, the `!nextspawn` command uses it, and `!killed` uses it.

But that exposed another problem. Inside that function, there's a query that says "give me the latest death record for each boss." The way it does that is with `DISTINCT ON` — it groups by boss ID and sorts by death time. The database had an index on `(server_id, death_time DESC)`, but that didn't match the `ORDER BY` clause, which is `(boss_id, death_time DESC)`. So PostgreSQL was scanning and sorting over eighteen thousand rows per tick, per server.

We added a new partial index on `(server_id, boss_id, death_time DESC)` — but only for rows that aren't initial spawn records, because those are excluded by the query anyway. This lets PostgreSQL do an index-only scan. It doesn't even need to touch the table. That cut the query time down dramatically.

We also added an index on `boss_assists` for the `boss_id` column, since that table gets joined into the snapshot.

---

## 7. The Tick Timer Was Dumb

The last one's simple. The bot used a fixed thirty-second interval between ticks. That's fine when things are fast, but wasteful when things are slow — if a tick took twenty seconds, we'd start the next one just ten seconds later, hammering the database while it was still recovering. And when ticks were fast, thirty seconds was slower than it needed to be.

We replaced the fixed `setInterval` with a recursive `setTimeout` that adapts. It keeps a rolling average of the last sixty tick durations and adjusts the wait time:

- If the average tick is under five seconds, it runs every thirty seconds.
- Between five and ten seconds — every sixty seconds.
- Between ten and twenty — every ninety seconds.
- Over twenty — every two minutes.

So the bot breathes. When it's busy, it backs off. When it's quiet, it stays responsive.

---

## Closing

So to wrap up: we fixed eight problems across about a dozen files and four database migrations. The bot went from being silent for half an hour at a time and taking thirty-five seconds per tick, to completing ticks in about five seconds with proper timeout protection, correct role mentions, working activity notifications, and an adaptive scheduler that doesn't waste resources.

The two most impactful fixes were the request timeouts — because a hung request shouldn't be allowed to take down the whole bot — and the batch concurrency changes, because doing work in parallel and not re-querying the same data over and over just makes everything faster.

All of this is deployed and running in production right now. The bot is stable. Ticks are fast. Notifications go out on time. And players can actually use `!killed` during raids without it timing out.

That's the report. Any questions?

