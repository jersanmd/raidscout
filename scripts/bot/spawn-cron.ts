// @ts-nocheck
// Spawn cron -- 30s tick: bosses + activities, 5-min warnings + threads with party lists

import { TOKEN, SUPABASE_URL, SUPABASE_KEY } from "./config";
import { discordFetch } from "./discord-api";
import { supabaseQuery, supabaseQuerySafe } from "./supabase";
import { resolveServerTimezone, getNotifyPrefix } from "./server-cache";
import { addHours, computeOwnerGuild, getScheduleTz, scheduleSlotToUTC, findNextScheduleSlot } from "./spawn-utils";
import { broadcastNotification } from "./notifications";
import { createEventThreads } from "./threads";

const sentNotifs = new Map<string, number>();

// Clean up stale dedup entries every 10 minutes (keep 2 hours worth)
setInterval(() => {
  const cutoff = Date.now() - 2 * 3600_000;
  for (const [key, ts] of sentNotifs) {
    if (ts < cutoff) sentNotifs.delete(key);
  }
}, 10 * 60_000);

let cronStarted = false;
let lastTickTime = 0;
let lastServersChecked = 0;
let lastBossesChecked = 0;

export function getCronStats() {
  return {
    last_tick_seconds_ago: lastTickTime ? Math.floor((Date.now() - lastTickTime) / 1000) : null,
    servers_checked: lastServersChecked,
    bosses_checked: lastBossesChecked,
  };
}

export function startSpawnCron() {
  if (cronStarted) return;
  cronStarted = true;

  setInterval(async () => {
    try {
      await runSpawnCron();
    } catch (err: any) {
      console.error("[cron] Tick error:", err.message);
    }
  }, 30_000);

  console.log("Spawn cron started (30s tick)");
}

