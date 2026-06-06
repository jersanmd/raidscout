// ── Discord Gateway Bot ─────────────────────────────────────
// Standalone bot that listens for ;nextspawn and ;killed chat commands.
// Uses Discord's WebSocket Gateway (no Interactions Endpoint needed).
//
// Run: npx tsx scripts/discord-bot-gateway.ts
// Requires: DISCORD_BOT_TOKEN, SUPABASE_SERVICE_ROLE_KEY
// @ts-nocheck

import { WebSocket } from "ws";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TOKEN) { console.error("Set DISCORD_BOT_TOKEN"); process.exit(1); }

let botUserId = "";
if (!SUPABASE_URL) { console.error("Set SUPABASE_URL"); process.exit(1); }
if (!SUPABASE_KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

// ── Crash resilience ──────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err.message, err.stack?.split("\n")[1]?.trim());
});

process.on("unhandledRejection", (reason: any) => {
  console.error("Unhandled rejection:", reason?.message ?? reason);
});

// ── Circular log buffer ───────────────────────────────────

const LOG_BUFFER: { ts: string; level: string; msg: string }[] = [];
const MAX_LOG_BUFFER = 200;

function bufferLog(level: string, ...args: any[]) {
  const msg = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
  LOG_BUFFER.push({ ts: new Date().toISOString(), level, msg });
  if (LOG_BUFFER.length > MAX_LOG_BUFFER) LOG_BUFFER.shift();
}

// Override console methods to capture logs
const _log = console.log, _warn = console.warn, _error = console.error;
console.log = (...a) => { bufferLog("info", ...a); _log.apply(console, a); };
console.warn = (...a) => { bufferLog("warn", ...a); _warn.apply(console, a); };
console.error = (...a) => { bufferLog("error", ...a); _error.apply(console, a); };

// ── Supabase REST helpers ──────────────────────────────────

async function supabaseQuery(path: string): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
  });
  if (!res.ok) {
    console.error(`Supabase query failed: ${url} — ${res.status}`);
    throw new Error(`Database query failed (${res.status})`);
  }
  return res.json();
}

/** Like supabaseQuery but returns [] on failure — for optional/fallback queries */
async function supabaseQuerySafe(path: string): Promise<any> {
  try { return await supabaseQuery(path); } catch { return []; }
}

async function supabaseInsert(table: string, record: any): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY!}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    console.error(`Supabase insert failed: ${table} — ${res.status}`);
    throw new Error(`Insert failed: ${res.status}`);
  }
  return res.json();
}

// ── Discord API rate-limit-aware fetch ────────────────────

