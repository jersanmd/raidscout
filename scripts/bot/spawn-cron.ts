// @ts-nocheck
// Spawn cron -- 30s tick: bosses + activities, 5-min warnings + threads with party lists

import { TOKEN, SUPABASE_URL, SUPABASE_KEY } from "./config";
import { discordFetch } from "./discord-api";
import { supabaseQuery, supabaseQuerySafe } from "./supabase";
import { resolveServerTimezone } from "./server-cache";
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
  }, 60_000);

  console.log("Spawn cron started (60s tick)");
}

async function runSpawnCron() {
  lastTickTime = Date.now();
  let serversChecked = 0;
  let bossesChecked = 0;

  const configs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id,discord_guild_id,notification_channel_id&notification_channel_id=not.is.null`
  );
  if (!configs?.length && !threadConfigs?.length && !cmdConfigs?.length) return;

  // Fetch active servers (exclude soft-deleted)
  const activeServers = await supabaseQuerySafe(`servers?select=id&deleted_at=is.null`);
  const activeServerIds = new Set((activeServers || []).map((s: any) => s.id));

  // Fetch thread configs for logging (which Discord servers have auto-threads enabled)
  const threadConfigs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id,discord_guild_id,thread_channel_id,thread_guilds&thread_channel_id=not.is.null`
  );
  // Map: serverId → [{ discord_guild_id, thread_guilds }]
  const serverThreadMap = new Map<string, { discordId: string; threadGuilds: string[] }[]>();
  for (const tc of (threadConfigs || [])) {
    const sid = tc.raidscout_server_id;
    if (!serverThreadMap.has(sid)) serverThreadMap.set(sid, []);
    serverThreadMap.get(sid)!.push({ discordId: tc.discord_guild_id, threadGuilds: tc.thread_guilds || [] });
  }

  // Fetch command channel configs (servers with !cmdhere set)
  const cmdConfigs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id&command_channel_id=not.is.null`
  );

  // Fetch ALL discord_configs for the server count (matches admin panel "Bot Alerts" logic)
  const allDiscordConfigs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id`
  );

  // Deduplicate by server_id — include ALL discord config types, exclude soft-deleted
  const allConfigServerIds = [
    ...configs.map((c: any) => c.raidscout_server_id),
    ...(threadConfigs || []).map((c: any) => c.raidscout_server_id),
    ...(cmdConfigs || []).map((c: any) => c.raidscout_server_id),
  ];
  const serverIds = [...new Set(allConfigServerIds)]
    .filter((id: string) => activeServerIds.has(id));

  // Count ALL servers with any Discord integration (matches admin panel "Bot Alerts")
  const allDiscordServerIds = [...new Set((allDiscordConfigs || []).map((c: any) => c.raidscout_server_id))]
    .filter((id: string) => activeServerIds.has(id));
  serversChecked = allDiscordServerIds.length;

  for (const serverId of serverIds) {
    const tz = await resolveServerTimezone(serverId).catch(() => "Asia/Manila");
    const [bosses, deaths, guilds, overrides] = await Promise.all([
      supabaseQuerySafe(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null`),
      supabaseQuerySafe(`death_records?server_id=eq.${serverId}&order=death_time.desc&limit=300`),
      supabaseQuerySafe(`guilds?server_id=eq.${serverId}`),
      supabaseQuerySafe(`boss_spawn_overrides?server_id=eq.${serverId}&select=boss_id,death_time`),
    ]);

    // Fetch boss_guilds filtered by this server's guilds (avoid cross-server row limit)
    const guildIds = [...new Set((guilds || []).map((g: any) => g.id))];
    const bossGuilds = guildIds.length > 0
      ? await supabaseQuerySafe(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode&guild_id=in.%28${guildIds.join("%2C")}%29&limit=10000`)
      : [];
    const serverBossGuilds = bossGuilds || [];

    // Fetch boss_assists for this server's bosses
    const bossIds = [...new Set((bosses || []).map((b: any) => b.id))];
    const bossAssists = bossIds.length > 0
      ? await supabaseQuerySafe(`boss_assists?select=boss_id,owner_guild_id,assistant_guild_id&boss_id=in.%28${bossIds.join("%2C")}%29&limit=10000`)
      : [];
    const serverBossAssists = bossAssists || [];

    // Resolve assist guild names (may include guilds not in this server's guilds table)
    const assistGuildIdsAll = [...new Set(serverBossAssists.map((a: any) => a.assistant_guild_id))];
    const ownerGuildIdsAll = [...new Set(serverBossAssists.map((a: any) => a.owner_guild_id))];
    const allAssistRelatedIds = [...new Set([...assistGuildIdsAll, ...ownerGuildIdsAll])];
    const guildIdToName = new Map((guilds || []).map((g: any) => [g.id, g.name]));
    if (allAssistRelatedIds.length > 0) {
      const assistGuildRows = await supabaseQuerySafe(
        `guilds?select=id,name&id=in.(${allAssistRelatedIds.join(",")})`
      );
      for (const g of (assistGuildRows || [])) {
        if (!guildIdToName.has(g.id)) guildIdToName.set(g.id, g.name);
      }
      // DEBUG: server-level assist summary
      // const resolvedCount = assistGuildRows?.length ?? 0;
      // const unresolvedCount = allAssistRelatedIds.length - resolvedCount;
      // console.log(`[cron] server=${serverId} boss_assists_rows=${serverBossAssists.length} assist_guild_ids=${assistGuildIdsAll.length} owner_guild_ids=${ownerGuildIdsAll.length} resolved=${resolvedCount} unresolved=${unresolvedCount}`);
    }
    const overrideMap = new Map((overrides || []).map((o: any) => [o.boss_id, o.death_time]));

    if (!bosses?.length) continue;

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

        const tcfg = serverThreadMap.get(serverId) || [];

        // Collect all guilds that will get threads: computed owner + boss_assists (owner + assistant)
        const threadGuilds = new Set<string>();
        if (guildName) threadGuilds.add(guildName);

        const bossAssistRows = serverBossAssists.filter((a: any) => a.boss_id === boss.id);
        const assistGuildIds = bossAssistRows.map((a: any) => a.assistant_guild_id);
        const assistOwnerIds = bossAssistRows.map((a: any) => a.owner_guild_id);

        const assistNames: string[] = [];
        const assistUnresolved: string[] = [];

        // Add owner_guild_id from boss_assists
        for (const oid of assistOwnerIds) {
          const oName = guildIdToName.get(oid);
          if (oName && oName !== guildName) {
            threadGuilds.add(oName);
            assistNames.push(oName);
          }
        }
        // Add assistant_guild_id from boss_assists
        for (const agid of assistGuildIds) {
          const agName = guildIdToName.get(agid);
          if (agName) {
            if (agName !== guildName && !threadGuilds.has(agName)) {
              threadGuilds.add(agName);
              assistNames.push(agName);
            }
          } else {
            assistUnresolved.push(agid);
          }
        }
        // DEBUG: per-boss assist details
        // if (assistGuildIds.length > 0) {
        //   const resolved = assistGuildIds.map((id: string) => guildIdToName.get(id) || "?");
        //   const ownerIds = serverBossAssists
        //     .filter((a: any) => a.boss_id === boss.id)
        //     .map((a: any) => a.owner_guild_id);
        //   const ownerNames = ownerIds.map((id: string) => guildIdToName.get(id) || "?");
        //   console.log(`[cron] ${boss.name} assist_owner=[${ownerNames.join(",")}] assist_assistant=[${resolved.join(",")}] computed_owner=${guildName || "none"}`);
        // }
        if (assistUnresolved.length > 0) {
          console.log(`[cron] ${boss.name} assist_unresolved_ids=[${assistUnresolved.join(",")}]`);
        }

        if (threadGuilds.size > 0) {
          // Only include Discord IDs where at least one thread guild is in the whitelist
          const matchingDiscordIds = tcfg
            .filter((t: any) => {
              if (!t.threadGuilds.length) return false;
              const whitelistNames = t.threadGuilds.map((gid: string) => guildIdToName.get(gid) || gid);
              return [...threadGuilds].some((tg: string) =>
                whitelistNames.some((n: string) => n.toLowerCase() === tg.toLowerCase())
              );
            })
            .map((t: any) => t.discordId);
          const discordIds = matchingDiscordIds.join(",") || null;
          if (discordIds) {
            const ownerPart = guildName || "none";
            const assistPart = assistNames.length > 0 ? ` assists=${assistNames.join(",")}` : "";
            // console.log(`[cron] ${boss.name} owner=${ownerPart}${assistPart} thread_discord_ids=${discordIds}`);
          }
        }

        // ── Spawn-time notification (just spawned) ──
        if (secsSinceSpawn >= 0 && secsSinceSpawn <= 60) {
          const spawnDedupKey = `${serverId}-${boss.id}-boss_spawned-${spawnUnix}`;
          if (!sentNotifs.has(spawnDedupKey)) {
            sentNotifs.set(spawnDedupKey, Date.now());
            const timeStr = spawnTime.toLocaleString("en-US", {
              timeZone: tz || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
            });
            const text = `🟢 **${boss.name}** has spawned -- **${guildName}** ${timeStr}`;
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
            const timeStr = spawnTime.toLocaleString("en-US", {
              timeZone: tz || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
            });
            const text = `⚠️ **${boss.name}** spawning in 5 min -- **${guildName}** ${timeStr}`;
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

          // ── 5-minute thread + notification for activities ──
          if (secsUntilStart > 0 && secsUntilStart <= 300) {
            const threadDedupKey = `${serverId}-thread-activity-${activity.id}-${startUnix}`;
            if (!sentNotifs.has(threadDedupKey)) {
              sentNotifs.set(threadDedupKey, Date.now());
              await createEventThreads(
                serverId, activity.name, undefined, startUnix, "activity", activity.id
              ).catch(console.error);
            }
          }

          // ── Spawn notification for activities ──
          const notifDedupKey = `${serverId}-notif-activity-${activity.id}-${startUnix}`;
          if (!sentNotifs.has(notifDedupKey)) {
            // 5-min warning
            if (secsUntilStart > 0 && secsUntilStart <= 300) {
              sentNotifs.set(notifDedupKey, Date.now());
              const timeStr = nextStart.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true });
              broadcastNotification(serverId, {},
                "", // No source channel — use notification_channel_id from configs
                `📋 **${activity.name}** starting at ${timeStr}`
              ).catch(() => {});
            }
            // Spawned now
            if (secsUntilStart <= 0 && secsUntilStart > -60) {
              sentNotifs.set(notifDedupKey, Date.now());
              broadcastNotification(serverId, {},
                "",
                `📋 **${activity.name}** is starting now!`
              ).catch(() => {});
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
