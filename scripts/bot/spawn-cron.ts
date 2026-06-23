// @ts-nocheck
// Spawn cron -- 30s tick: bosses + activities, 5-min warnings + threads with party lists

import { TOKEN, SUPABASE_URL, SUPABASE_KEY } from "./config";
import { discordFetch } from "./discord-api";
import { supabaseQuery, supabaseQuerySafe, supabaseRpc, logError } from "./supabase";
import { resolveServerTimezone } from "./server-cache";
import { addHours, computeOwnerGuild, getScheduleTz, scheduleSlotToUTC, findNextScheduleSlot } from "./spawn-utils";
import { broadcastNotification } from "./notifications";
import { createEventThreads } from "./threads";

const sentNotifs = new Map<string, number>();

// ── Persist dedup state so restarts don't re-fire notifications ──
export function buildDedupKey(event: string, sid: string, tid: string, ts: number): string | null {
  switch (event) {
    case "boss_spawned":   return `${sid}-${tid}-boss_spawned-${ts}`;
    case "boss_spawning":  return `${sid}-${tid}-5min-${ts}`;
    case "boss_thread":    return `${sid}-thread-${tid}-${ts}`;
    case "activity_spawning": return `${sid}-act-5min-${tid}-${ts}`;
    case "activity_started":  return `${sid}-act-started-${tid}-${ts}`;
    case "activity_thread":   return `${sid}-thread-activity-${tid}-${ts}`;
    default: return null;
  }
}

async function recordNotification(event: string, serverId: string, targetId: string, spawnUnix: number) {
  await fetch(`${SUPABASE_URL}/rest/v1/spawn_notifications`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      server_id: serverId, boss_id: targetId,
      event, spawn_timestamp: spawnUnix, notified_via: "discord",
    }),
  }).catch(() => {});
}

async function preloadDedupFromDb() {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 2 * 3600; // last 2 hours
    const rows = await supabaseQuerySafe<any>(
      `spawn_notifications?spawn_timestamp=gte.${cutoff}&order=spawn_timestamp.desc&limit=500`
    );
    if (!rows?.length) return;
    let loaded = 0;
    for (const r of rows) {
      const key = buildDedupKey(r.event, r.server_id, r.boss_id, r.spawn_timestamp);
      if (!key) continue;
      if (!sentNotifs.has(key)) { sentNotifs.set(key, Date.now()); loaded++; }
    }
    console.log(`[cron] Preloaded ${loaded} dedup entries from DB`);
  } catch (err: any) {
    logError("cron", "preloadDedupFromDb failed", err);
  }
}

// Clean up stale dedup entries every 10 minutes (keep 2 hours worth)
setInterval(() => {
  const cutoff = Date.now() - 2 * 3600_000;
  for (const [key, ts] of sentNotifs) {
    if (ts < cutoff) sentNotifs.delete(key);
  }
}, 10 * 60_000);

let cronStarted = false;
let tickRunning = false; // Guard against overlapping ticks on slow machines
let lastTickTime = 0;
let lastServersChecked = 0;
let lastBossesChecked = 0;
let lastTickDurationMs = 0;
const recentTickDurations: number[] = []; // rolling buffer, last ~60 ticks (~30 min)
const MAX_TICK_HISTORY = 60;

export function getCronStats() {
  return {
    last_tick_seconds_ago: lastTickTime ? Math.floor((Date.now() - lastTickTime) / 1000) : null,
    last_tick_duration_ms: lastTickDurationMs,
    servers_checked: lastServersChecked,
    bosses_checked: lastBossesChecked,
    tick_history_ms: [...recentTickDurations],
  };
}

// Process items in parallel with a concurrency cap to avoid overwhelming the DB pool
async function concurrentMap<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export function startSpawnCron() {
  if (cronStarted) return;
  cronStarted = true;

  // Staging runs at 60s to reduce Supabase load; production at 30s
  const isStaging = process.env.FLY_APP_NAME === "raidscout-staging";
  const TICK_MS = isStaging ? 60_000 : 30_000;

  // Preload dedup cache from DB so restarts don't re-fire notifications
  // Fire-and-forget is fine — first tick is 30s away and preload takes <1s
  preloadDedupFromDb().catch((err) => logError("cron", "preloadDedupFromDb failed", err));

  setInterval(async () => {
    if (tickRunning) {
      console.warn("[cron] Previous tick still running — skipping this tick");
      return;
    }
    tickRunning = true;
    try {
      await runSpawnCron();
    } catch (err: any) {
      logError("cron", "Tick error", err);
    } finally {
      tickRunning = false;
    }
  }, TICK_MS);

  console.log(`Spawn cron started (${TICK_MS / 1000}s tick)`);
}