async function discordFetch(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok || res.status === 404) return res;

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After") ||
                         res.headers.get("X-RateLimit-Reset-After");
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : (attempt + 1) * 2000;
      console.warn(`Discord 429 — waiting ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (res.status >= 500) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
      continue;
    }

    return res;
  }
  throw new Error(`Discord API failed after ${retries} retries: ${url}`);
}

async function resolveServerId(guildId: string, prefix: string): Promise<string | null> {
  const rows = await supabaseQuerySafe(
    `discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(prefix)}&select=raidscout_server_id`,
  );
  return rows?.[0]?.raidscout_server_id ?? null;
}

// Cache prefixes per guild to avoid DB hits on every message
const guildPrefixes = new Map<string, { prefixes: string[]; cachedAt: number }>();
const PREFIX_CACHE_TTL = 5 * 60_000; // 5 minutes

async function getGuildPrefixes(guildId: string): Promise<string[]> {
  const cached = guildPrefixes.get(guildId);
  if (cached && Date.now() - cached.cachedAt < PREFIX_CACHE_TTL) return cached.prefixes;
  const rows = await supabaseQuerySafe(
    `discord_configs?discord_guild_id=eq.${guildId}&select=command_prefix`,
  );
  const prefixes: string[] = rows?.map((r: any) => r.command_prefix) ?? [];
  guildPrefixes.set(guildId, { prefixes, cachedAt: Date.now() });
  return prefixes;
}

async function resolveServerTimezone(serverId: string): Promise<string> {
  const rows = await supabaseQuerySafe(`servers?select=timezone&id=eq.${serverId}`);
  return rows?.[0]?.timezone || "UTC";
}

async function getNotifyPrefix(serverId: string): Promise<string> {
  const rows = await supabaseQuerySafe(`servers?select=notification_prefix&id=eq.${serverId}`);
  return rows?.[0]?.notification_prefix || "";
}

// ── Spawn helpers ──────────────────────────────────────────

function addHours(d: Date, h: number) { return new Date(d.getTime() + h * 3600_000); }

function formatRelative(unix: number): string {
  const diff = unix * 1000 - Date.now();
  if (diff <= 0) return "now";
  const mins = Math.floor(diff / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `in ${h}h ${m}m`;
  if (h > 0) return `in ${h}h`;
  return `in ${m}m`;
}

// ── Guild owner computation (exact replica of src/lib/rotation.ts) ─

function safeMod(v: number, n: number) { return ((v % n) + n) % n; }

function computeOwnerGuild(
  boss: any, bossGuilds: any[], guilds: any[], lastDeath: any, spawn: Date, tz: string
): string | undefined {
  const bgs = bossGuilds.filter((bg: any) => bg.boss_id === boss.id && bg.sort_order !== -1);
  if (bgs.length === 0) return undefined;

  // 1. Schedule mode
  const scheduleEntries = bgs.filter((bg: any) => bg.day_of_week !== null);
  if (scheduleEntries.length > 0) {
    const dow = spawn.getDay();
    const match = scheduleEntries.find((bg: any) => bg.day_of_week === dow);
    if (match) return guilds.find((g: any) => g.id === match.guild_id)?.name;
  }

  // 2. Daily mode (exact replica of getDailyOwnerGuild)
  const dailyEntries = bgs
    .filter((bg: any) => bg.mode === "daily")
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (dailyEntries.length > 0) {
    if (!lastDeath || lastDeath.is_initial_spawn) {
      return guilds.find((g: any) => g.id === dailyEntries[0].guild_id)?.name;
    }
    const respawnHours = boss.respawn_hours ?? 0;
    const deathDate = new Date(lastDeath.death_time);
    const spawnDate = new Date(deathDate.getTime() + respawnHours * 3600000);
    const lastGuildId = lastDeath.owner_guild_id;
    // Use server timezone for date comparison (matches browser behavior in web app)
    const sameDay = deathDate.toLocaleDateString("en-CA", { timeZone: tz }) === spawnDate.toLocaleDateString("en-CA", { timeZone: tz });
    if (sameDay) {
      return lastGuildId
        ? guilds.find((g: any) => g.id === lastGuildId)?.name
        : guilds.find((g: any) => g.id === dailyEntries[0].guild_id)?.name;
    }
    // Different day → advance
    const adjustment = boss.rotation_adjustment ?? 0;
    if (!lastGuildId) {
      const idx = safeMod(1 + adjustment, dailyEntries.length);
      return guilds.find((g: any) => g.id === dailyEntries[idx].guild_id)?.name;
    }
    const lastIdx = dailyEntries.findIndex((bg: any) => bg.guild_id === lastGuildId);
    const nextIdx = safeMod((lastIdx >= 0 ? lastIdx + 1 : 0) + adjustment, dailyEntries.length);
    return guilds.find((g: any) => g.id === dailyEntries[nextIdx].guild_id)?.name;
  }

  // 3. Rotation mode
  const rotationEntries = bgs
    .filter((bg: any) => bg.sort_order !== null && bg.sort_order > 0 && bg.mode !== "daily")
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (rotationEntries.length > 0) {
    const counter = boss.rotation_counter ?? 1;
    const idx = safeMod(counter - 1, rotationEntries.length);
    return guilds.find((g: any) => g.id === rotationEntries[idx].guild_id)?.name;
  }

  return undefined;
}

/** Template-based bosses store schedules in UTC; custom bosses use the server timezone */
function getScheduleTz(boss: any, serverTz: string): string {
  return boss.template_id ? "UTC" : serverTz;
}

/** Convert a schedule slot (day, "HH:MM") in the given timezone to a UTC Date */
function scheduleSlotToUTC(tz: string, refDate: Date, day: number, time: string): Date {
  // Get current date string in the target timezone for this refDate
  const localDateStr = refDate.toLocaleDateString("en-CA", { timeZone: tz }); // "2026-05-30"
  const [y, mo, d] = localDateStr.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);

  // Compute the day difference between refDate's local day and the target day
  const refDay = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  let dayDiff = day - refDay;
  if (dayDiff < -3) dayDiff += 7;
  if (dayDiff > 3) dayDiff -= 7;

  const targetLocal = new Date(Date.UTC(y, mo - 1, d + dayDiff, h, m));

  // Convert local time to UTC by getting the timezone offset at that instant
  const utcStr = targetLocal.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit" });
  const tzStr = targetLocal.toLocaleTimeString("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" });
  const [utcH, utcM] = utcStr.split(":").map(Number);
  const [tzH, tzM] = tzStr.split(":").map(Number);
  const offsetMin = (tzH * 60 + tzM) - (utcH * 60 + utcM);
  // Handle day wrap (e.g., UTC 23:00 vs local 07:00 next day → offset is -960, but should be +480)
  const adjustedOffset = offsetMin > 720 ? offsetMin - 1440 : offsetMin < -720 ? offsetMin + 1440 : offsetMin;

  return new Date(targetLocal.getTime() - adjustedOffset * 60_000);
}

function findNextScheduleSlot(schedule: { day: number; time: string }[], after: Date, tz: string): Date {
  let earliest: Date | null = null;
  const now = new Date();
  for (let d = 0; d <= 7; d++) {
    const check = new Date(now);
    check.setDate(check.getDate() + d);
    for (const slot of schedule) {
      const c = scheduleSlotToUTC(tz, check, slot.day, slot.time);
      if (c > after && (!earliest || c < earliest)) earliest = c;
    }
  }
  return earliest ?? after; // fallback
}

// ── WebSocket Gateway ──────────────────────────────────────

async function connect() {
  // Get gateway URL (with retry)
  let gatewayUrl: string;
  try {
    const gwRes = await discordFetch("https://discord.com/api/v10/gateway/bot", {
      headers: { Authorization: `Bot ${TOKEN}` },
    });
    if (!gwRes.ok) {
      console.error(`Gateway fetch failed (${gwRes.status}). Retrying in 10s...`);
      return setTimeout(connect, 10_000);
    }
    const gwData = await gwRes.json() as any;
    if (!gwData.url) {
      console.error("Gateway URL missing. Retrying in 10s...");
      return setTimeout(connect, 10_000);
    }
    gatewayUrl = gwData.url + "/?v=10&encoding=json";
  } catch (err: any) {
    console.error("Gateway fetch error:", err.message, "Retrying in 10s...");
    return setTimeout(connect, 10_000);
  }

  console.log("Connecting to Discord Gateway...");

  const ws = new WebSocket(gatewayUrl);

  let heartbeatInterval: NodeJS.Timeout;
  let seq: number | null = null;

  ws.on("open", () => {
    console.log("Connected. Identifying...");

    ws.send(JSON.stringify({
      op: 2,
      d: {
        token: TOKEN,
        intents: 1 << 9 | 1 << 0 | 1 << 15, // GUILD_MESSAGES | GUILDS | MESSAGE_CONTENT
        properties: { os: "linux", browser: "raidscout", device: "raidscout" },
      },
    }));
  });

  ws.on("message", (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const { op, d, t, s } = msg;

    if (s) seq = s;

    // Hello — start heartbeat
    if (op === 10) {
      heartbeatInterval = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: seq }));
      }, d.heartbeat_interval);
      console.log("Bot is online!");
    }

    // GUILD_CREATE — send welcome message when added to a new server
    if (t === "GUILD_CREATE") {
      handleGuildJoin(d).catch(console.error);
    }

    // READY — store bot's user ID for mention detection
    if (t === "READY") {
      botUserId = d.user.id;
      discordConnected = true;
    }

    // MESSAGE_CREATE — handle commands
    if (t === "MESSAGE_CREATE") {
      handleMessage(d).catch(console.error);
    }
  });

  ws.on("close", (code) => {
    discordConnected = false;
    clearInterval(heartbeatInterval);
    console.log(`Disconnected (code ${code}). Reconnecting in 5s...`);
    setTimeout(connect, 5000);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
}

// ── Guild Join Handler ─────────────────────────────────────

async function handleGuildJoin(guild: any) {
  const guildId = guild.id;
  const guildName = guild.name;
  
  // Find a text channel we can send to
  let targetChannel: string | null = null;
  for (const ch of guild.channels || []) {
    if (ch.type === 0) { // GUILD_TEXT
      const perms = ch.permissions ? BigInt(ch.permissions) : 0n;
      // Check SEND_MESSAGES (0x800) and VIEW_CHANNEL (0x400)
      if ((perms & 0x800n) && (perms & 0x400n)) {
        targetChannel = ch.id;
        break;
      }
    }
  }

  if (!targetChannel) return; // Can't send anywhere

  const botInvite = "https://discord.com/api/oauth2/authorize?client_id=1508368991272566975&permissions=2147485696&scope=bot%20applications.commands";

  await discordFetch(`https://discord.com/api/v10/channels/${targetChannel}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: "👋 RaidScout Bot is here!",
        description: `Thanks for adding me to **${guildName}**! Here's how to get started:`,
        color: 0x8b5cf6,
        fields: [
          {
            name: "1️⃣ Link this Discord server to RaidScout",
            value: "Go to **Server Settings → Integrations** on the [RaidScout web app](https://raidscout.vercel.app), enter your Discord Server ID, and choose a command prefix (default: `!`).",
          },
          {
            name: "2️⃣ Set up notifications",
            value: "Type `!notifhere` in a channel to receive boss kill/spawn alerts there. Type `!cmdhere` to restrict commands to a specific channel.\n\nAdmins can set a custom ping prefix per linked server (e.g. `@Raiders`) in **Server Settings → Integrations**. The bot also supports auto-creating threads for spawn events — configure in the same tab.",
          },
          {
            name: "3️⃣ Try a command",
            value: "`!list` — See all bosses\n`!nextspawn` — Upcoming spawns in 24h\n`!nextspawn <boss>` — Check a specific boss\n`!nextspawn <guild>` — Spawns for a guild\n`!killed <boss>` — Record a kill (only on alive bosses)\n`!forcespawn <boss>` — Force a boss to spawn\n`!forcespawnall` — Spawn all fixed-timer bosses\n`!forcespawnall --all` — Spawn all fixed-timer bosses across ALL servers\n`!commands` — Full command list",
          },
          {
            name: "💡 Multiple RaidScout servers?",
            value: "If this Discord server tracks bosses for multiple games, each RaidScout server can use a different command prefix (e.g. `!` for Lineage II, `$` for WoW). Each linked server can have its own notification ping and thread channels.",
          },
        ],
        footer: { text: "Powered by RaidScout" },
      }],
    }),
  }).catch(() => {});
}

// ── Command Handler ────────────────────────────────────────