async function runSpawnCron() {
  lastTickTime = Date.now();
  let serversChecked = 0;
  let bossesChecked = 0;

  const configs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id,discord_guild_id,notification_channel_id&notification_channel_id=not.is.null`
  );
  if (!configs?.length) return;

  // Deduplicate by server_id to avoid double-broadcasting
  const serverIds = [...new Set(configs.map((c: any) => c.raidscout_server_id))];

  for (const serverId of serverIds) {
    const tz = await resolveServerTimezone(serverId).catch(() => "Asia/Manila");
    const [bosses, deaths, guilds, overrides, bossGuilds] = await Promise.all([
      supabaseQuerySafe(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null`),
      supabaseQuerySafe(`death_records?server_id=eq.${serverId}&order=death_time.desc&limit=300`),
      supabaseQuerySafe(`guilds?server_id=eq.${serverId}`),
      supabaseQuerySafe(`boss_spawn_overrides?server_id=eq.${serverId}&select=boss_id,death_time`),
      supabaseQuerySafe(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode`),
    ]);

    const overrideMap = new Map((overrides || []).map((o: any) => [o.boss_id, o.death_time]));
    const guildIds = new Set((guilds || []).map((g: any) => g.id));
    const serverBossGuilds = (bossGuilds || []).filter((bg: any) => guildIds.has(bg.guild_id));

    if (!bosses?.length) continue;

    serversChecked++;
    for (const boss of bosses) {
      try {
        bossesChecked++;
        const bossDeaths = (deaths || []).filter((d: any) => d.boss_id === boss.id && !d.is_initial_spawn);
        const lastDeath = bossDeaths.sort((a: any, b: any) =>
          new Date(b.death_time).getTime() - new Date(a.death_time).getTime()
        )[0];
        const overrideDeathTime = overrideMap.get(boss.id);
        const effectiveDeathTime = overrideDeathTime ?? lastDeath?.death_time ?? null;

        let spawnTime: Date;
        if (boss.spawn_type === "fixed_hours") {
          if (!effectiveDeathTime) continue; // No death data -- skip
          spawnTime = new Date(new Date(effectiveDeathTime).getTime() + (boss.respawn_hours ?? 24) * 3600_000);
        } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
          const schedTz = getScheduleTz(boss, tz);
          let recentSlot: Date | null = null;
          const now = new Date();
          for (let d = 0; d <= 7; d++) {
            const check = new Date(now); check.setDate(check.getDate() - d);
            for (const slot of boss.schedule) {
              const c = scheduleSlotToUTC(schedTz, check, slot.day, slot.time);
              if (c <= now && (!recentSlot || c > recentSlot)) recentSlot = c;
            }
          }
          if (!recentSlot) continue;
          const nextSlot = findNextScheduleSlot(boss.schedule, new Date(recentSlot.getTime() + 60_000), schedTz);
          const aliveUntil = new Date(Math.min(nextSlot.getTime() - 3600_000, recentSlot.getTime() + 4 * 3600_000));
          const wasKilled = lastDeath && new Date(lastDeath.death_time) >= recentSlot;
          if (wasKilled || now >= aliveUntil) {
            // Not alive -- spawn at next schedule slot
            spawnTime = findNextScheduleSlot(boss.schedule, now, schedTz);
          } else {
            // Still alive -- spawn time is now (already alive)
            continue; // Don't notify while alive
          }
        } else {
          continue;
        }

        const spawnUnix = Math.floor(spawnTime.getTime() / 1000);
        const nowUnix = Math.floor(Date.now() / 1000);
        const secsSinceSpawn = nowUnix - spawnUnix; // positive = already spawned
        const secsUntilSpawn = spawnUnix - nowUnix; // positive = not yet spawned

        const guildName = computeOwnerGuild(boss, serverBossGuilds, (guilds || []), lastDeath, spawnTime, tz) || "";

        // ── Spawn-time notification (just spawned) ──
        if (secsSinceSpawn >= 0 && secsSinceSpawn <= 60) {
          const spawnDedupKey = `${serverId}-${boss.id}-boss_spawned-${spawnUnix}`;
          if (!sentNotifs.has(spawnDedupKey)) {
            sentNotifs.set(spawnDedupKey, Date.now());
            const prefix = await getNotifyPrefix(serverId).catch(() => "");
            const timeStr = spawnTime.toLocaleString("en-US", {
              timeZone: tz || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
            });
            const text = `${prefix ? prefix + " " : ""}🟢 **${boss.name}** has spawned -- **${guildName}** ${timeStr}`;
            await broadcastNotification(serverId, {}, "", text);
          }
          continue; // Don't re-process in 5-min block
        }

        if (secsUntilSpawn <= 0) continue; // Spawned long ago — skip

        // ── 5-minute warning + thread ──
        if (secsUntilSpawn > 0 && secsUntilSpawn <= 300) {
          const dedupKey = `${serverId}-${boss.id}-5min-${spawnUnix}`;
          if (!sentNotifs.has(dedupKey)) {
            sentNotifs.set(dedupKey, Date.now());
            const prefix = await getNotifyPrefix(serverId).catch(() => "");
            const timeStr = spawnTime.toLocaleString("en-US", {
              timeZone: tz || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
            });
            const text = `${prefix ? prefix + " " : ""}⚠️ **${boss.name}** spawning in 5 min -- **${guildName}** ${timeStr}`;
            await broadcastNotification(serverId, {}, "", text);

            // Record notification to prevent duplicates (best-effort, in-memory is the real dedup)
            await fetch(`${SUPABASE_URL}/rest/v1/spawn_notifications`, {
              method: "POST",
              headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                server_id: serverId, boss_id: boss.id,
                event: "boss_spawning", spawn_timestamp: spawnUnix, notified_via: "discord",
              }),
            }).catch(() => {});
          }

          // Auto-thread with party list (independent of notification dedup)
          const threadDedupKey = `${serverId}-thread-${boss.id}-${spawnUnix}`;
          if (!sentNotifs.has(threadDedupKey)) {
            sentNotifs.set(threadDedupKey, Date.now());
            await createEventThreads(serverId, boss.name, guildName, spawnUnix, "boss", boss.id).catch(console.error);
          }
        }
      } catch (bossErr: any) {
        console.error(`[cron] Error processing boss ${boss.id}:`, bossErr.message);
      }
    }

    // ── Activities ──────────────────────────────────────────
    const activities = await supabaseQuerySafe(
      `activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null`
    );
    if (activities?.length) {
      const now = new Date();
      for (const activity of activities) {
        try {
          let nextStart: Date | null = null;

          if (activity.schedule_type === "one_time" && activity.start_time) {
            nextStart = new Date(activity.start_time);
          } else if (activity.schedule_type === "recurring" && activity.schedule) {
            // Find next occurrence within 24h
            const schedTz = activity.schedule_tz || tz;
            for (let d = 0; d <= 7; d++) {
              const check = new Date(now);
              check.setDate(check.getDate() + d);
              for (const slot of activity.schedule) {
                const c = scheduleSlotToUTC(schedTz, check, slot.day, slot.time);
                if (c > now && (!nextStart || c < nextStart)) {
                  nextStart = c;
                }
              }
            }
          }

          if (!nextStart || nextStart <= now) continue;

          const startUnix = Math.floor(nextStart.getTime() / 1000);
          const nowUnix = Math.floor(Date.now() / 1000);
          const secsUntilStart = startUnix - nowUnix;

          // ── 5-minute thread for activities ──
          if (secsUntilStart > 0 && secsUntilStart <= 300) {
            const threadDedupKey = `${serverId}-thread-activity-${activity.id}-${startUnix}`;
            if (!sentNotifs.has(threadDedupKey)) {
              sentNotifs.set(threadDedupKey, Date.now());
              await createEventThreads(
                serverId, activity.name, undefined, startUnix, "activity", activity.id
              ).catch(console.error);
            }
          }
        } catch (actErr: any) {
          console.error(`[cron] Error processing activity ${activity.id}:`, actErr.message);
        }
      }
    }
  }
  lastServersChecked = serversChecked;
  lastBossesChecked = bossesChecked;
}
