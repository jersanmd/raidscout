var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/bot/spawn-cron.ts
var spawn_cron_exports = {};
__export(spawn_cron_exports, {
  getCronStats: () => getCronStats,
  startSpawnCron: () => startSpawnCron
});
module.exports = __toCommonJS(spawn_cron_exports);

// scripts/bot/config.ts
var TOKEN = process.env.DISCORD_BOT_TOKEN;
var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!TOKEN) {
  console.error("Set DISCORD_BOT_TOKEN");
  process.exit(1);
}
if (!SUPABASE_URL) {
  console.error("Set SUPABASE_URL");
  process.exit(1);
}
if (!SUPABASE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// scripts/bot/supabase.ts
async function supabaseQuery(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) {
    console.error(`Supabase query failed: ${url} -- ${res.status}`);
    throw new Error(`Database query failed (${res.status})`);
  }
  return res.json();
}
async function supabaseQuerySafe(path) {
  try {
    return await supabaseQuery(path);
  } catch {
    return [];
  }
}

// scripts/bot/server-cache.ts
var PREFIX_CACHE_TTL = 5 * 6e4;
async function resolveServerTimezone(serverId) {
  const rows = await supabaseQuerySafe(`servers?select=timezone&id=eq.${serverId}`);
  return rows?.[0]?.timezone || "UTC";
}

// scripts/bot/spawn-utils.ts
function safeMod(v, n) {
  return (v % n + n) % n;
}
function computeOwnerGuild(boss, bossGuilds, guilds, lastDeath, spawn, tz) {
  const bgs = bossGuilds.filter((bg) => bg.boss_id === boss.id && bg.sort_order !== -1);
  if (bgs.length === 0) return void 0;
  const scheduleEntries = bgs.filter((bg) => bg.day_of_week !== null);
  if (scheduleEntries.length > 0) {
    const dow = spawn.getDay();
    const match = scheduleEntries.find((bg) => bg.day_of_week === dow);
    if (match) return guilds.find((g) => g.id === match.guild_id)?.name;
  }
  const dailyEntries = bgs.filter((bg) => bg.mode === "daily").sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (dailyEntries.length > 0) {
    if (!lastDeath || lastDeath.is_initial_spawn) {
      return guilds.find((g) => g.id === dailyEntries[0].guild_id)?.name;
    }
    const respawnHours = boss.respawn_hours ?? 0;
    const deathDate = new Date(lastDeath.death_time);
    const spawnDate = new Date(deathDate.getTime() + respawnHours * 36e5);
    const lastGuildId = lastDeath.owner_guild_id;
    const sameDay = deathDate.toLocaleDateString("en-CA", { timeZone: tz }) === spawnDate.toLocaleDateString("en-CA", { timeZone: tz });
    if (sameDay) {
      return lastGuildId ? guilds.find((g) => g.id === lastGuildId)?.name : guilds.find((g) => g.id === dailyEntries[0].guild_id)?.name;
    }
    if (!lastGuildId) {
      const idx = safeMod(1, dailyEntries.length);
      return guilds.find((g) => g.id === dailyEntries[idx].guild_id)?.name;
    }
    const lastIdx = dailyEntries.findIndex((bg) => bg.guild_id === lastGuildId);
    const nextIdx = safeMod(lastIdx >= 0 ? lastIdx + 1 : 0, dailyEntries.length);
    return guilds.find((g) => g.id === dailyEntries[nextIdx].guild_id)?.name;
  }
  const rotationEntries = bgs.filter((bg) => bg.sort_order !== null && bg.sort_order > 0 && bg.mode !== "daily" && bg.day_of_week === null).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (rotationEntries.length > 0) {
    const counter = boss.rotation_counter ?? 1;
    const idx = safeMod(counter - 1, rotationEntries.length);
    return guilds.find((g) => g.id === rotationEntries[idx].guild_id)?.name;
  }
  return void 0;
}
function getScheduleTz(boss, serverTz) {
  return boss.template_id ? "UTC" : serverTz;
}
function scheduleSlotToUTC(tz, refDate, day, time) {
  const localDateStr = refDate.toLocaleDateString("en-CA", { timeZone: tz });
  const [y, mo, d] = localDateStr.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);
  const refDay = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  let dayDiff = day - refDay;
  if (dayDiff < -3) dayDiff += 7;
  if (dayDiff > 3) dayDiff -= 7;
  const targetLocal = new Date(Date.UTC(y, mo - 1, d + dayDiff, h, m));
  const utcStr = targetLocal.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit" });
  const tzStr = targetLocal.toLocaleTimeString("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" });
  const [utcH, utcM] = utcStr.split(":").map(Number);
  const [tzH, tzM] = tzStr.split(":").map(Number);
  const offsetMin = tzH * 60 + tzM - (utcH * 60 + utcM);
  const adjustedOffset = offsetMin > 720 ? offsetMin - 1440 : offsetMin < -720 ? offsetMin + 1440 : offsetMin;
  return new Date(targetLocal.getTime() - adjustedOffset * 6e4);
}
function findNextScheduleSlot(schedule, after, tz) {
  let earliest = null;
  const now = /* @__PURE__ */ new Date();
  for (let d = 0; d <= 7; d++) {
    const check = new Date(now);
    check.setDate(check.getDate() + d);
    for (const slot of schedule) {
      const c = scheduleSlotToUTC(tz, check, slot.day, slot.time);
      if (c > after && (!earliest || c < earliest)) earliest = c;
    }
  }
  return earliest ?? after;
}