async function handleMessage(msg: any) {
  const content: string = msg.content?.trim() ?? "";
  const channelId: string = msg.channel_id;
  const guildId: string = msg.guild_id;
  const author: string = msg.author?.username ?? "unknown";

  // ── Log helper ──────────────────────────────────────
  const guildServerNames = new Map<string, string>();
  const resolveServerName = async (gid: string): Promise<string> => {
    const cached = guildServerNames.get(gid);
    if (cached) return cached;
    try {
      const rows = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${gid}&select=raidscout_server_id,servers!inner(name)&limit=1`);
      const name = rows?.[0]?.servers?.name ?? "?";
      guildServerNames.set(gid, name);
      return name;
    } catch {
      guildServerNames.set(gid, "?");
      return "?";
    }
  };
  const cmdLog = async (cmd: string, result: "ok" | "fail", detail?: string) => {
    const guildTag = guildId ? guildId.slice(0, 8) : "DM";
    const srvName = guildId ? await resolveServerName(guildId) : "";
    const namePart = srvName ? ` [${srvName}]` : "";
    console.log(`[cmd] ${author}@${guildTag}${namePart}:${cmd} — ${result}${detail ? ` (${detail})` : ""}`);
  };

  // ── Resolve prefix & command ────────────────────────

  // Check if bot was @mentioned — use content after mention as command
  let mentionedPrefix = "";
  if (botUserId && content) {
    const mentionPattern = new RegExp(`<@!?${botUserId}>\\s*`);
    const mentionMatch = content.match(mentionPattern);
    if (mentionMatch) {
      mentionedPrefix = mentionMatch[0];
    }
  }

  // Match command prefix for this guild (supports multiple RaidScout servers)
  if (!guildId) return;
  const prefixes = await getGuildPrefixes(guildId);
  const matchedPrefix = prefixes.find(p => content.startsWith(p));
  if (!matchedPrefix && !mentionedPrefix) return;
  const effectivePrefix = matchedPrefix || mentionedPrefix;
  const args = content.slice(effectivePrefix.length).split(/\s+/);
  const rawCmd = args[0]?.toLowerCase();

  // Load custom command aliases for this server
  let aliases: Record<string, string> = {};
  const aliasPrefix = matchedPrefix || prefixes[0] || "";
  if (aliasPrefix) {
    const aliasRows = await supabaseQuerySafe(
      `discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(aliasPrefix)}&select=command_aliases`
    );
    if (aliasRows?.[0]?.command_aliases) aliases = aliasRows[0].command_aliases;
  }
  const cmd = aliases[rawCmd] || rawCmd;

  // Resolve server ID for this guild+prefix combo (needed for maintenance check & commands)
  const serverId = await resolveServerId(guildId, matchedPrefix || prefixes[0] || "");

  // Fix server name cache — look up the actual server name by serverId (not guildId)
  // Multiple RaidScout servers can share a Discord guild, so guildId-based lookup picks arbitrarily
  if (serverId && guildId) {
    try {
      const srvRows = await supabaseQuerySafe(`servers?id=eq.${serverId}&select=name`);
      const srvName = srvRows?.[0]?.name;
      if (srvName) guildServerNames.set(guildId, srvName);
    } catch { /* ignore */ }
  }

  // Check maintenance mode — skip all commands if maintenance is on for this server
  if (serverId) {
    try {
      // Check server-specific maintenance first, then global
      const maintRows = await supabaseQuerySafe(`app_settings?key=eq.maintenance_mode&server_id=eq.${serverId}&select=value`);
      const globalMaint = await supabaseQuerySafe(`app_settings?key=eq.maintenance_mode&server_id=is.null&select=value`);
      const isMaint = maintRows?.[0]?.value === "true" || globalMaint?.[0]?.value === "true";
      if (isMaint) {
        if (cmd && cmd !== "help" && cmd !== "commands") {
          let msg = "🔧 RaidScout is currently under maintenance for this server. Please try again later.";
          try {
            // Check server-specific end time first, then global
            const endRows = await supabaseQuerySafe(`app_settings?key=eq.maintenance_end&server_id=eq.${serverId}&select=value`);
            const globalEnd = await supabaseQuerySafe(`app_settings?key=eq.maintenance_end&server_id=is.null&select=value`);
            const endVal = endRows?.[0]?.value || globalEnd?.[0]?.value;
            if (endVal) {
              const endDate = new Date(endVal);
              const tz = await resolveServerTimezone(serverId);
              msg += `\n📅 Expected to be back ${endDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz, timeZoneName: "short" })}.`;
            }
          } catch { /* ignore end time fetch failure */ }
          await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ content: msg }),
          });
        }
        return;
      }
    } catch { /* proceed if check fails */ }
  }

  // Valid commands that should trigger ✅ reaction
  const validCmds = new Set(["list","nextspawn","spawn","killed","kill","forcespawn","forcespawnall","spawnall","commands","help","notifhere","cmdhere","threadhere"]);
  if (validCmds.has(cmd)) {
    discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("✅")}/@me`, {
      method: "PUT",
      headers: { Authorization: `Bot ${TOKEN}` },
    }).catch(() => {});
  }

  // Check command channel restriction (if set, ignore commands from other channels)
  if (matchedPrefix) {
    const cfgRows = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=command_channel_id`);
    const cmdChannel = cfgRows?.[0]?.command_channel_id;
    if (cmdChannel && channelId !== cmdChannel && cmd !== "cmdhere" && cmd !== "notifhere" && cmd !== "threadhere" && cmd !== "forcespawn" && cmd !== "forcespawnall" && cmd !== "spawnall") return;
  }

  async function reply(text: string) {
    await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: text }),
    });
    await cmdLog(cmd, "ok");
  }

  async function replyEmbed(title: string, desc: string, color: number, fields?: any[]) {
    const res = await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [{ title, description: desc, color, fields, footer: { text: "Powered by RaidScout" } }],
      }),
    });
    if (!res.ok) console.error(`replyEmbed failed: ${res.status}`, await res.text().catch(() => ""));
    await cmdLog(cmd, "ok");
  }

  // ── list ─────────────────────────────────────────────
  if (cmd === "list") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ This Discord server is not linked to RaidScout. An admin needs to go to **Server Settings → Integrations** on the RaidScout web app and link this Discord server."); }
    const bosses = await supabaseQuery(`bosses?server_id=eq.${serverId}&order=name`);
    if (!bosses?.length) { await cmdLog(cmd, "fail", "no bosses"); return reply("No bosses found."); }
    // Split into chunks of 25 (Discord embed field limit)
    const chunkSize = 25;
    const chunks: string[] = [];
    for (let i = 0; i < bosses.length; i += chunkSize) {
      chunks.push(bosses.slice(i, i + chunkSize).map((b: any, j: number) =>
        `${i + j + 1}. ${b.name}`
      ).join("\n"));
    }
    for (let c = 0; c < chunks.length; c++) {
      const isFirst = c === 0;
      await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: isFirst ? `📋 Boss List (${bosses.length} bosses)` : undefined,
            description: chunks[c],
            color: 0x8b5cf6,
            footer: isFirst ? { text: "Powered by RaidScout" } : undefined,
          }],
        }),
      });
    }
    await cmdLog(cmd, "ok", `${bosses.length} bosses`);
  }

  // ── notifhere ────────────────────────────────────────
  if (cmd === "notifhere") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ This Discord server is not linked to RaidScout. An admin needs to go to **Server Settings → Integrations** on the RaidScout web app and link this Discord server."); }
    // Persist to DB so it survives bot restarts
    const existing = await supabaseQuerySafe(
      `discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=id`
    );
    if (existing?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/discord_configs?id=eq.${existing[0].id}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
        body: JSON.stringify({ notification_channel_id: msg.channel_id }),
      });
    }
    return reply("✅ This channel will now receive boss kill, spawn, and activity notifications.");
  }

  // ── cmdhere ──────────────────────────────────────────
  if (cmd === "cmdhere") {
    if (!serverId) return reply("⚠️ This Discord server is not linked to RaidScout.");
    const existing = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=id`);
    if (existing?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/discord_configs?id=eq.${existing[0].id}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
        body: JSON.stringify({ command_channel_id: msg.channel_id }),
      });
      guildPrefixes.delete(guildId); // bust prefix cache
    }
    return reply("✅ Bot commands will now only work in this channel.");
  }

  // ── threadhere ───────────────────────────────────────
  if (cmd === "threadhere") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ This Discord server is not linked to RaidScout."); }
    const existing = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=id`);
    if (existing?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/discord_configs?id=eq.${existing[0].id}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
        body: JSON.stringify({ thread_channel_id: msg.channel_id }),
      });
    }
    return reply("✅ Auto-threads for spawn events will be created in this channel. Use **Server Settings → Integrations** to select which guilds trigger threads.");
  }

  // ── forcespawn <boss> ───────────────────────────────
  if (cmd === "forcespawn") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }

    const bossName = args.slice(1).join(" ");
    if (!bossName) { await cmdLog(cmd, "fail", "no boss name"); return reply("Usage: `!forcespawn Boss Name`"); }

    const bosses = await supabaseQuery(
      `bosses?server_id=eq.${serverId}&name=ilike.${encodeURIComponent("%" + bossName + "%")}&select=id,name,respawn_hours`
    );
    if (!bosses?.length) { await cmdLog(cmd, "fail", `boss "${bossName}" not found`); return reply(`Boss **${bossName}** not found.`); }
    const boss = bosses[0];

    // Delete existing override, then insert with calculated death_time
    // Formula: death_time = now - respawn_hours  →  boss spawns at "now"
    const now = new Date();
    const deathTime = new Date(now.getTime() - (boss.respawn_hours || 24) * 3600000).toISOString();
    await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides?boss_id=eq.${boss.id}&server_id=eq.${serverId}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
    }).catch(() => {});
    await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: serverId, boss_id: boss.id, death_time: deathTime }),
    }).catch(() => {});

    return reply(`✅ **${boss.name}** has been force-spawned. Use \`;killed ${boss.name}\` to record the kill.`);
  }

  // ── forcespawnall ────────────────────────────────────
  if (cmd === "forcespawnall" || cmd === "spawnall") {
    const allFlag = args[1] === "--all";

    if (allFlag) {
      // Run forcespawnall across ALL servers
      const allServers = await supabaseQuery(`servers?deleted_at=is.null&select=id,name`);
      if (!allServers?.length) return reply("No servers found.");

      let totalCount = 0;
      const results: string[] = [];
      const now = Date.now();

      for (const srv of allServers) {
        const bosses = await supabaseQuery(
          `bosses?server_id=eq.${srv.id}&spawn_type=eq.fixed_hours&select=id,respawn_hours`
        );
        if (!bosses?.length) continue;

        let count = 0;
        for (const b of bosses) {
          try {
            const deathTime = new Date(now - (b.respawn_hours || 24) * 3600000).toISOString();
            // Delete existing override first
            await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides?boss_id=eq.${b.id}&server_id=eq.${srv.id}`, {
              method: "DELETE",
              headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
            });
            await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides`, {
              method: "POST",
              headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
              body: JSON.stringify({ server_id: srv.id, boss_id: b.id, death_time: deathTime }),
            });
            count++;
          } catch { /* skip */ }
        }
        if (count > 0) {
          totalCount += count;
          results.push(`**${srv.name}**: ${count} bosses`);
        }
      }

      if (results.length === 0) return reply("No fixed-timer bosses found across any server.");
      return reply(`✅ **forcespawnall --all** complete!\n${results.join("\n")}\n\n**Total: ${totalCount}** bosses force-spawned across **${results.length}** servers.`);
    }

    // Original single-server forcespawnall
    if (!serverId) return reply("⚠️ Not linked to RaidScout.");

    const bosses = await supabaseQuery(
      `bosses?server_id=eq.${serverId}&spawn_type=eq.fixed_hours&select=id,respawn_hours`
    );
    if (!bosses?.length) return reply("No fixed-timer bosses found.");

    const now = Date.now();
    let count = 0;
    for (const b of bosses) {
      try {
        const deathTime = new Date(now - (b.respawn_hours || 24) * 3600000).toISOString();
        // Delete existing override first
        await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides?boss_id=eq.${b.id}&server_id=eq.${serverId}`, {
          method: "DELETE",
          headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
        });
        await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides`, {
          method: "POST",
          headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
          body: JSON.stringify({ server_id: serverId, boss_id: b.id, death_time: deathTime }),
        });
        count++;
      } catch { /* skip */ }
    }

    return reply(`✅ **${count}** fixed-timer bosses force-spawned. Use \`;killed <boss>\` to record kills.`);
  }

  // ── commands ─────────────────────────────────────────
  if (cmd === "commands" || cmd === "help") {
    const p = matchedPrefix;
    // Check if multiple servers are linked + load aliases
    const guildConfigs = await supabaseQuerySafe(
      `discord_configs?discord_guild_id=eq.${guildId}&select=command_prefix,label,command_aliases`
    );
    const multiServer = (guildConfigs?.length ?? 0) > 1;
    const prefixNote = multiServer
      ? `\n💡 This Discord server has multiple RaidScout servers linked. Each uses its own prefix:\n${guildConfigs.map((c: any) => `\`${c.command_prefix}\` — ${c.label || "Unnamed"}`).join("\n")}`
      : "";
    // Load aliases for this server
    const serverConfig = guildConfigs?.find((c: any) => c.command_prefix === matchedPrefix);
    const aliasesMap: Record<string, string> = serverConfig?.command_aliases || {};
    // Build reverse map for display
    const reverseAliases: Record<string, string> = {};
    for (const [canon, alias] of Object.entries(aliasesMap)) {
      if (alias) reverseAliases[canon] = alias;
    }
    const aliasNote = (alias: string) => reverseAliases[alias] ? ` (alias: \`${p}${reverseAliases[alias]}\`)` : "";
    return replyEmbed(
      "📋 RaidScout Bot Commands",
      `Prefix for this server: \`${p}\`${prefixNote}`,
      0x8b5cf6,
      [
        { name: `${p}list${aliasNote("list")}`, value: "Show all boss names", inline: false },
        { name: `${p}nextspawn${aliasNote("nextspawn")}`, value: "List boss spawns in the next 24 hours", inline: false },
        { name: `${p}nextspawn <boss>`, value: `Check spawn for a specific boss (e.g. \`${p}nextspawn Venatus\`)`, inline: false },
        { name: `${p}nextspawn <guild>`, value: `List spawns for a specific guild (e.g. \`${p}nextspawn Arcane\`)`, inline: false },
        { name: `${p}killed <boss>${aliasNote("killed")}`, value: `Record a boss kill right now (e.g. \`${p}killed Venatus\`)`, inline: false },
        { name: `${p}killed <boss> HH:MM`, value: "Record a kill at a custom time. Auto: if the time already passed today → today. If it hasn't happened yet → yesterday.", inline: false },
        { name: `${p}killed <boss> HH:MM today`, value: "Force today's date even if the time is in the future", inline: false },
        { name: `${p}killed <boss> HH:MM yesterday`, value: "Force yesterday's date even if the time already passed today", inline: false },
        { name: `${p}commands${aliasNote("commands")}`, value: "Show this help message", inline: false },
        { name: `${p}notifhere${aliasNote("notifhere")}`, value: "Set this channel for boss kill & spawn notifications", inline: false },
        { name: `${p}cmdhere${aliasNote("cmdhere")}`, value: "Restrict bot commands to this channel only", inline: false },
        { name: `${p}threadhere${aliasNote("threadhere")}`, value: "Set this channel for auto-created spawn threads", inline: false },
        { name: `${p}forcespawn <boss>`, value: `Force a boss to spawn (e.g. \`${p}forcespawn Venatus\`)`, inline: false },
        { name: `${p}forcespawnall`, value: "Force-spawn ALL fixed-timer bosses (use after maintenance)\n`${p}forcespawnall --all` — run across all servers", inline: false },
      ],
    );
  }

  // ── nextspawn [boss|guild] ───────────────────────────
  if (cmd === "nextspawn" || cmd === "spawn") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ This Discord server is not linked to RaidScout. An admin needs to go to **Server Settings → Integrations** on the RaidScout web app and link this Discord server."); }

    const filter = args[1];
    const tz = await resolveServerTimezone(serverId);
    const [bosses, deaths, guilds, overrides] = await Promise.all([
      supabaseQuery(`bosses?server_id=eq.${serverId}&order=name`),
      supabaseQuery(`death_records?server_id=eq.${serverId}&order=death_time.desc&limit=200`),
      supabaseQuery(`guilds?server_id=eq.${serverId}`),
      supabaseQuery(`boss_spawn_overrides?server_id=eq.${serverId}&select=boss_id,death_time`),
    ]);
    // Build override map for quick lookup
    const overrideMap = new Map((overrides || []).map((o: any) => [o.boss_id, o.death_time]));

    // Check if filter matches a guild name (case-insensitive exact match)
    const filterGuild = filter ? guilds.find((g: any) => g.name.toLowerCase() === filter.toLowerCase()) : null;

    const now = new Date();
    const cutoff = addHours(now, 24);
    const upcoming: { name: string; time: string; unix: number; guild: string }[] = [];

    const bossGuilds = await supabaseQuery(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode`);
    // Filter to only this server's guilds (boss_guilds has no server_id column)
    const serverGuildIds = new Set(guilds.map((g: any) => g.id));
    const serverBossGuilds = bossGuilds.filter((bg: any) => serverGuildIds.has(bg.guild_id));
    for (const boss of bosses) {
      // Skip if filter given and neither boss name nor guild name matches
      if (filter && !boss.name.toLowerCase().includes(filter.toLowerCase())) {
        if (!filterGuild) continue;
        // Check if this boss's owner guild matches the filter guild
        const lastDeath = deaths
          .filter((d: any) => d.boss_id === boss.id && !d.is_initial_spawn)
          .sort((a: any, b: any) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];
        const gName = computeOwnerGuild(boss, serverBossGuilds, guilds, lastDeath, now, tz) || "";
        if (gName.toLowerCase() !== filterGuild.name.toLowerCase()) continue;
      }

      const lastDeath = deaths
        .filter((d: any) => d.boss_id === boss.id && !d.is_initial_spawn)
        .sort((a: any, b: any) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];

      let spawn: Date;
      if (boss.spawn_type === "fixed_hours") {
        // Use spawn override death_time if available (same as web app)
        const overrideDeathTime = overrideMap.get(boss.id);
        const effectiveDeathTime = overrideDeathTime ?? lastDeath?.death_time ?? null;
        if (effectiveDeathTime) {
          spawn = addHours(new Date(effectiveDeathTime), boss.respawn_hours ?? 0);
          if (spawn <= now) spawn = now; // boss is alive
        } else {
          spawn = now; // no death data → unknown, show as alive
        }
      } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
        // Use UTC for template-based bosses, server TZ for custom bosses
        const schedTz = getScheduleTz(boss, tz);
        // Find most recent past schedule slot
        let recentSlot: { day: number; time: string } | null = null;
        let recentTime: Date | null = null;
        for (let d = 0; d <= 7; d++) {
          const check = new Date(now);
          check.setDate(check.getDate() - d);
          for (const slot of boss.schedule) {
            const c = scheduleSlotToUTC(schedTz, check, slot.day, slot.time);
            if (c <= now && (!recentTime || c > recentTime)) {
              recentTime = c;
              recentSlot = slot;
            }
          }
        }

        if (!recentSlot || !recentTime) {
          // No past slot found — find next future slot
          spawn = findNextScheduleSlot(boss.schedule, now, schedTz);
        } else {
          // Find next schedule slot after this one (for alive-window calculation)
          const nextSlotTime = findNextScheduleSlot(boss.schedule, new Date(recentTime.getTime() + 60_000), schedTz);
          // Alive until 1 hour before next slot, capped at 4 hours from current slot
          const aliveUntil = new Date(Math.min(
            nextSlotTime.getTime() - 3600_000,
            recentTime.getTime() + 4 * 3600_000,
          ));

          const wasKilled = lastDeath && new Date(lastDeath.death_time) >= recentTime;

          if (!wasKilled && now >= recentTime && now < aliveUntil) {
            // Boss is alive right now
            spawn = now;
          } else {
            // Boss is dead or window closed — find next future schedule
            spawn = findNextScheduleSlot(boss.schedule, now, schedTz);
          }
        }
      } else continue;

      if (spawn.getTime() <= cutoff.getTime()) {
        // Compute owner guild — exact replica of src/lib/rotation.ts getOwnerGuildName
        const gName = computeOwnerGuild(boss, serverBossGuilds, guilds, lastDeath, spawn, tz) || "";
        const unix = Math.floor(spawn.getTime() / 1000);
        upcoming.push({ name: boss.name, time: spawn <= now ? "**ALIVE NOW**" : `<t:${unix}:t>`, unix, guild: gName });
      }
    }

    if (upcoming.length === 0) {
      if (filter) await cmdLog(cmd, "fail", `no spawns for "${filter}"`); else await cmdLog(cmd, "fail", "no spawns in 24h");
      return reply(filter ? `No spawn data for **${filter}** in 24h.` : "No bosses spawning in 24h.");
    }

    upcoming.sort((a, b) => {
      if (a.time === "**ALIVE NOW**" && b.time !== "**ALIVE NOW**") return -1;
      if (b.time === "**ALIVE NOW**" && a.time !== "**ALIVE NOW**") return 1;
      return a.unix - b.unix;
    });

    // Build as single description text (one line per boss)
    const lines = upcoming.map((b, i) => {
      const prefix = b.time === "**ALIVE NOW**" ? "🟢 " : "";
      const guild = b.guild ? ` — ${b.guild}` : "";
      const countdown = b.time !== "**ALIVE NOW**" ? ` (<t:${b.unix}:R>)` : "";
      return `${i + 1}. ${prefix}${b.name}${guild} ${b.time}${countdown}`;
    });
    const desc = lines.join("\n");

    await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: filterGuild ? `📋 ${filterGuild.name} Spawns (24h)` : filter ? `${filter} Spawn` : "📋 Upcoming Boss Spawns (24h)",
          description: desc,
          color: 0x8b5cf6,
          footer: { text: "Powered by RaidScout" },
        }],
      }),
    }).then(async (res) => {
      // Message stored for reference; underline feature removed
    });
    await cmdLog(cmd, "ok", `${upcoming.length} spawns`);
  }

  // ── killed <boss> [HH:MM] [yesterday|today] ──────────
  if (cmd === "killed" || cmd === "kill") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ This Discord server is not linked to RaidScout. An admin needs to go to **Server Settings → Integrations** on the RaidScout web app and link this Discord server."); }

    // Parse: !kill Boss Name [HH:MM] [yesterday|today]
    let timeStr: string | undefined;
    let bossName: string;
    let explicitDay: "yesterday" | "today" | null = null;

    const remaining = args.slice(1); // everything after "kill"

    // Check for yesterday/today at the end
    const lastWord = remaining[remaining.length - 1]?.toLowerCase();
    if (lastWord === "yesterday" || lastWord === "today") {
      explicitDay = lastWord;
      remaining.pop();
    }

    // Check for HH:MM time
    const maybeTime = remaining[remaining.length - 1];
    if (maybeTime && /^\d{1,2}:\d{2}$/.test(maybeTime)) {
      timeStr = maybeTime;
      remaining.pop();
    }

    bossName = remaining.join(" ");

    if (!bossName) { await cmdLog(cmd, "fail", "no boss name"); return reply("Usage: `!kill Boss Name [HH:MM] [yesterday|today]`"); }

    const bosses = await supabaseQuery(
      `bosses?server_id=eq.${serverId}&name=ilike.${encodeURIComponent("%" + bossName + "%")}`,
    );
    if (!bosses?.length) return reply(`Boss **${bossName}** not found.`);
    const boss = bosses[0];

    // Fetch recent deaths (needed for both cooldown and alive check)
    const recentDeaths = await supabaseQuery(
      `death_records?server_id=eq.${serverId}&boss_id=eq.${boss.id}&order=death_time.desc&limit=1`
    );
    // Also check spawn overrides
    const overrides = await supabaseQuery(
      `boss_spawn_overrides?server_id=eq.${serverId}&boss_id=eq.${boss.id}&select=death_time&limit=1`
    );
    const overrideDeathTime = overrides?.[0]?.death_time ?? null;

    // ── Alive check: only allow killing alive bosses ──
    let isAlive = false;
    const tz = await resolveServerTimezone(serverId);
    const aliveNow = new Date();

    if (boss.spawn_type === "fixed_hours") {
      const lastDeathForAlive = recentDeaths?.[0];
      // Use override death_time if available (same as spawn calculator)
      const effectiveDeathTime = overrideDeathTime ?? lastDeathForAlive?.death_time ?? null;
      if (effectiveDeathTime) {
        const spawnTime = new Date(new Date(effectiveDeathTime).getTime() + (boss.respawn_hours ?? 0) * 3600000);
        isAlive = spawnTime <= aliveNow;
      } else {
        isAlive = true; // No death records → initial spawn
      }
    } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
      const schedTz = getScheduleTz(boss, tz);
      let recentSlot: Date | null = null;
      for (let d = 0; d <= 7; d++) {
        const check = new Date(aliveNow);
        check.setDate(check.getDate() - d);
        for (const slot of boss.schedule) {
          const c = scheduleSlotToUTC(schedTz, check, slot.day, slot.time);
          if (c <= aliveNow && (!recentSlot || c > recentSlot)) recentSlot = c;
        }
      }
      if (recentSlot) {
        const nextSlot = findNextScheduleSlot(boss.schedule, new Date(recentSlot.getTime() + 60_000), schedTz);
        const aliveUntil = new Date(Math.min(
          nextSlot.getTime() - 3600_000,
          recentSlot.getTime() + 4 * 3600_000,
        ));
        const wasKilled = recentDeaths?.[0] && new Date(recentDeaths[0].death_time) >= recentSlot;
        isAlive = !wasKilled && aliveNow >= recentSlot && aliveNow < aliveUntil;
      }
    }

    if (!isAlive) {
      await cmdLog(cmd, "fail", `${boss.name} not alive`);
      discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("❌")}/@me`, {
        method: "PUT", headers: { Authorization: `Bot ${TOKEN}` },
      }).catch(() => {});
      return reply(`❌ **${boss.name}** is not currently alive. Use \`;forcespawn ${boss.name}\` first.`);
    }

    // Cooldown: prevent duplicate kills within 2 hours
    if (recentDeaths?.length) {
      const lastKill = new Date(recentDeaths[0].death_time);
      const cooldownEnd = new Date(lastKill.getTime() + 2 * 3600_000);
      if (new Date() < cooldownEnd) {
        const remaining = Math.ceil((cooldownEnd.getTime() - Date.now()) / 60_000);
        // React ❌ on user's message
        discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("❌")}/@me`, {
          method: "PUT", headers: { Authorization: `Bot ${TOKEN}` },
        }).catch(() => {});
        const killedAt = Math.floor(lastKill.getTime() / 1000);
        return reply(`⏳ **${boss.name}** has already been declared dead at <t:${killedAt}:t>. No duplicate kills allowed within the cooldown window.`);
      }
    }

    let deathTime = new Date();
    if (timeStr) {
      const [h, m] = timeStr.split(":").map(Number);
      if (h > 23 || m > 59) return reply("Invalid time.");

      // Interpret custom time in the server's timezone
      const now = new Date();
      const localDate = now.toLocaleDateString("en-CA", { timeZone: tz });
      const [y, mo, d] = localDate.split("-").map(Number);

      // Convert local time to UTC by computing the timezone offset.
      // Example: Asia/Manila (UTC+8) — 12:00 local → 04:00 UTC
      const testUtc = Date.UTC(y, mo - 1, d, h, m); // naive "h:m UTC"
      const testLocal = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date(testUtc));
      const [tlH, tlM] = testLocal.split(":").map(Number);
      const offsetMs = ((tlH - h) * 60 + (tlM - m)) * 60_000;
      deathTime = new Date(testUtc - offsetMs);

      // Smart default: if HH:MM is in the future today, assume yesterday.
      // A kill report is about the past — if the time hasn't happened yet, it must be yesterday.
      // Use "today"/"yesterday" keywords to override.
      if (explicitDay === "today") {
        // Keep today (no adjustment)
      } else if (explicitDay === "yesterday") {
        deathTime.setUTCDate(deathTime.getUTCDate() - 1);
      } else if (deathTime > now) {
        // Time is in the future today → assume yesterday
        deathTime.setUTCDate(deathTime.getUTCDate() - 1);
      }
      // else: time is in the past today → keep today
    }

    // Determine owner guild — use same logic as nextspawn (computeOwnerGuild)
    const serverGuilds = await supabaseQuery(`guilds?server_id=eq.${serverId}`);
    const allBossGuilds = await supabaseQuery(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode`);
    const serverGuildIds = new Set(serverGuilds.map((g: any) => g.id));
    const serverBossGuilds = allBossGuilds.filter((bg: any) => serverGuildIds.has(bg.guild_id));
    // Fetch previous death to determine current owner (must advance from the last kill)
    const prevDeaths = await supabaseQuery(`death_records?server_id=eq.${serverId}&boss_id=eq.${boss.id}&order=death_time.desc&limit=1`);
    const lastDeath = prevDeaths?.[0] ?? null;
    const gName = computeOwnerGuild(boss, serverBossGuilds, serverGuilds, lastDeath, deathTime, tz);
    const ownerGuildId = gName ? serverGuilds.find((g: any) => g.name === gName)?.id ?? null : null;

    await fetch(`${SUPABASE_URL}/rest/v1/death_records`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          boss_id: boss.id,
          server_id: serverId,
          death_time: deathTime.toISOString(),
          owner_guild_id: ownerGuildId,
        }),
      });

    // Delete any spawn override so the kill's countdown takes priority
    await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides?boss_id=eq.${boss.id}&server_id=eq.${serverId}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
    }).catch(() => {});

    // Increment rotation_counter atomically
    if (serverBossGuilds.some((bg: any) => bg.boss_id === boss.id)) {
      await fetch(`${SUPABASE_URL}/rest/v1/bosses?id=eq.${boss.id}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rotation_counter: (boss.rotation_counter ?? 0) + 1 }),
      });
    }

    const guildName = ownerGuildId ? serverGuilds.find((g: any) => g.id === ownerGuildId)?.name ?? "" : "";

    // Compute next spawn time
    let nextSpawnUnix = 0;
    if (boss.spawn_type === "fixed_hours") {
      nextSpawnUnix = Math.floor((deathTime.getTime() + (boss.respawn_hours ?? 0) * 3600_000) / 1000);
    } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
      const schedTz2 = getScheduleTz(boss, tz);
      const nextSlot = findNextScheduleSlot(boss.schedule, deathTime, schedTz2);
      nextSpawnUnix = Math.floor(nextSlot.getTime() / 1000);
    }
    const nextSpawnField = nextSpawnUnix > 0 ? { name: "Next Spawn", value: `<t:${nextSpawnUnix}:f>`, inline: true } : null;

    // Send kill notification to all linked Discord servers
    const deathTimeStr = deathTime.toLocaleString("en-US", { timeZone: tz || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    const killText = `💀 **${boss.name}** killed by **${guildName || author}** ${deathTimeStr}`;
    broadcastNotification(serverId, {}, channelId, killText);
    const unix = Math.floor(deathTime.getTime() / 1000);
    const replyFields: any[] = [
      { name: "Death Time", value: `<t:${unix}:f>`, inline: true },
      { name: "Recorded By", value: author, inline: true },
    ];
    if (nextSpawnField) replyFields.push(nextSpawnField);

    await cmdLog(cmd, "ok", `${boss.name} → ${guildName || "unknown"}`);

    return replyEmbed(
      `☠️ ${boss.name} Killed by ${guildName || author}`,
      "",
      0xef4444,
      replyFields,
    );
  }
}

// ── Notification Channel Registry ──────────────────────────

const sentNotifs = new Map<string, number>(); // dedup: "serverId-event-bossName" → timestamp

// Clean up stale dedup entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, ts] of sentNotifs) {
    if (ts < cutoff) sentNotifs.delete(key);
  }
}, 5 * 60_000);

// ── Shared: send notification embed to ALL linked Discord servers ─

// ── Thread Creation ──────────────────────────────────────

async function createEventThreads(
  serverId: string,
  bossName: string,
  ownerGuildName: string | undefined,
  spawnUnix: number,
): Promise<void> {
  if (!ownerGuildName) return;

  try {
    // Find the guild ID for the owner guild name
    const guildRows = await supabaseQuerySafe(
      `guilds?server_id=eq.${serverId}&name=eq.${encodeURIComponent(ownerGuildName)}&limit=1`
    );
    const ownerGuildId = guildRows?.[0]?.id;
    if (!ownerGuildId) return;

    // Fetch all discord_configs for this server that have thread config
    const configs = await supabaseQuerySafe(
      `discord_configs?raidscout_server_id=eq.${serverId}&select=id,thread_channel_id,thread_guilds`
    );

    for (const cfg of configs) {
      const channelId: string = cfg.thread_channel_id;
      const threadGuilds: string[] = cfg.thread_guilds || [];
      if (!channelId || !threadGuilds.includes(ownerGuildId)) continue;

      const tz = await resolveServerTimezone(serverId).catch(() => "Asia/Manila");
      const spawnDate = new Date(spawnUnix * 1000);
      const localeString = spawnDate.toLocaleString("en-US", {
        timeZone: tz,
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const threadName = `${bossName} — ${ownerGuildName} — ${localeString}`;

      // Check channel type (forum vs text)
      let isForum = false;
      try {
        const chRes = await discordFetch(`https://discord.com/api/v10/channels/${channelId}`, {
          headers: { Authorization: `Bot ${TOKEN}` },
        });
        if (chRes.ok) {
          const ch = await chRes.json();
          isForum = ch.type === 15; // GUILD_FORUM
        }
      } catch { /* assume text channel */ }

      try {
        const threadBody: any = {
          name: threadName,
          auto_archive_duration: 10080, // 7 days
        };

        if (isForum) {
          threadBody.message = { content: "." };
        } else {
          threadBody.type = 11; // GUILD_PUBLIC_THREAD
        }

        const res = await discordFetch(`https://discord.com/api/v10/channels/${channelId}/threads`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(threadBody),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          if (res.status === 403) {
            console.warn(`[thread] Missing permission in channel ${channelId} (403)`);
          } else {
            console.error(`[thread] Failed in ${channelId}: ${res.status} ${errText}`);
          }
          continue;
        }

        const thread = await res.json();
        // Send a minimal message into text channel threads
        if (!isForum) {
          await discordFetch(`https://discord.com/api/v10/channels/${thread.id}/messages`, {
            method: "POST",
            headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ content: "." }),
          });
        }

        console.log(`[thread] Created "${threadName}" in channel ${channelId} for ${ownerGuildName}`);
        await cmdLog("thread", "ok", `${bossName}→${ownerGuildName}`);
      } catch (err: any) {
        console.error(`[thread] Error for channel ${channelId}:`, err.message);
      }
    }

    // ── Assist threads ──
    try {
      // Look up boss_id from boss name
      const bossRows = await supabaseQuerySafe(
        `bosses?server_id=eq.${serverId}&name=eq.${encodeURIComponent(bossName)}&limit=1`
      );
      const bossId = bossRows?.[0]?.id;
      if (!bossId) return;

      // Find assists where this owner guild is the target
      const assistRows = await supabaseQuerySafe(
        `boss_assists?boss_id=eq.${bossId}&owner_guild_id=eq.${ownerGuildId}&select=assistant_guild_id`
      );
      if (!assistRows?.length) return;

      for (const assist of assistRows) {
        // Get assistant guild name
        const agRows = await supabaseQuerySafe(`guilds?id=eq.${assist.assistant_guild_id}&limit=1`);
        const assistantName: string = agRows?.[0]?.name;
        if (!assistantName) continue;

        // Create threads for each config that has thread_guilds including the assistant
        for (const cfg of configs) {
          const chId: string = cfg.thread_channel_id;
          const tg: string[] = cfg.thread_guilds || [];
          if (!chId || !tg.includes(assist.assistant_guild_id)) continue;

          const tz2 = await resolveServerTimezone(serverId).catch(() => "Asia/Manila");
          const sDate = new Date(spawnUnix * 1000);
          const ls2 = sDate.toLocaleString("en-US", { timeZone: tz2, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
          const aThreadName = `🔹 ${bossName} — Assist for ${assistantName} — ${ls2}`;

          let isForum2 = false;
          try {
            const chRes2 = await discordFetch(`https://discord.com/api/v10/channels/${chId}`, { headers: { Authorization: `Bot ${TOKEN}` } });
            if (chRes2.ok) { const ch2 = await chRes2.json(); isForum2 = ch2.type === 15; }
          } catch {}

          try {
            const tb2: any = { name: aThreadName, auto_archive_duration: 10080 };
            if (isForum2) { tb2.message = { content: "." }; } else { tb2.type = 11; }
            const res2 = await discordFetch(`https://discord.com/api/v10/channels/${chId}/threads`, {
              method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(tb2),
            });
            if (res2.ok) {
              const thread2 = await res2.json();
              if (!isForum2) {
                await discordFetch(`https://discord.com/api/v10/channels/${thread2.id}/messages`, {
                  method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ content: "." }),
                });
              }
              console.log(`[thread] Assist: "${aThreadName}" in channel ${chId}`);
            }
          } catch (err2: any) {
            console.error(`[thread] Assist error for channel ${chId}:`, err2.message);
          }
        }
      }
    } catch (assistErr: any) {
      console.error("[thread] Assist lookup failed:", assistErr.message);
    }
  } catch (err: any) {
    console.error("[thread] createEventThreads failed:", err.message);
  }
}