async function runSpawnCron() {
  const tickStart = Date.now();
  lastTickTime = tickStart;
  let serversChecked = 0;
  let bossesChecked = 0;

  try {

  const configs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id,discord_guild_id,notification_channel_id&notification_channel_id=not.is.null`
  );

  // Fetch active servers (exclude soft-deleted AND expired)
  const allServers = await supabaseQuerySafe(`servers?select=id,trial_ends_at,subscription_ends_at&deleted_at=is.null`);
  const now = new Date();
  const activeServerIds = new Set((allServers || [])
    .filter((s: any) => {
      // Active subscription overrides trial
      if (s.subscription_ends_at && new Date(s.subscription_ends_at) > now) return true;
      // Active trial
      if (s.trial_ends_at && new Date(s.trial_ends_at) > now) return true;
      // Both expired or neither set
      return false;
    })
    .map((s: any) => s.id)
  );

  // Fetch thread configs for logging (which Discord servers have auto-threads enabled)
  const threadConfigs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id,discord_guild_id,thread_channel_id,thread_guilds&thread_channel_id=not.is.null`
  );
  // Fetch command channel configs (servers with !cmdhere set)
  const cmdConfigs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id&command_channel_id=not.is.null`
  );

  if (!configs?.length && !threadConfigs?.length && !cmdConfigs?.length) return;

  // Map: serverId → [{ discord_guild_id, thread_guilds }]
  const serverThreadMap = new Map<string, { discordId: string; threadGuilds: string[] }[]>();
  for (const tc of (threadConfigs || [])) {
    const sid = tc.raidscout_server_id;
    if (!serverThreadMap.has(sid)) serverThreadMap.set(sid, []);
    serverThreadMap.get(sid)!.push({ discordId: tc.discord_guild_id, threadGuilds: tc.thread_guilds || [] });
  }

  // Deduplicate by server_id — include notification, thread, and command configs, exclude soft-deleted
  const allConfigServerIds = [
    ...configs.map((c: any) => c.raidscout_server_id),
    ...(threadConfigs || []).map((c: any) => c.raidscout_server_id),
    ...(cmdConfigs || []).map((c: any) => c.raidscout_server_id),
  ];
  const serverIds = [...new Set(allConfigServerIds)]
    .filter((id: string) => activeServerIds.has(id));

  // Count only servers being processed (notification + thread + command channels)
  serversChecked = serverIds.length;

  // ── Auto-resolve expired DKP auctions ──────────────────
  supabaseQuerySafe<any>(
    `dkp_auctions?select=id,item_id&status=eq.active&bid_end_time=lte.${new Date().toISOString()}&limit=50`
  ).then(rows => {
    if (rows?.length) {
      for (const auction of rows) {
        supabaseRpc("auto_resolve_auction", { p_item_id: auction.item_id }).catch(() => {});
      }
    }
  }).catch(() => {});

  const serverResults = await concurrentMap(serverIds, 5, async (serverId) => {
    let bossCount = 0;
    
    try {
    // ── Bulk RPC: single call replaces 7+ REST queries ──
    let snap: any;
    try {
      snap = await supabaseRpc("bot_server_snapshot", { p_server_id: serverId });
    } catch (err) {
      logError("cron", "RPC failed, falling back to REST", null, { serverId });
      snap = null;
    }

    if (!snap) {
      // Fallback: build same shape from individual REST calls
      const tz = await resolveServerTimezone(serverId).catch(() => "Asia/Manila");
      const [bosses, deaths, guilds, overrides, bossGuilds, bossAssists, activities, activityGuilds] = await Promise.all([
        supabaseQuerySafe(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null`),
        supabaseQuerySafe(`death_records?server_id=eq.${serverId}&is_initial_spawn=is.false&order=death_time.desc&limit=300`),
        supabaseQuerySafe(`guilds?server_id=eq.${serverId}`),
        supabaseQuerySafe(`boss_spawn_overrides?server_id=eq.${serverId}&select=boss_id,death_time`),
        supabaseQuerySafe(`boss_guilds?server_id=eq.${serverId}`),
        supabaseQuerySafe(`boss_assists?server_id=eq.${serverId}`),
        supabaseQuerySafe(`activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null`),
        supabaseQuerySafe(`activity_guilds?select=activity_id,guild_id,sort_order&guild_id=not.is.null`),
      ]);
      snap = { timezone: tz, bosses, deaths, guilds, overrides, boss_guilds: bossGuilds, boss_assists: bossAssists, activities, activity_guilds: activityGuilds };
    }

    const tz = snap.timezone || "Asia/Manila";
    const bosses = snap.bosses || [];
    const deaths = snap.deaths || [];
    const guilds = snap.guilds || [];
    const overrides = snap.overrides || [];
    const serverBossGuilds = snap.boss_guilds || [];
    const serverBossAssists = snap.boss_assists || [];
    const serverActivityGuilds = snap.activity_guilds || [];

    // Build guildIdToName map
    const guildIdToName = new Map<string, string>((guilds || []).map((g: any) => [String(g.id), String(g.name)]));
    const overrideMap = new Map((overrides || []).map((o: any) => [o.boss_id, o.death_time]));

    if (!bosses?.length) return bossCount;

    for (const boss of bosses) {
      try {
        bossCount++;
        // Deaths are pre-filtered: 1 row per boss (latest death, no initial_spawn)
        const lastDeath = (deaths || []).find((d: any) => d.boss_id === boss.id) ?? null;
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
            recordNotification("boss_spawned", serverId, boss.id, spawnUnix);
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
            recordNotification("boss_spawning", serverId, boss.id, spawnUnix);
            const timeStr = spawnTime.toLocaleString("en-US", {
              timeZone: tz || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
            });
            const text = `⚠️ **${boss.name}** spawning in 5 min -- **${guildName}** ${timeStr}`;
            await broadcastNotification(serverId, {}, "", text);
          }

          // Auto-thread with party list (independent of notification dedup)
          const threadDedupKey = `${serverId}-thread-${boss.id}-${spawnUnix}`;
          if (!sentNotifs.has(threadDedupKey)) {
            sentNotifs.set(threadDedupKey, Date.now());
            recordNotification("boss_thread", serverId, boss.id, spawnUnix);
            await createEventThreads(serverId, boss.name, guildName, spawnUnix, "boss", boss.id).catch((err) => logError("cron", "createEventThreads failed", err, { serverId, boss: boss.name }));
          }
        }
      } catch (bossErr: any) {
        logError("cron", "Error processing boss", bossErr, { serverId, bossId: boss.id, bossName: boss.name });
      }
    }

    // ── Activities (from RPC snapshot) ──────────────────────
    const activities = snap?.activities ?? await supabaseQuerySafe(
      `activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null`
    );
    if (activities?.length) {
      const nowAct = new Date();
      for (const activity of activities) {
        try {
          let nextStart: Date | null = null;

          if (activity.schedule_type === "one_time" && activity.start_time) {
            nextStart = new Date(activity.start_time);
          } else if (activity.schedule_type === "fixed_schedule" && activity.schedule) {
            // Weekly recurring: find next slot from schedule array.
            // Schedule times are stored in UTC — always convert from UTC.
            for (let d = 0; d <= 7; d++) {
              const check = new Date(nowAct);
              check.setDate(check.getDate() + d);
              for (const slot of activity.schedule) {
                const c = scheduleSlotToUTC("UTC", check, slot.day, slot.time);
                if (c > nowAct && (!nextStart || c < nextStart)) {
                  nextStart = c;
                }
              }
            }
          } else if (activity.schedule_type === "fixed_hours" && activity.schedule) {
            // Daily recurring at a fixed time. Schedule times are stored in UTC.
            const raw = activity.schedule;
            const schedObj = (typeof raw === "object" && raw !== null && !Array.isArray(raw) && "time" in raw)
              ? (raw as { time: string })
              : null;
            const timeStr: string | null = schedObj ? schedObj.time : (typeof raw === "string" ? raw : null);
            if (timeStr) {
              const [h, m] = timeStr.split(":").map(Number);
              if (!isNaN(h) && !isNaN(m)) {
                const today = new Date(nowAct);
                today.setUTCHours(h, m, 0, 0);
                if (today > nowAct) {
                  nextStart = today;
                } else {
                  nextStart = new Date(today.getTime() + 24 * 60 * 60_000);
                }
              }
            }
          }

          if (!nextStart || nextStart <= nowAct) continue;

          const startUnix = Math.floor(nextStart.getTime() / 1000);
          const nowUnix = Math.floor(Date.now() / 1000);
          const secsUntilStart = startUnix - nowUnix;

          // Resolve guild names for this activity
          const actGuildRows = serverActivityGuilds.filter((ag: any) => ag.activity_id === activity.id)
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          const actGuildNames = actGuildRows
            .map((ag: any) => guildIdToName.get(ag.guild_id))
            .filter(Boolean) as string[];
          const guildTag = actGuildNames.length > 0
            ? " — **" + actGuildNames.join("** · **") + "**"
            : "";

          // ── 5-minute thread + notification for activities ──
          if (secsUntilStart > 0 && secsUntilStart <= 300) {
            const threadDedupKey = `${serverId}-thread-activity-${activity.id}-${startUnix}`;
            if (!sentNotifs.has(threadDedupKey)) {
              sentNotifs.set(threadDedupKey, Date.now());
              recordNotification("activity_thread", serverId, activity.id, startUnix);
              // Create a thread for EACH guild assigned to this activity
              if (actGuildNames.length > 0) {
                for (const gn of actGuildNames) {
                  await createEventThreads(
                    serverId, activity.name, gn, startUnix, "activity", activity.id
                  ).catch((err) => logError("cron", "createEventThreads failed", err, { serverId, activity: activity.name, guild: gn }));
                }
              } else {
                await createEventThreads(
                  serverId, activity.name, undefined, startUnix, "activity", activity.id
                ).catch((err) => logError("cron", "createEventThreads failed", err, { serverId, activity: activity.name }));
              }
            }
          }

          // ── 5-min warning notification (separate dedup from "starting now") ──
          if (secsUntilStart > 0 && secsUntilStart <= 300) {
            const warnDedupKey = `${serverId}-act-5min-${activity.id}-${startUnix}`;
            if (!sentNotifs.has(warnDedupKey)) {
              sentNotifs.set(warnDedupKey, Date.now());
              recordNotification("activity_spawning", serverId, activity.id, startUnix);
              const displayTz = activity.schedule_tz || tz;
              const timeStr = nextStart.toLocaleTimeString("en-US", { timeZone: displayTz, hour: "2-digit", minute: "2-digit", hour12: true });
              broadcastNotification(serverId, {},
                "",
                `📋 **${activity.name}** starting in 5 min${guildTag} — ${timeStr}`
              ).catch(() => {});
            }
          }

          // ── Starting now notification ──
          if (secsUntilStart <= 0 && secsUntilStart > -60) {
            const startDedupKey = `${serverId}-act-started-${activity.id}-${startUnix}`;
            if (!sentNotifs.has(startDedupKey)) {
              sentNotifs.set(startDedupKey, Date.now());
              recordNotification("activity_started", serverId, activity.id, startUnix);
              broadcastNotification(serverId, {},
                "",
                `📋 **${activity.name}** is starting now!${guildTag}`
              ).catch(() => {});
            }
          }
        } catch (actErr: any) {
          logError("cron", "Error processing activity", actErr, { serverId, activityId: activity.id, activityName: activity.name });
        }
      }
    }
    } catch (serverErr: any) {
      logError("cron", "Server processing failed", serverErr, { serverId });
    }
    return bossCount;
  });
  lastServersChecked = serversChecked;
  lastBossesChecked = serverResults.reduce((sum, c) => sum + c, 0);
  } finally {
    lastTickDurationMs = Date.now() - tickStart;
    recentTickDurations.push(lastTickDurationMs);
    if (recentTickDurations.length > MAX_TICK_HISTORY) recentTickDurations.shift();

    // Persist tick metrics to DB for historical analysis
    fetch(`${SUPABASE_URL}/rest/v1/tick_metrics`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        duration_ms: lastTickDurationMs,
        servers_checked: lastServersChecked,
        bosses_checked: lastBossesChecked,
      }),
    }).catch(() => {});
  }
}
