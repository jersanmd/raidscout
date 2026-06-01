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
  const bgs = bossGuilds.filter((bg: any) => bg.boss_id === boss.id);
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
    .filter((bg: any) => bg.sort_order !== null && bg.mode !== "daily")
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (rotationEntries.length > 0) {
    const counter = boss.rotation_counter ?? 1;
    const idx = safeMod(counter - 1, rotationEntries.length);
    return guilds.find((g: any) => g.id === rotationEntries[idx].guild_id)?.name;
  }

  return undefined;
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
    const gwRes = await fetch("https://discord.com/api/v10/gateway/bot", {
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
    }

    // MESSAGE_CREATE — handle commands
    if (t === "MESSAGE_CREATE") {
      handleMessage(d).catch(console.error);
    }
  });

  ws.on("close", (code) => {
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

  await fetch(`https://discord.com/api/v10/channels/${targetChannel}/messages`, {
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
            value: "Type `!notifhere` in a channel to receive boss kill/spawn alerts there. Type `!cmdhere` to restrict commands to a specific channel.",
          },
          {
            name: "3️⃣ Try a command",
            value: "`!list` — See all bosses\n`!nextspawn` — Upcoming spawns in 24h\n`!killed <boss>` — Record a kill\n`!commands` — Full command list",
          },
          {
            name: "💡 Multiple RaidScout servers?",
            value: "If this Discord server tracks bosses for multiple games, each RaidScout server can use a different command prefix (e.g. `!` for Lineage II, `$` for WoW). Set the prefix when linking in Server Settings.",
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

  // Valid commands that should trigger ✅ reaction
  const validCmds = new Set(["list","nextspawn","spawn","killed","commands","help","notifhere","cmdhere"]);
  if (validCmds.has(cmd)) {
    fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("✅")}/@me`, {
      method: "PUT",
      headers: { Authorization: `Bot ${TOKEN}` },
    }).catch(() => {});
  }

  // Check command channel restriction (if set, ignore commands from other channels)
  if (matchedPrefix) {
    const cfgRows = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=command_channel_id`);
    const cmdChannel = cfgRows?.[0]?.command_channel_id;
    if (cmdChannel && channelId !== cmdChannel && cmd !== "cmdhere" && cmd !== "notifhere") return;
  }

  async function reply(text: string) {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: text }),
    });
  }

  async function replyEmbed(title: string, desc: string, color: number, fields?: any[]) {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
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
  }

  // ── list ─────────────────────────────────────────────
  if (cmd === "list") {
    const serverId = await resolveServerId(guildId, matchedPrefix);
    if (!serverId) return reply("⚠️ This Discord server is not linked to RaidScout. An admin needs to go to **Server Settings → Integrations** on the RaidScout web app and link this Discord server.");
    const bosses = await supabaseQuery(`bosses?server_id=eq.${serverId}&order=name`);
    if (!bosses?.length) return reply("No bosses found.");
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
      await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
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
  }

  // ── notifhere ────────────────────────────────────────
  if (cmd === "notifhere") {
    const serverId = await resolveServerId(guildId, matchedPrefix);
    if (!serverId) return reply("⚠️ This Discord server is not linked to RaidScout. An admin needs to go to **Server Settings → Integrations** on the RaidScout web app and link this Discord server.");
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
    const serverId = await resolveServerId(guildId, matchedPrefix);
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
        { name: `${p}killed <boss>${aliasNote("killed")}`, value: `Record a boss kill right now (e.g. \`${p}killed Venatus\`)`, inline: false },
        { name: `${p}killed <boss> HH:MM`, value: "Record a kill at a custom time. Auto: if the time already passed today → today. If it hasn't happened yet → yesterday.", inline: false },
        { name: `${p}killed <boss> HH:MM today`, value: "Force today's date even if the time is in the future", inline: false },
        { name: `${p}killed <boss> HH:MM yesterday`, value: "Force yesterday's date even if the time already passed today", inline: false },
        { name: `${p}commands${aliasNote("commands")}`, value: "Show this help message", inline: false },
        { name: `${p}notifhere${aliasNote("notifhere")}`, value: "Set this channel for boss kill & spawn notifications", inline: false },
        { name: `${p}cmdhere${aliasNote("cmdhere")}`, value: "Restrict bot commands to this channel only", inline: false },
      ],
    );
  }

  // ── nextspawn [boss] ─────────────────────────────────
  if (cmd === "nextspawn" || cmd === "spawn") {
    const serverId = await resolveServerId(guildId, matchedPrefix);
    if (!serverId) return reply("⚠️ This Discord server is not linked to RaidScout. An admin needs to go to **Server Settings → Integrations** on the RaidScout web app and link this Discord server.");

    const filter = args[1];
    const tz = await resolveServerTimezone(serverId);
    const [bosses, deaths, guilds] = await Promise.all([
      supabaseQuery(`bosses?server_id=eq.${serverId}&order=name`),
      supabaseQuery(`death_records?server_id=eq.${serverId}&order=death_time.desc&limit=200`),
      supabaseQuery(`guilds?server_id=eq.${serverId}`),
    ]);

    const now = new Date();
    const cutoff = addHours(now, 24);
    const upcoming: { name: string; time: string; unix: number; guild: string }[] = [];

    const bossGuilds = await supabaseQuery(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode`);
    // Filter to only this server's guilds (boss_guilds has no server_id column)
    const serverGuildIds = new Set(guilds.map((g: any) => g.id));
    const serverBossGuilds = bossGuilds.filter((bg: any) => serverGuildIds.has(bg.guild_id));
    for (const boss of bosses) {
      if (filter && !boss.name.toLowerCase().includes(filter.toLowerCase())) continue;

      const lastDeath = deaths
        .filter((d: any) => d.boss_id === boss.id && !d.is_initial_spawn)
        .sort((a: any, b: any) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];

      let spawn: Date;
      if (boss.spawn_type === "fixed_hours") {
        spawn = lastDeath ? addHours(new Date(lastDeath.death_time), boss.respawn_hours ?? 0) : now;
        if (spawn <= now && now <= addHours(spawn, 24)) spawn = now;
      } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
        // Find most recent past schedule slot (in server timezone → UTC)
        let recentSlot: { day: number; time: string } | null = null;
        let recentTime: Date | null = null;
        for (let d = 0; d <= 7; d++) {
          const check = new Date(now);
          check.setDate(check.getDate() - d);
          for (const slot of boss.schedule) {
            const c = scheduleSlotToUTC(tz, check, slot.day, slot.time);
            if (c <= now && (!recentTime || c > recentTime)) {
              recentTime = c;
              recentSlot = slot;
            }
          }
        }

        if (!recentSlot || !recentTime) {
          // No past slot found — find next future slot
          spawn = findNextScheduleSlot(boss.schedule, now, tz);
        } else {
          // Find next schedule slot after this one (for alive-window calculation)
          const nextSlotTime = findNextScheduleSlot(boss.schedule, new Date(recentTime.getTime() + 60_000), tz);
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
            spawn = findNextScheduleSlot(boss.schedule, now, tz);
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

    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: filter ? `${filter} Spawn` : "📋 Upcoming Boss Spawns (24h)",
          description: desc,
          color: 0x8b5cf6,
          footer: { text: "Powered by RaidScout" },
        }],
      }),
    }).then(async (res) => {
      // Message stored for reference; underline feature removed
    });
  }

  // ── killed <boss> [HH:MM] [yesterday|today] ──────────
  if (cmd === "killed" || cmd === "kill") {
    const serverId = await resolveServerId(guildId, matchedPrefix);
    if (!serverId) return reply("⚠️ This Discord server is not linked to RaidScout. An admin needs to go to **Server Settings → Integrations** on the RaidScout web app and link this Discord server.");

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

    if (!bossName) return reply("Usage: `!kill Boss Name [HH:MM] [yesterday|today]`");

    const bosses = await supabaseQuery(
      `bosses?server_id=eq.${serverId}&name=ilike.${encodeURIComponent("%" + bossName + "%")}`,
    );
    if (!bosses?.length) return reply(`Boss **${bossName}** not found.`);
    const boss = bosses[0];

    // Cooldown: prevent duplicate kills within 2 hours
    const recentDeaths = await supabaseQuery(
      `death_records?server_id=eq.${serverId}&boss_id=eq.${boss.id}&order=death_time.desc&limit=1`
    );
    if (recentDeaths?.length) {
      const lastKill = new Date(recentDeaths[0].death_time);
      const cooldownEnd = new Date(lastKill.getTime() + 2 * 3600_000);
      if (new Date() < cooldownEnd) {
        const remaining = Math.ceil((cooldownEnd.getTime() - Date.now()) / 60_000);
        // React ❌ on user's message
        fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("❌")}/@me`, {
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
      const tz = await resolveServerTimezone(serverId);
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
    const tz = await resolveServerTimezone(serverId);
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
      const nextSlot = findNextScheduleSlot(boss.schedule, deathTime, tz);
      nextSpawnUnix = Math.floor(nextSlot.getTime() / 1000);
    }
    const nextSpawnField = nextSpawnUnix > 0 ? { name: "Next Spawn", value: `<t:${nextSpawnUnix}:f>`, inline: true } : null;

    // Send kill notification to all linked Discord servers
    const killUnix = Math.floor(deathTime.getTime() / 1000);
    const killText = `☠️ **${boss.name}** Killed by **${guildName || author}** — <t:${killUnix}:f>${nextSpawnUnix > 0 ? `\nNext Spawn: <t:${nextSpawnUnix}:f>` : ""}`;
    broadcastNotification(serverId, {}, channelId, killText);
    const unix = Math.floor(deathTime.getTime() / 1000);
    const replyFields: any[] = [
      { name: "Death Time", value: `<t:${unix}:f>`, inline: true },
      { name: "Recorded By", value: author, inline: true },
    ];
    if (nextSpawnField) replyFields.push(nextSpawnField);

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

async function broadcastNotification(serverId: string, embed: any, skipChannelId?: string, textContent?: string): Promise<{ ok: boolean; skipped?: string }> {
  const rows = await supabaseQuerySafe(
    `discord_configs?raidscout_server_id=eq.${serverId}&select=notification_channel_id,discord_guild_id`
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
        const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${gId}/roles`, {
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
    let prefix = rawPrefix;
    const cache = guildRoleCache.get(cfg.discord_guild_id);
    if (cache) {
      prefix = prefix.replace(/@(\S+)/g, (_, name) => {
        const id = cache.get(name.toLowerCase());
        return id ? `<@&${id}>` : `@${name}`;
      });
    }
    const body: any = { allowed_mentions: { parse: ["everyone"] } };
    if (textContent) {
      body.content = (prefix || "") + textContent;
    } else {
      body.content = prefix || undefined;
      body.embeds = [embed];
    }
    const discordRes = await fetch(`https://discord.com/api/v10/channels/${cfg.notification_channel_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!discordRes.ok) {
      const errText = await discordRes.text().catch(() => "");
      console.error(`Discord send failed (${cfg.notification_channel_id}): ${discordRes.status} ${errText}`);
    }
  }
  return { ok: true };
}

// ── HTTP Server (web app → bot notifications) ─────────────
import { createServer } from "http";

const NOTIFY_PORT = parseInt(process.env.PORT || process.env.NOTIFY_PORT || "3003");

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "POST" && req.url === "/notify") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { server_id, event, boss_name, guild_name, activity_name, parties, recorded_by } = JSON.parse(body);

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
          // Compute next spawn time
          let nextSpawnField = "";
          try {
            const bossRows = await supabaseQuerySafe(`bosses?server_id=eq.${server_id}&name=eq.${encodeURIComponent(boss_name)}&limit=1`);
            if (bossRows?.[0]) {
              const boss = bossRows[0];
              const deathRows = await supabaseQuerySafe(`death_records?server_id=eq.${server_id}&boss_id=eq.${boss.id}&order=death_time.desc&limit=1`);
              const lastDeath = deathRows?.[0];
              const now = new Date();
              let spawn: Date;
              if (boss.spawn_type === "fixed_hours") {
                spawn = lastDeath ? addHours(new Date(lastDeath.death_time), boss.respawn_hours ?? 0) : now;
              } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
                const tz = await resolveServerTimezone(server_id);
                spawn = findNextScheduleSlot(boss.schedule, now, tz);
              } else { spawn = now; }
              if (spawn > now) {
                nextSpawnField = `\nNext Spawn: <t:${Math.floor(spawn.getTime() / 1000)}:f>`;
              }
            }
          } catch {}
          const killText = `☠️ **${boss_name}** Killed by **${guild_name || recorded_by || "Unknown"}** — <t:${Math.floor(Date.now() / 1000)}:f>${nextSpawnField}`;
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
        } else {
          // Spawn events are handled by cron, not this endpoint
          res.writeHead(200); res.end(JSON.stringify({ skipped: "handled by cron or invalid event" }));
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
    // Get all unique servers linked via discord_configs
    const configs = await supabaseQuerySafe("discord_configs?select=raidscout_server_id&order=created_at");
    const serverIds = [...new Set((configs || []).map((c: any) => c.raidscout_server_id))];
    if (serverIds.length === 0) return;

    const now = Date.now();
    const nowUnix = Math.floor(now / 1000);

    for (const serverId of serverIds) {
      try {
        // Skip soft-deleted servers
        const serverRows = await supabaseQuerySafe(`servers?select=deleted_at&id=eq.${serverId}&limit=1`);
        if (serverRows?.[0]?.deleted_at) continue;

        // Fetch bosses, latest death per boss, guilds, and boss_guilds for this server
        const [bosses, allDeaths, guilds, bossGuilds] = await Promise.all([
          supabaseQuerySafe(`bosses?server_id=eq.${serverId}&order=name`),
          supabaseQuerySafe(`death_records?server_id=eq.${serverId}&order=death_time.desc&limit=500`),
          supabaseQuerySafe(`guilds?server_id=eq.${serverId}`),
          supabaseQuerySafe(`boss_guilds?select=*`),
        ]);

        if (!bosses?.length) continue;

        // Filter boss_guilds to this server's guilds
        const serverGuildIds = new Set((guilds || []).map((g: any) => g.id));
        const serverBossGuilds = (bossGuilds || []).filter((bg: any) => serverGuildIds.has(bg.guild_id));

        const tz = await resolveServerTimezone(serverId);

        for (const boss of bosses) {
          // Get latest non-initial death record for this boss
          const lastDeath = (allDeaths || [])
            .filter((d: any) => d.boss_id === boss.id && !d.is_initial_spawn)
            .sort((a: any, b: any) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];

          // Calculate next spawn time
          let spawnTime: Date;
          if (boss.spawn_type === "fixed_hours") {
            spawnTime = lastDeath
              ? addHours(new Date(lastDeath.death_time), boss.respawn_hours ?? 0)
              : new Date(); // no death record → assume alive now
          } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
            const baseTime = lastDeath ? new Date(lastDeath.death_time) : new Date();
            spawnTime = findNextScheduleSlot(boss.schedule, baseTime, tz);
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
              const text = `⚠️ **${boss.name}** will spawn in ~5 minutes!\n${guildName ? `**${guildName}** — ` : ""}<t:${spawnUnix}:f>`;
              await broadcastNotification(serverId, {}, undefined, text);
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
              const text = `⚠️ **${boss.name}** has spawned!\n${guildName ? `**${guildName}** — ` : ""}<t:${spawnUnix}:f>`;
              await broadcastNotification(serverId, {}, undefined, text);
              await fetch(`${SUPABASE_URL}/rest/v1/spawn_notifications`, {
                method: "POST",
                headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json", Prefer: "return=minimal" },
                body: JSON.stringify({ server_id: serverId, boss_id: boss.id, event: "boss_spawned", spawn_timestamp: spawnUnix }),
              }).catch((err: any) => console.error("spawn_notifications insert failed (spawned):", err?.message ?? err));
            }
          }
        }
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
