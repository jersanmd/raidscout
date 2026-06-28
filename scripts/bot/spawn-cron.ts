// Spawn cron -- 30s tick: bosses + activities, 5-min warnings + threads with party lists

declare const process: { env: Record<string, string | undefined>; cpuUsage: (prev?: { user: number; system: number }) => { user: number; system: number }; memoryUsage: () => { rss: number; heapUsed: number } };

import { TOKEN, SUPABASE_URL, SUPABASE_KEY } from "./config";
import { discordFetch } from "./discord-api";
import { supabaseQuery, supabaseQuerySafe, supabaseRpc, logError } from "./supabase";
import { resolveServerTimezone } from "./server-cache";
import { addHours, computeOwnerGuild, getScheduleTz, scheduleSlotToUTC, findNextScheduleSlot } from "./spawn-utils";
import { broadcastNotification } from "./notifications";
import { createEventThreads } from "./threads";

const sentNotifs = new Map<string, number>();

// ── Concurrency-limited promise runner (avoids Discord 50/sec rate limit) ──
async function batchRun(promises: Promise<void>[], concurrency = 10): Promise<void> {
  const queue = [...promises];
  async function worker() {
    while (queue.length > 0) {
      const p = queue.shift();
      if (p) await p;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
}

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

// Batch queue for dedup notifications — flushed at end of tick
let pendingDedupBatch: { event: string; serverId: string; targetId: string; spawnUnix: number }[] = [];

function queueDedupRecord(event: string, serverId: string, targetId: string, spawnUnix: number) {
  pendingDedupBatch.push({ event, serverId, targetId, spawnUnix });
}

async function flushDedupBatch() {
  if (!pendingDedupBatch.length) return;
  const batch = pendingDedupBatch.splice(0);
  // Fire-and-forget — single POST with JSON array
  // FK violations (deleted bosses) are harmless — the row is simply not inserted
  fetch(`${SUPABASE_URL}/rest/v1/spawn_notifications`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify(batch.map(r => ({
      server_id: r.serverId, boss_id: r.targetId,
      event: r.event, spawn_timestamp: r.spawnUnix,
    }))),
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
  sentNotifs.forEach((ts, key) => {
    if (ts < cutoff) sentNotifs.delete(key);
  });
}, 10 * 60_000);

let cronStarted = false;
let tickRunning = false; // Guard against overlapping ticks on slow machines
let lastTickTime = 0;
let lastServersChecked = 0;
let lastBossesChecked = 0;
let lastTickDurationMs = 0;
let lastTickIntervalMs = 30_000;
const recentTickDurations: number[] = []; // rolling buffer, last ~60 ticks (~30 min)
const MAX_TICK_HISTORY = 60;

// ── CPU tracking ──────────────────────────────────────────
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();
const cpuHistory: number[] = []; // rolling buffer, last 60 samples
let cpuPeak24h = 0;
let cpuPeakTime = 0;

function sampleCpu(): number {
  const now = Date.now();
  const elapsed = now - lastCpuTime;
  const usage = process.cpuUsage(lastCpuUsage); // delta since last call
  lastCpuUsage = process.cpuUsage(); // reset baseline
  lastCpuTime = now;
  // CPU % = (user + system) microseconds / (elapsed ms * 1000) * 100
  const pct = ((usage.user + usage.system) / (elapsed * 1000)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  cpuHistory.push(rounded);
  if (cpuHistory.length > MAX_TICK_HISTORY) cpuHistory.shift();
  if (rounded > cpuPeak24h) { cpuPeak24h = rounded; cpuPeakTime = now; }
  return rounded;
}

function getCpuStats() {
  const latest = cpuHistory.length > 0 ? cpuHistory[cpuHistory.length - 1] : 0;
  const last2 = cpuHistory.slice(-2);
  const avg1min = last2.length > 0 ? Math.round(last2.reduce((a, b) => a + b, 0) / last2.length * 10) / 10 : 0;
  return { latest, avg_1min: avg1min, peak_24h: cpuPeak24h };
}

export function getCronStats() {
  return {
    last_tick_seconds_ago: lastTickTime ? Math.floor((Date.now() - lastTickTime) / 1000) : null,
    last_tick_duration_ms: lastTickDurationMs,
    tick_interval_ms: lastTickIntervalMs,
    servers_checked: lastServersChecked,
    bosses_checked: lastBossesChecked,
    tick_history_ms: [...recentTickDurations],
    cpu: getCpuStats(),
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

  // Preload dedup cache from DB so restarts don't re-fire notifications
  preloadDedupFromDb().catch((err) => logError("cron", "preloadDedupFromDb failed", err));

  // Adaptive tick interval: scales proportionally to load.
  // interval = floor(avg / 30s) × 30s + 30s, minimum 30s.
  // Avg is computed from the rolling buffer of last ~60 tick durations.
  function getAdaptiveInterval(): number {
    if (recentTickDurations.length < 3) return 30_000;

    const sample = recentTickDurations.slice(-10);
    const avg = sample.reduce((a, b) => a + b, 0) / sample.length;
    const step = 30_000;
    const interval = Math.max(30_000, Math.floor(avg / step) * step + step);

    lastTickIntervalMs = interval;
    return interval;
  }

  async function scheduleTick() {
    if (tickRunning) {
      console.warn("[cron] Previous tick still running — skipping this tick");
    } else {
      tickRunning = true;
      sampleCpu();
      try {
        await runSpawnCron();
      } catch (err: any) {
        logError("cron", "Tick error", err);
      } finally {
        tickRunning = false;
      }
    }
    const next = getAdaptiveInterval();
    setTimeout(scheduleTick, next);
  }

  // First tick fires after a short delay, then adaptive
  setTimeout(scheduleTick, 5_000);
  console.log(`Spawn cron started (adaptive: 30s-120s based on load)`);
}

async function runSpawnCron() {
  const tickStart = Date.now();
  lastTickTime = tickStart;
  let serversChecked = 0;
  let bossesChecked = 0;

  try {

  const configs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id,discord_guild_id,notification_channel_id,notification_prefix,thread_channel_id,thread_guilds,command_channel_id&or=(notification_channel_id.not.is.null,thread_channel_id.not.is.null,command_channel_id.not.is.null)`
  );

  // Fetch active servers (exclude soft-deleted AND expired)
  const allServers = await supabaseQuerySafe(`servers?select=id,trial_ends_at,subscription_ends_at,notification_prefix,timezone&deleted_at=is.null`);
  const now = new Date();
  const serverInfoMap = new Map<string, any>();
  const activeServerIds = new Set((allServers || [])
    .filter((s: any) => {
      serverInfoMap.set(s.id, s);
      if (s.subscription_ends_at && new Date(s.subscription_ends_at) > now) return true;
      if (s.trial_ends_at && new Date(s.trial_ends_at) > now) return true;
      return false;
    })
    .map((s: any) => s.id)
  );

  if (!configs?.length) return;

  // Map: serverId → [{ discord_guild_id, thread_guilds }]
  const serverThreadMap = new Map<string, { discordId: string; threadGuilds: string[] }[]>();
  for (const tc of ((configs || []) as any[]).filter((c: any) => c.thread_channel_id)) {
    const sid = tc.raidscout_server_id;
    if (!serverThreadMap.has(sid)) serverThreadMap.set(sid, []);
    serverThreadMap.get(sid)!.push({ discordId: tc.discord_guild_id, threadGuilds: tc.thread_guilds || [] });
  }

  // Build per-server notification configs and thread configs for passing to functions
  const serverNotifConfigs = new Map<string, any[]>();
  const serverThreadConfigs = new Map<string, any[]>();
  for (const c of (configs as any[])) {
    const sid = c.raidscout_server_id;
    if (c.notification_channel_id) {
      if (!serverNotifConfigs.has(sid)) serverNotifConfigs.set(sid, []);
      serverNotifConfigs.get(sid)!.push(c);
    }
    if (c.thread_channel_id) {
      if (!serverThreadConfigs.has(sid)) serverThreadConfigs.set(sid, []);
      serverThreadConfigs.get(sid)!.push(c);
    }
  }

  // Deduplicate by server_id
  const serverIds = Array.from(new Set((configs as any[]).map((c: any) => c.raidscout_server_id)))
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

  const serverResults = await concurrentMap(serverIds, 8, async (serverId) => {
    let bossCount = 0;
    
    try {
    // ── Bulk RPC: single call replaces 7+ REST queries ──
    let snap: any;
    try {
      snap = await supabaseRpc("bot_server_snapshot", { p_server_id: serverId });
    } catch (err) {
      // Retry once before falling back to REST
      try {
        snap = await supabaseRpc("bot_server_snapshot", { p_server_id: serverId });
      } catch (err2) {
        logError("cron", "RPC failed after retry, falling back to REST", null, { serverId });
        snap = null;
      }
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

    // Collect async notification/thread promises to fire concurrently
    const notifPromises: Promise<void>[] = [];
    const serverPrefix = serverInfoMap.get(serverId)?.notification_prefix || "";
    const notifConfigs = serverNotifConfigs.get(serverId);

    for (const boss of bosses) {
      try {
        bossCount++;
        // Deaths are pre-filtered: 1 row per boss (latest death, no initial_spawn)
        const lastDeath = (deaths || []).find((d: any) => d.boss_id === boss.id) ?? null;
        const overrideDeathTime = overrideMap.get(boss.id);
        const effectiveDeathTime = overrideDeathTime ?? lastDeath?.death_time ?? null;

        let spawnTime: Date;
        if (boss.spawn_type === "fixed_hours") {
          if (!effectiveDeathTime) continue;
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
            spawnTime = findNextScheduleSlot(boss.schedule, now, schedTz);
          } else {
            continue;
          }
        } else {
          continue;
        }

        const spawnUnix = Math.floor(spawnTime.getTime() / 1000);
        const nowUnix = Math.floor(Date.now() / 1000);
        const secsSinceSpawn = nowUnix - spawnUnix;
        const secsUntilSpawn = spawnUnix - nowUnix;

        const guildName = computeOwnerGuild(boss, serverBossGuilds, (guilds || []), lastDeath, spawnTime, tz) || "";

        // ── Spawn-time notification (just spawned) ──
        if (secsSinceSpawn >= 0 && secsSinceSpawn <= 60) {
          const spawnDedupKey = `${serverId}-${boss.id}-boss_spawned-${spawnUnix}`;
          if (!sentNotifs.has(spawnDedupKey)) {
            sentNotifs.set(spawnDedupKey, Date.now());
            queueDedupRecord("boss_spawned", serverId, boss.id, spawnUnix);
            const timeStr = spawnTime.toLocaleString("en-US", { timeZone: tz || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
            const text = `🟢 **${boss.name}** has spawned -- **${guildName}** ${timeStr}`;
            notifPromises.push(
              broadcastNotification(serverId, {}, "", text, { configs: notifConfigs, serverPrefix }).catch((err) => logError("cron", "broadcastNotification failed", err, { serverId, boss: boss.name }))
            );
          }
          continue;
        }

        if (secsUntilSpawn <= 0) continue;

        // ── 5-minute warning + thread ──
        if (secsUntilSpawn > 0 && secsUntilSpawn <= 300) {
          const dedupKey = `${serverId}-${boss.id}-5min-${spawnUnix}`;
          if (!sentNotifs.has(dedupKey)) {
            sentNotifs.set(dedupKey, Date.now());
            queueDedupRecord("boss_spawning", serverId, boss.id, spawnUnix);
            const timeStr = spawnTime.toLocaleString("en-US", { timeZone: tz || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
            const text = `⚠️ **${boss.name}** spawning in 5 min -- **${guildName}** ${timeStr}`;
            notifPromises.push(
              broadcastNotification(serverId, {}, "", text, { configs: notifConfigs, serverPrefix }).catch((err) => logError("cron", "broadcastNotification failed", err, { serverId, boss: boss.name }))
            );
          }

          const threadDedupKey = `${serverId}-thread-${boss.id}-${spawnUnix}`;
          if (!sentNotifs.has(threadDedupKey)) {
            sentNotifs.set(threadDedupKey, Date.now());
            queueDedupRecord("boss_thread", serverId, boss.id, spawnUnix);
            const preFetchedThread = {
              configs: serverThreadConfigs.get(serverId),
              guildIdToName,
              tz,
              bossAssistRows: (serverBossAssists || []).filter((a: any) => a.boss_id === boss.id),
            };
            notifPromises.push(
              createEventThreads(serverId, boss.name, guildName, spawnUnix, "boss", boss.id, preFetchedThread)
                .catch((err) => logError("cron", "createEventThreads failed", err, { serverId, boss: boss.name }))
            );
          }
        }
      } catch (bossErr: any) {
        logError("cron", "Error processing boss", bossErr, { serverId, bossId: boss.id, bossName: boss.name });
      }
    }

    // ── Fire all boss notifications/threads concurrently ──
    if (notifPromises.length > 0) await batchRun(notifPromises, 10);

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
              queueDedupRecord("activity_thread", serverId, activity.id, startUnix);
              const preFetchedAct = { configs: serverThreadConfigs.get(serverId), guildIdToName, tz };
              if (actGuildNames.length > 0) {
                for (const gn of actGuildNames) {
                  notifPromises.push(
                    createEventThreads(serverId, activity.name, gn, startUnix, "activity", activity.id, preFetchedAct)
                      .catch((err) => logError("cron", "createEventThreads failed", err, { serverId, activity: activity.name, guild: gn }))
                  );
                }
              } else {
                notifPromises.push(
                  createEventThreads(serverId, activity.name, undefined, startUnix, "activity", activity.id, preFetchedAct)
                    .catch((err) => logError("cron", "createEventThreads failed", err, { serverId, activity: activity.name }))
                );
              }
            }
          }

          // ── 5-min warning notification ──
          if (secsUntilStart > 0 && secsUntilStart <= 300) {
            const warnDedupKey = `${serverId}-act-5min-${activity.id}-${startUnix}`;
            if (!sentNotifs.has(warnDedupKey)) {
              sentNotifs.set(warnDedupKey, Date.now());
              queueDedupRecord("activity_spawning", serverId, activity.id, startUnix);
              const displayTz = activity.schedule_tz || tz;
              const timeStr = nextStart.toLocaleTimeString("en-US", { timeZone: displayTz, hour: "2-digit", minute: "2-digit", hour12: true });
              notifPromises.push(
                broadcastNotification(serverId, {}, "", `📋 **${activity.name}** starting in 5 min${guildTag} — ${timeStr}`, { configs: notifConfigs, serverPrefix }).catch(() => {})
              );
            }
          }

          // ── Starting now notification ──
          if (secsUntilStart <= 0 && secsUntilStart > -60) {
            const startDedupKey = `${serverId}-act-started-${activity.id}-${startUnix}`;
            if (!sentNotifs.has(startDedupKey)) {
              sentNotifs.set(startDedupKey, Date.now());
              queueDedupRecord("activity_started", serverId, activity.id, startUnix);
              notifPromises.push(
                broadcastNotification(serverId, {}, "", `📋 **${activity.name}** is starting now!${guildTag}`, { configs: notifConfigs, serverPrefix }).catch(() => {})
              );
            }
          }
        } catch (actErr: any) {
          logError("cron", "Error processing activity", actErr, { serverId, activityId: activity.id, activityName: activity.name });
        }
      }
    }

    // Fire activity notifications/threads (collected after boss batchRun above)
    if (notifPromises.length > 0) await batchRun(notifPromises, 10);

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

    // Persist tick metrics + flush dedup batch to DB
    flushDedupBatch().catch(() => {});
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