// scripts/bot/discord-api.ts
async function discordFetch(url, options = {}, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok || res.status === 404) return res;
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After") || res.headers.get("X-RateLimit-Reset-After");
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1e3 : (attempt + 1) * 2e3;
      console.warn(`Discord 429 -- waiting ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1e3));
      continue;
    }
    return res;
  }
  throw new Error(`Discord API failed after ${retries} retries: ${url}`);
}

// scripts/bot/notifications.ts
var sentNotifs = /* @__PURE__ */ new Map();
setInterval(() => {
  const cutoff = Date.now() - 6e4;
  for (const [key, ts] of sentNotifs) {
    if (ts < cutoff) sentNotifs.delete(key);
  }
}, 5 * 6e4);
var guildRoleCache = /* @__PURE__ */ new Map();
async function resolveRoles(guildId) {
  if (guildRoleCache.has(guildId)) return guildRoleCache.get(guildId);
  const map = /* @__PURE__ */ new Map();
  try {
    const res = await discordFetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${TOKEN}` }
    });
    if (res.ok) {
      const roles = await res.json();
      for (const role of roles) {
        map.set(role.name.toLowerCase(), role.id);
      }
    }
  } catch {
  }
  guildRoleCache.set(guildId, map);
  setTimeout(() => guildRoleCache.delete(guildId), 30 * 6e4);
  return map;
}
function resolvePrefix(prefix, roleMap) {
  return prefix.replace(/@(\S+)/g, (_, name) => {
    const id = roleMap.get(name.toLowerCase());
    return id ? `<@&${id}>` : `@${name}`;
  });
}
async function broadcastNotification(serverId, _config, _sourceChannelId, message) {
  try {
    const configs = await supabaseQuerySafe(
      `discord_configs?raidscout_server_id=eq.${serverId}&select=notification_channel_id,discord_guild_id,notification_prefix`
    );
    if (!configs?.length) return;
    const rawPrefix = await supabaseQuerySafe(
      `servers?select=notification_prefix&id=eq.${serverId}`
    ).then((rows) => rows?.[0]?.notification_prefix || "").catch(() => "");
    for (const cfg of configs) {
      const chId = cfg.notification_channel_id;
      if (!chId) continue;
      let prefix = cfg.notification_prefix || rawPrefix;
      if (prefix && cfg.discord_guild_id) {
        const roleMap = await resolveRoles(cfg.discord_guild_id);
        prefix = resolvePrefix(prefix, roleMap);
      }
      const content = prefix ? `${prefix} ${message}` : message;
      await discordFetch(`https://discord.com/api/v10/channels/${chId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content, allowed_mentions: { parse: ["everyone", "roles"] } })
      });
    }
  } catch (err) {
    console.error("[notif] broadcastNotification failed:", err.message);
  }
}

// scripts/bot/party-utils.ts
async function fetchPartyList(serverId, targetId, ownerType) {
  const idCol = ownerType === "boss" ? "boss_id" : "activity_id";
  const partyRows = await supabaseQuerySafe(
    `static_parties?server_id=eq.${serverId}&${idCol}=eq.${targetId}&select=id,name,guild_id`
  );
  if (!partyRows?.length) return [];
  const partyIds = partyRows.map((p) => `'${p.id}'`).join(",");
  const memberRows = await supabaseQuerySafe(
    `static_party_members?party_id=in.(${partyIds})&select=party_id,member_id`
  );
  const memberIds = [...new Set(memberRows.map((m) => m.member_id))];
  let memberMap = /* @__PURE__ */ new Map();
  let memberGuildMap = /* @__PURE__ */ new Map();
  if (memberIds.length > 0) {
    const members = await supabaseQuerySafe(
      `members?server_id=eq.${serverId}&select=id,name,guild_id&id=in.(${memberIds.map((id) => `'${id}'`).join(",")})`
    );
    memberMap = new Map((members || []).map((m) => [m.id, m.name]));
    const guildIds = [...new Set((members || []).map((m) => m.guild_id).filter(Boolean))];
    if (guildIds.length > 0) {
      const guilds = await supabaseQuerySafe(
        `guilds?select=id,name&id=in.(${guildIds.map((id) => `'${id}'`).join(",")})`
      );
      const guildNameMap = new Map((guilds || []).map((g) => [g.id, g.name]));
      for (const m of members || []) {
        if (m.guild_id && guildNameMap.has(m.guild_id)) {
          memberGuildMap.set(m.id, guildNameMap.get(m.guild_id));
        }
      }
    }
  }
  const partyGuildIds = [...new Set(partyRows.map((p) => p.guild_id).filter(Boolean))];
  let partyGuildMap = /* @__PURE__ */ new Map();
  if (partyGuildIds.length > 0) {
    const guilds = await supabaseQuerySafe(
      `guilds?select=id,name&id=in.(${partyGuildIds.map((id) => `'${id}'`).join(",")})`
    );
    partyGuildMap = new Map((guilds || []).map((g) => [g.id, g.name]));
  }
  return partyRows.map((p) => {
    const pMembers = memberRows.filter((m) => m.party_id === p.id).map((m) => {
      const name = memberMap.get(m.member_id) || m.member_id.slice(0, 8);
      const gName = memberGuildMap.get(m.member_id);
      return gName ? `${name} \u{1F6E1}${gName}` : name;
    });
    return {
      name: p.name,
      guildName: partyGuildMap.get(p.guild_id) || null,
      members: pMembers
    };
  });
}
function formatPartyListForThread(parties) {
  if (!parties.length) return null;
  const lines = [];
  for (const p of parties) {
    const guildTag = p.guildName ? ` [${p.guildName}]` : "";
    lines.push(`**${p.name}**${guildTag} (${p.members.length})`);
    if (p.members.length > 0) lines.push(p.members.join(", "));
    else lines.push("_No members_");
    lines.push("");
  }
  lines.push("\u2500".repeat(20));
  return lines.join("\n");
}

// scripts/bot/threads.ts
var threadCache = /* @__PURE__ */ new Map();
var THREAD_CACHE_TTL = 30 * 6e4;
async function createThreadInChannel(channelId, threadName, firstMessage, guildName) {
  const threadRes = await discordFetch(
    `https://discord.com/api/v10/channels/${channelId}/threads`,
    {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: threadName,
        type: 11,
        auto_archive_duration: 10080
      })
    }
  );
  if (threadRes.ok) {
    const thread = await threadRes.json();
    console.log(`[thread] \u2705 Created "${threadName}" \u2192 channel ${channelId}${guildName ? ` (${guildName})` : ""}`);
    await discordFetch(
      `https://discord.com/api/v10/channels/${thread.id}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: firstMessage })
      }
    ).catch(() => {
    });
    return thread.id;
  }
  console.error(`[thread] \u274C Failed to create "${threadName}" in channel ${channelId}: HTTP ${threadRes.status}`);
  return null;
}
async function createEventThreads(serverId, name, guildName, spawnUnix, ownerType = "boss", targetId) {
  try {
    const configs = await supabaseQuerySafe(
      `discord_configs?raidscout_server_id=eq.${serverId}&select=id,thread_channel_id,thread_guilds`
    );
    if (!configs?.length) return;
    const allThreadGuildIds = [...new Set(configs.flatMap((c) => c.thread_guilds || []))];
    let guildIdToName = /* @__PURE__ */ new Map();
    if (allThreadGuildIds.length > 0) {
      const guildRows = await supabaseQuerySafe(
        `guilds?select=id,name&id=in.(${allThreadGuildIds.join(",")})`
      );
      guildIdToName = new Map((guildRows || []).map((g) => [g.id, g.name]));
    }
    const tz = await resolveServerTimezone(serverId).catch(() => "UTC");
    const spawnDate = new Date(spawnUnix * 1e3);
    const timeStr = spawnDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz });
    const dateStr = spawnDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
    for (const cfg of configs) {
      const channelId = cfg.thread_channel_id;
      const threadGuilds = cfg.thread_guilds || [];
      if (!channelId) continue;
      let firstMessage = ".";
      if (targetId) {
        const parties = await fetchPartyList(serverId, targetId, ownerType);
        const formatted = formatPartyListForThread(parties);
        if (formatted) {
          firstMessage = `**Party Setup -- ${name}**
${formatted}`;
        }
      }
      const hasParties = firstMessage !== ".";
      const hasGuildOwner = !!guildName;
      const threadGuildNames = threadGuilds.map((gid) => guildIdToName.get(gid) || gid);
      const guildAllowed = guildName != null && threadGuildNames.some((g) => g.toLowerCase() === guildName.toLowerCase());
      const shouldThread = threadGuilds.length > 0 && guildAllowed;
      if (shouldThread) {
        const cacheKey = `${channelId}-${name}-${guildName || "noguild"}-${spawnUnix}`;
        if (threadCache.has(cacheKey)) {
          console.log(`[thread] \u23ED\uFE0F Cache hit: "${name}" ${guildName || ""} channel ${channelId}`);
          continue;
        }
        const threadName = `${name}${guildName ? ` -- ${guildName}` : ""} -- ${dateStr}, ${timeStr}`;
        const tid = await createThreadInChannel(channelId, threadName, firstMessage, guildName);
        if (tid) threadCache.set(cacheKey, { threadId: tid, createdAt: Date.now() });
      } else {
        console.log(`[thread] \u23ED\uFE0F Skip "${name}": owner=${guildName || "none"} whitelist=[${threadGuildNames.join(",")}]`);
      }
      if (targetId && ownerType === "boss") {
        try {
          const assists = await supabaseQuerySafe(
            `boss_assists?boss_id=eq.${targetId}&select=owner_guild_id,assistant_guild_id`
          );
          if (assists?.length) {
            const allIds = [.../* @__PURE__ */ new Set([
              ...assists.map((a) => a.owner_guild_id),
              ...assists.map((a) => a.assistant_guild_id)
            ])];
            const guildRows = await supabaseQuerySafe(
              `guilds?select=id,name&id=in.(${allIds.join(",")})`
            );
            const guildNames = new Map((guildRows || []).map((g) => [g.id, g.name]));
            const resolvedAll = allIds.map((gid) => guildNames.get(gid) || gid).filter((n) => n !== guildName);
            console.log(`[thread] "${name}" assist guilds: [${resolvedAll.join(",")}]`);
            for (const gid of allIds) {
              const assistGuild = guildNames.get(gid);
              if (!assistGuild || assistGuild === guildName) continue;
              const assistAllowed = threadGuildNames.length > 0 && threadGuildNames.some((g) => g.toLowerCase() === assistGuild.toLowerCase());
              if (!assistAllowed) {
                console.log(`[thread] \u23ED\uFE0F Assist skip "${name}" \u2192 ${assistGuild}: not in whitelist [${threadGuildNames.join(",")}]`);
                continue;
              }
              const assistCacheKey = `${channelId}-${name}-${assistGuild}-assist-${spawnUnix}`;
              if (threadCache.has(assistCacheKey)) {
                console.log(`[thread] \u23ED\uFE0F Assist cache hit: "${name}" \u2192 ${assistGuild}`);
                continue;
              }
              threadCache.set(assistCacheKey, { threadId: "", createdAt: Date.now() });
              const assistThreadName = `${name} -- ${assistGuild} [Assist] -- ${dateStr}, ${timeStr}`;
              await createThreadInChannel(channelId, assistThreadName, ".", assistGuild);
            }
          }
        } catch (assistErr) {
          console.error("[thread] Assist lookup failed:", assistErr.message);
        }
      }
    }
  } catch (err) {
    console.error("[thread] createEventThreads failed:", err.message);
  }
}
setInterval(() => {
  const cutoff = Date.now() - THREAD_CACHE_TTL;
  for (const [key, entry] of threadCache) {
    if (entry.createdAt < cutoff) threadCache.delete(key);
  }
}, 10 * 6e4);

// scripts/bot/spawn-cron.ts
var sentNotifs2 = /* @__PURE__ */ new Map();
setInterval(() => {
  const cutoff = Date.now() - 2 * 36e5;
  for (const [key, ts] of sentNotifs2) {
    if (ts < cutoff) sentNotifs2.delete(key);
  }
}, 10 * 6e4);
var cronStarted = false;
var lastTickTime = 0;
var lastServersChecked = 0;
var lastBossesChecked = 0;
function getCronStats() {
  return {
    last_tick_seconds_ago: lastTickTime ? Math.floor((Date.now() - lastTickTime) / 1e3) : null,
    servers_checked: lastServersChecked,
    bosses_checked: lastBossesChecked
  };
}
function startSpawnCron() {
  if (cronStarted) return;
  cronStarted = true;
  setInterval(async () => {
    try {
      await runSpawnCron();
    } catch (err) {
      console.error("[cron] Tick error:", err.message);
    }
  }, 6e4);
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
  const activeServers = await supabaseQuerySafe(`servers?select=id&deleted_at=is.null`);
  const activeServerIds = new Set((activeServers || []).map((s) => s.id));
  const threadConfigs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id,discord_guild_id,thread_channel_id,thread_guilds&thread_channel_id=not.is.null`
  );
  const serverThreadMap = /* @__PURE__ */ new Map();
  for (const tc of threadConfigs || []) {
    const sid = tc.raidscout_server_id;
    if (!serverThreadMap.has(sid)) serverThreadMap.set(sid, []);
    serverThreadMap.get(sid).push({ discordId: tc.discord_guild_id, threadGuilds: tc.thread_guilds || [] });
  }
  const cmdConfigs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id&command_channel_id=not.is.null`
  );
  const allDiscordConfigs = await supabaseQuerySafe(
    `discord_configs?select=raidscout_server_id`
  );
  const allConfigServerIds = [
    ...configs.map((c) => c.raidscout_server_id),
    ...(threadConfigs || []).map((c) => c.raidscout_server_id),
    ...(cmdConfigs || []).map((c) => c.raidscout_server_id)
  ];
  const serverIds = [...new Set(allConfigServerIds)].filter((id) => activeServerIds.has(id));
  const allDiscordServerIds = [...new Set((allDiscordConfigs || []).map((c) => c.raidscout_server_id))].filter((id) => activeServerIds.has(id));
  serversChecked = allDiscordServerIds.length;
  for (const serverId of serverIds) {
    const tz = await resolveServerTimezone(serverId).catch(() => "Asia/Manila");
    const [bosses, deaths, guilds, overrides] = await Promise.all([
      supabaseQuerySafe(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null`),
      supabaseQuerySafe(`death_records?server_id=eq.${serverId}&order=death_time.desc&limit=300`),
      supabaseQuerySafe(`guilds?server_id=eq.${serverId}`),
      supabaseQuerySafe(`boss_spawn_overrides?server_id=eq.${serverId}&select=boss_id,death_time`)
    ]);
    const guildIds = [...new Set((guilds || []).map((g) => g.id))];
    const bossGuilds = guildIds.length > 0 ? await supabaseQuerySafe(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode&guild_id=in.%28${guildIds.join("%2C")}%29&limit=10000`) : [];
    const serverBossGuilds = bossGuilds || [];
    const bossIds = [...new Set((bosses || []).map((b) => b.id))];
    const bossAssists = bossIds.length > 0 ? await supabaseQuerySafe(`boss_assists?select=boss_id,owner_guild_id,assistant_guild_id&boss_id=in.%28${bossIds.join("%2C")}%29&limit=10000`) : [];
    const serverBossAssists = bossAssists || [];
    const assistGuildIdsAll = [...new Set(serverBossAssists.map((a) => a.assistant_guild_id))];
    const ownerGuildIdsAll = [...new Set(serverBossAssists.map((a) => a.owner_guild_id))];
    const allAssistRelatedIds = [.../* @__PURE__ */ new Set([...assistGuildIdsAll, ...ownerGuildIdsAll])];
    const guildIdToName = new Map((guilds || []).map((g) => [g.id, g.name]));
    if (allAssistRelatedIds.length > 0) {
      const assistGuildRows = await supabaseQuerySafe(
        `guilds?select=id,name&id=in.(${allAssistRelatedIds.join(",")})`
      );
      for (const g of assistGuildRows || []) {
        if (!guildIdToName.has(g.id)) guildIdToName.set(g.id, g.name);
      }
    }
    const overrideMap = new Map((overrides || []).map((o) => [o.boss_id, o.death_time]));
    if (!bosses?.length) continue;
    for (const boss of bosses) {
      try {
        bossesChecked++;
        const bossDeaths = (deaths || []).filter((d) => d.boss_id === boss.id && !d.is_initial_spawn);
        const lastDeath = bossDeaths.sort(
          (a, b) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime()
        )[0];
        const overrideDeathTime = overrideMap.get(boss.id);
        const effectiveDeathTime = overrideDeathTime ?? lastDeath?.death_time ?? null;
        let spawnTime;
        if (boss.spawn_type === "fixed_hours") {
          if (!effectiveDeathTime) continue;
          spawnTime = new Date(new Date(effectiveDeathTime).getTime() + (boss.respawn_hours ?? 24) * 36e5);
        } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
          const schedTz = getScheduleTz(boss, tz);
          let recentSlot = null;
          const now = /* @__PURE__ */ new Date();
          for (let d = 0; d <= 7; d++) {
            const check = new Date(now);
            check.setDate(check.getDate() - d);
            for (const slot of boss.schedule) {
              const c = scheduleSlotToUTC(schedTz, check, slot.day, slot.time);
              if (c <= now && (!recentSlot || c > recentSlot)) recentSlot = c;
            }
          }
          if (!recentSlot) continue;
          const nextSlot = findNextScheduleSlot(boss.schedule, new Date(recentSlot.getTime() + 6e4), schedTz);
          const aliveUntil = new Date(Math.min(nextSlot.getTime() - 36e5, recentSlot.getTime() + 4 * 36e5));
          const wasKilled = lastDeath && new Date(lastDeath.death_time) >= recentSlot;
          if (wasKilled || now >= aliveUntil) {
            spawnTime = findNextScheduleSlot(boss.schedule, now, schedTz);
          } else {
            continue;
          }
        } else {
          continue;
        }
        const spawnUnix = Math.floor(spawnTime.getTime() / 1e3);
        const nowUnix = Math.floor(Date.now() / 1e3);
        const secsSinceSpawn = nowUnix - spawnUnix;
        const secsUntilSpawn = spawnUnix - nowUnix;
        const guildName = computeOwnerGuild(boss, serverBossGuilds, guilds || [], lastDeath, spawnTime, tz) || "";
        const tcfg = serverThreadMap.get(serverId) || [];
        const threadGuilds = /* @__PURE__ */ new Set();
        if (guildName) threadGuilds.add(guildName);
        const bossAssistRows = serverBossAssists.filter((a) => a.boss_id === boss.id);
        const assistGuildIds = bossAssistRows.map((a) => a.assistant_guild_id);
        const assistOwnerIds = bossAssistRows.map((a) => a.owner_guild_id);
        const assistNames = [];
        const assistUnresolved = [];
        for (const oid of assistOwnerIds) {
          const oName = guildIdToName.get(oid);
          if (oName && oName !== guildName) {
            threadGuilds.add(oName);
            assistNames.push(oName);
          }
        }
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
        if (assistUnresolved.length > 0) {
          console.log(`[cron] ${boss.name} assist_unresolved_ids=[${assistUnresolved.join(",")}]`);
        }
        if (threadGuilds.size > 0) {
          const matchingDiscordIds = tcfg.filter((t) => {
            if (!t.threadGuilds.length) return false;
            const whitelistNames = t.threadGuilds.map((gid) => guildIdToName.get(gid) || gid);
            return [...threadGuilds].some(
              (tg) => whitelistNames.some((n) => n.toLowerCase() === tg.toLowerCase())
            );
          }).map((t) => t.discordId);
          const discordIds = matchingDiscordIds.join(",") || null;
          if (discordIds) {
            const ownerPart = guildName || "none";
            const assistPart = assistNames.length > 0 ? ` assists=${assistNames.join(",")}` : "";
          }
        }
        if (secsSinceSpawn >= 0 && secsSinceSpawn <= 60) {
          const spawnDedupKey = `${serverId}-${boss.id}-boss_spawned-${spawnUnix}`;
          if (!sentNotifs2.has(spawnDedupKey)) {
            sentNotifs2.set(spawnDedupKey, Date.now());
            const timeStr = spawnTime.toLocaleString("en-US", {
              timeZone: tz || "Asia/Manila",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true
            });
            const text = `\u{1F7E2} **${boss.name}** has spawned -- **${guildName}** ${timeStr}`;
            await broadcastNotification(serverId, {}, "", text);
          }
          continue;
        }
        if (secsUntilSpawn <= 0) continue;
        if (secsUntilSpawn > 0 && secsUntilSpawn <= 300) {
          const dedupKey = `${serverId}-${boss.id}-5min-${spawnUnix}`;
          if (!sentNotifs2.has(dedupKey)) {
            sentNotifs2.set(dedupKey, Date.now());
            const timeStr = spawnTime.toLocaleString("en-US", {
              timeZone: tz || "Asia/Manila",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true
            });
            const text = `\u26A0\uFE0F **${boss.name}** spawning in 5 min -- **${guildName}** ${timeStr}`;
            await broadcastNotification(serverId, {}, "", text);
            await fetch(`${SUPABASE_URL}/rest/v1/spawn_notifications`, {
              method: "POST",
              headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                server_id: serverId,
                boss_id: boss.id,
                event: "boss_spawning",
                spawn_timestamp: spawnUnix,
                notified_via: "discord"
              })
            }).catch(() => {
            });
          }
          const threadDedupKey = `${serverId}-thread-${boss.id}-${spawnUnix}`;
          if (!sentNotifs2.has(threadDedupKey)) {
            sentNotifs2.set(threadDedupKey, Date.now());
            await createEventThreads(serverId, boss.name, guildName, spawnUnix, "boss", boss.id).catch(console.error);
          }
        }
      } catch (bossErr) {
        console.error(`[cron] Error processing boss ${boss.id}:`, bossErr.message);
      }
    }
    const activities = await supabaseQuerySafe(
      `activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null`
    );
    if (activities?.length) {
      const now = /* @__PURE__ */ new Date();
      for (const activity of activities) {
        try {
          let nextStart = null;
          if (activity.schedule_type === "one_time" && activity.start_time) {
            nextStart = new Date(activity.start_time);
          } else if (activity.schedule_type === "recurring" && activity.schedule) {
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
          const startUnix = Math.floor(nextStart.getTime() / 1e3);
          const nowUnix = Math.floor(Date.now() / 1e3);
          const secsUntilStart = startUnix - nowUnix;
          if (secsUntilStart > 0 && secsUntilStart <= 300) {
            const threadDedupKey = `${serverId}-thread-activity-${activity.id}-${startUnix}`;
            if (!sentNotifs2.has(threadDedupKey)) {
              sentNotifs2.set(threadDedupKey, Date.now());
              await createEventThreads(
                serverId,
                activity.name,
                void 0,
                startUnix,
                "activity",
                activity.id
              ).catch(console.error);
            }
          }
        } catch (actErr) {
          console.error(`[cron] Error processing activity ${activity.id}:`, actErr.message);
        }
      }
    }
  }
  lastServersChecked = serversChecked;
  lastBossesChecked = bossesChecked;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getCronStats,
  startSpawnCron
});