async function broadcastNotification(serverId: string, embed: any, skipChannelId?: string, textContent?: string): Promise<{ ok: boolean; skipped?: string }> {
  const rows = await supabaseQuerySafe(
    `discord_configs?raidscout_server_id=eq.${serverId}&select=notification_channel_id,discord_guild_id,notification_prefix`
  );
  const configs = (rows || []).filter((r: any) => r.notification_channel_id && r.notification_channel_id !== skipChannelId);
  if (configs.length === 0) {
    return { ok: false, skipped: "no channel set — use ;notifhere" };
  }

  const rawPrefix = await getNotifyPrefix(serverId);
  // Resolve @RoleName → <@&role_id> for each linked guild
  const guildRoleCache = new Map<string, Map<string, string>>();
  for (const cfg of configs) {
    const gId = cfg.discord_guild_id;
    if (!guildRoleCache.has(gId)) {
      guildRoleCache.set(gId, new Map());
      try {
        const rolesRes = await discordFetch(`https://discord.com/api/v10/guilds/${gId}/roles`, {
          headers: { Authorization: `Bot ${TOKEN}` },
        });
        if (rolesRes.ok) {
          const roles = await rolesRes.json();
          for (const role of roles) {
            guildRoleCache.get(gId)!.set(role.name.toLowerCase(), role.id);
          }
        }
      } catch { /* skip */ }
    }
  }

  for (const cfg of configs) {
    let prefix = cfg.notification_prefix || rawPrefix;
    const cache = guildRoleCache.get(cfg.discord_guild_id);
    if (cache) {
      prefix = prefix.replace(/@(\S+)/g, (_, name) => {
        const id = cache.get(name.toLowerCase());
        return id ? `<@&${id}>` : `@${name}`;
      });
    }
    const body: any = { allowed_mentions: { parse: ["everyone", "roles"] } };
    if (textContent) {
      body.content = prefix ? `${prefix} ${textContent}` : textContent;
    } else {
      body.content = prefix || undefined;
      body.embeds = [embed];
    }
    const discordRes = await discordFetch(`https://discord.com/api/v10/channels/${cfg.notification_channel_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!discordRes.ok) {
      const errText = await discordRes.text().catch(() => "");
      console.error(`Discord send failed (${cfg.notification_channel_id}): ${discordRes.status} ${errText}`);
    } else {
      const preview = textContent || (embed?.embeds?.[0]?.title) || "embed";
      console.log(`[notif] Sent to ${cfg.notification_channel_id}: ${preview}`);
    }
  }
  return { ok: true };
}

// ── HTTP Server (web app → bot notifications) ─────────────
import { createServer } from "http";

const NOTIFY_PORT = parseInt(process.env.PORT || process.env.NOTIFY_PORT || "3003");
const BOT_START_TIME = Date.now();
let discordConnected = false;
let lastSpawnCronTick = 0;
let lastSpawnCronServers = 0;
let lastSpawnCronBosses = 0;

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ── /status ──────────────────────────────────────────
  if (req.method === "GET" && req.url === "/status") {
    const uptime = Math.floor((Date.now() - BOT_START_TIME) / 1000);
    const mem = process.memoryUsage();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      uptime_seconds: uptime,
      uptime_display: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`,
      discord_connected: discordConnected,
      spawn_cron: {
        last_tick_iso: lastSpawnCronTick ? new Date(lastSpawnCronTick).toISOString() : null,
        last_tick_seconds_ago: lastSpawnCronTick ? Math.floor((Date.now() - lastSpawnCronTick) / 1000) : null,
        servers_checked: lastSpawnCronServers,
        bosses_checked: lastSpawnCronBosses,
      },
      memory_mb: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10,
      memory_total_mb: Math.round(mem.heapTotal / 1024 / 1024 * 10) / 10,
      node_version: process.version,
      region: process.env.FLY_REGION || "unknown",
    }));
    return;
  }

  // ── /logs ───────────────────────────────────────────
  if (req.method === "GET" && req.url?.startsWith("/logs")) {
    const url = new URL(req.url, `http://localhost:${NOTIFY_PORT}`);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const level = url.searchParams.get("level"); // info, warn, error
    let logs = [...LOG_BUFFER].reverse(); // newest first
    if (level) logs = logs.filter(l => l.level === level);
    logs = logs.slice(0, Math.min(limit, 200));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, count: logs.length, total: LOG_BUFFER.length, logs }));
    return;
  }

  // ── /test-thread (dev only) ──────────────────────────
  if (req.method === "POST" && req.url === "/test-thread") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { server_id, boss_name, guild_name } = JSON.parse(body);
        const spawnUnix = Math.floor(Date.now() / 1000) + 300;
        await createEventThreads(server_id, boss_name, guild_name, spawnUnix);
        res.writeHead(200); res.end(JSON.stringify({ ok: true, tested: { boss_name, guild_name } }));
      } catch (err: any) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/notify") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { server_id, event, boss_name, guild_name, activity_name, parties, recorded_by } = JSON.parse(body);

        console.log(`[notify] web→bot: ${event} ${boss_name || activity_name || ""} ${guild_name ? `(${guild_name})` : ""}`);

        // Dedup: skip duplicate notifs within 30s
        if (boss_name && event) {
          const dedupKey = `${server_id}-${event}-${boss_name}`;
          const now = Date.now();
          const last = sentNotifs.get(dedupKey);
          if (last && now - last < 30_000) {
            res.writeHead(200); res.end(JSON.stringify({ skipped: "dedup" }));
            return;
          }
          sentNotifs.set(dedupKey, now);
        }

        let result;
        if (event === "boss_died" && boss_name) {
          const tz = await resolveServerTimezone(server_id).catch(() => "Asia/Manila");
          const timeStr = new Date().toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
          const killText = `💀 **${boss_name}** killed by **${guild_name || recorded_by || "Unknown"}** ${timeStr}`;
          result = await broadcastNotification(server_id, {}, undefined, killText);
        } else if (event === "parties_announced" && activity_name && parties) {
          const embed = {
            title: `📋 ${activity_name} — Party Assignments`,
            fields: parties.map((p: any) => ({
              name: `Party ${p.party_number}`,
              value: p.members?.length > 0 ? p.members.join(", ") : "No members assigned",
              inline: false,
            })),
            color: 0x3b82f6,
            footer: { text: "Powered by RaidScout" },
          };
          result = await broadcastNotification(server_id, embed);
        } else if (event === "boss_spawning" && boss_name) {
          const tz = await resolveServerTimezone(server_id).catch(() => "Asia/Manila");
          const timeStr = new Date(Date.now() + 300000).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
          const text = `⚠️ **${boss_name}** spawning in 5 min — **${guild_name}** ${timeStr}`;
          result = await broadcastNotification(server_id, {}, undefined, text);
        } else if (event === "boss_spawned" && boss_name) {
          const tz = await resolveServerTimezone(server_id).catch(() => "Asia/Manila");
          const timeStr = new Date().toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
          const text = `🟢 **${boss_name}** has spawned — **${guild_name}** ${timeStr}`;
          result = await broadcastNotification(server_id, {}, undefined, text);
        } else {
          res.writeHead(400); res.end(JSON.stringify({ error: "Invalid event" }));
          return;
        }

        res.writeHead(200); res.end(JSON.stringify(result));
      } catch (err: any) {
        console.error("Notify error:", err.message);
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end("Not found");
}).listen(NOTIFY_PORT, () => {
  console.log(`Notify HTTP server on port ${NOTIFY_PORT}`);
});

// ── Spawn Cron: auto-announce boss_spawning / boss_spawned ─

let cronStarted = false;

async function runSpawnCron() {
  try {
    lastSpawnCronTick = Date.now();
    // Get all unique servers linked via discord_configs
    const configs = await supabaseQuerySafe("discord_configs?select=raidscout_server_id&order=created_at");
    const serverIds = [...new Set((configs || []).map((c: any) => c.raidscout_server_id))];
    lastSpawnCronServers = serverIds.length;
    let bossCount = 0;
    if (serverIds.length === 0) return;

    // Pre-fetch maintenance status for all linked servers (batch query)
    const maintRows = await supabaseQuerySafe(`app_settings?key=eq.maintenance_mode&select=server_id,value`);
    const maintenanceServers = new Set<string>();
    let globalMaintenance = false;
    for (const row of (maintRows || [])) {
      if (row.value === "true") {
        if (row.server_id) {
          maintenanceServers.add(row.server_id);
        } else {
          globalMaintenance = true;
        }
      }
    }

    const now = Date.now();
    const nowUnix = Math.floor(now / 1000);

    // ── Batched fetch: ~5 calls per chunk, not per server ──
    const CHUNK_SIZE = 200;
    const serverChunks: string[][] = [];
    for (let i = 0; i < serverIds.length; i += CHUNK_SIZE) {
      serverChunks.push(serverIds.slice(i, i + CHUNK_SIZE));
    }

    const allBosses: any[] = [];
    const allDeaths: any[] = [];
    const allGuilds: any[] = [];
    const allBossGuilds: any[] = [];
    const serverStatusMap: Record<string, any> = {};

    for (const chunk of serverChunks) {
      const ids = chunk.map(encodeURIComponent).join(",");
      const [bosses, deaths, guilds, bg] = await Promise.all([
        supabaseQuerySafe(`bosses?server_id=in.(${ids})&order=name`),
        supabaseQuerySafe(`death_records?server_id=in.(${ids})&order=death_time.desc&limit=2000`),
        supabaseQuerySafe(`guilds?server_id=in.(${ids})`),
        supabaseQuerySafe(`boss_guilds?select=*`),
      ]);
      allBosses.push(...(bosses || []));
      allDeaths.push(...(deaths || []));
      allGuilds.push(...(guilds || []));
      allBossGuilds.push(...(bg || []));

      const statusRows = await supabaseQuerySafe(`servers?select=id,deleted_at,timezone&id=in.(${ids})`);
      for (const s of (statusRows || [])) {
        serverStatusMap[s.id] = s;
      }
    }

    // Group by server_id in memory
    const bossesByServer = new Map<string, any[]>();
    for (const b of allBosses) {
      if (!bossesByServer.has(b.server_id)) bossesByServer.set(b.server_id, []);
      bossesByServer.get(b.server_id)!.push(b);
    }

    const deathsByBoss = new Map<string, any[]>();
    for (const d of allDeaths) {
      if (!deathsByBoss.has(d.boss_id)) deathsByBoss.set(d.boss_id, []);
      deathsByBoss.get(d.boss_id)!.push(d);
    }

    const guildsByServer = new Map<string, any[]>();
    for (const g of allGuilds) {
      if (!guildsByServer.has(g.server_id)) guildsByServer.set(g.server_id, []);
      guildsByServer.get(g.server_id)!.push(g);
    }

    for (const serverId of serverIds) {
      try {
        const sv = serverStatusMap[serverId];
        if (sv?.deleted_at) continue;

        // Skip spawn cron for servers in maintenance mode
        if (globalMaintenance || maintenanceServers.has(serverId)) {
          continue;
        }

        const bosses = bossesByServer.get(serverId) || [];
        if (!bosses.length) continue;

        const guilds = guildsByServer.get(serverId) || [];
        const serverGuildIds = new Set(guilds.map((g: any) => g.id));
        const serverBossGuilds = allBossGuilds.filter((bg: any) => serverGuildIds.has(bg.guild_id));

        const tz = sv?.timezone || "UTC";

        for (const boss of bosses) {
          bossCount++;
          const allBossDeaths = deathsByBoss.get(boss.id) || [];
          const lastDeath = allBossDeaths
            .filter((d: any) => !d.is_initial_spawn)
            .sort((a: any, b: any) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];

          // Calculate next spawn time
          let spawnTime: Date;
          if (boss.spawn_type === "fixed_hours") {
            spawnTime = lastDeath
              ? addHours(new Date(lastDeath.death_time), boss.respawn_hours ?? 0)
              : new Date(); // no death record → assume alive now
          } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
            const baseTime = lastDeath ? new Date(lastDeath.death_time) : new Date();
            const schedTz = getScheduleTz(boss, tz);
            spawnTime = findNextScheduleSlot(boss.schedule, baseTime, schedTz);
          } else {
            continue;
          }

          const spawnUnix = Math.floor(spawnTime.getTime() / 1000);
          const secsUntilSpawn = spawnUnix - nowUnix;

          // ── 5-minute warning ──
          if (secsUntilSpawn > 0 && secsUntilSpawn <= 300) {
            const dedupKey = `${serverId}-${boss.id}-boss_spawning-${spawnUnix}`;
            const existing = await supabaseQuerySafe(
              `spawn_notifications?server_id=eq.${serverId}&boss_id=eq.${boss.id}&event=eq.boss_spawning&spawn_timestamp=eq.${spawnUnix}&limit=1`
            );
            if (!existing?.length) {
              const guildName = computeOwnerGuild(boss, serverBossGuilds, guilds, lastDeath, spawnTime, tz) || "";
              const timeStr = spawnTime.toLocaleString("en-US", { timeZone: tz || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
              const text = `⚠️ **${boss.name}** spawning in 5 min — **${guildName}** ${timeStr}`;
              await broadcastNotification(serverId, {}, undefined, text);
              // Auto-create thread for this spawn
              createEventThreads(serverId, boss.name, guildName || undefined, spawnUnix).catch((err: any) =>
                console.error(`[thread] createEventThreads error:`, err.message)
              );
              // Record sent notification
              await fetch(`${SUPABASE_URL}/rest/v1/spawn_notifications`, {
                method: "POST",
                headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json", Prefer: "return=minimal" },
                body: JSON.stringify({ server_id: serverId, boss_id: boss.id, event: "boss_spawning", spawn_timestamp: spawnUnix }),
              }).catch((err: any) => console.error("spawn_notifications insert failed (spawning):", err?.message ?? err));
            }
          }

          // ── Spawning now ──
          if (secsUntilSpawn <= 0 && secsUntilSpawn >= -60) {
            const dedupKey = `${serverId}-${boss.id}-boss_spawned-${spawnUnix}`;
            const existing = await supabaseQuerySafe(
              `spawn_notifications?server_id=eq.${serverId}&boss_id=eq.${boss.id}&event=eq.boss_spawned&spawn_timestamp=eq.${spawnUnix}&limit=1`
            );
            if (!existing?.length) {
              const guildName = computeOwnerGuild(boss, serverBossGuilds, guilds, lastDeath, spawnTime, tz) || "";
              const timeStr = new Date().toLocaleString("en-US", { timeZone: tz || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
              const text = `🟢 **${boss.name}** has spawned — **${guildName}** ${timeStr}`;
              await broadcastNotification(serverId, {}, undefined, text);
              await fetch(`${SUPABASE_URL}/rest/v1/spawn_notifications`, {
                method: "POST",
                headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json", Prefer: "return=minimal" },
                body: JSON.stringify({ server_id: serverId, boss_id: boss.id, event: "boss_spawned", spawn_timestamp: spawnUnix }),
              }).catch((err: any) => console.error("spawn_notifications insert failed (spawned):", err?.message ?? err));
            }
          }
        }
        lastSpawnCronBosses = bossCount;
      } catch (serverErr: any) {
        console.error(`Spawn cron error for server ${serverId}:`, serverErr.message);
        // Continue with next server
      }
    }

    // Cleanup old dedup rows (>7 days) — once per tick is plenty
    try {
      const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/spawn_notifications?created_at=lt.${encodeURIComponent(cutoff)}`, {
        method: "DELETE",
        headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
      }).catch(() => {});
    } catch { /* cleanup is best-effort */ }
  } catch (err: any) {
    console.error("Spawn cron tick failed:", err.message);
  }
}

if (!cronStarted) {
  setInterval(runSpawnCron, 30_000);
  cronStarted = true;
  console.log("Spawn cron started (30s tick)");
}

// ── Start ──────────────────────────────────────────────────

console.log("RaidScout Discord Bot starting...");
connect().catch(console.error);
