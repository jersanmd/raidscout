// ── Discord Gateway Bot ─────────────────────────────────────
// Standalone bot that listens for !spawn and !kill chat commands.
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
if (!SUPABASE_URL) { console.error("Set SUPABASE_URL"); process.exit(1); }
if (!SUPABASE_KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

// ── Supabase REST helpers ──────────────────────────────────

async function supabaseQuery(path: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
  });
  return res.json();
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
  return res.json();
}

async function resolveServerId(guildId: string): Promise<string | null> {
  const rows = await supabaseQuery(
    `discord_configs?discord_guild_id=eq.${guildId}&select=raidscout_server_id`,
  );
  return rows?.[0]?.raidscout_server_id ?? null;
}

async function resolveServerTimezone(serverId: string): Promise<string> {
  const rows = await supabaseQuery(`servers?select=timezone&id=eq.${serverId}`);
  return rows?.[0]?.timezone || "UTC";
}

// ── Spawn helpers ──────────────────────────────────────────

function addHours(d: Date, h: number) { return new Date(d.getTime() + h * 3600_000); }

// ── WebSocket Gateway ──────────────────────────────────────

async function connect() {
  // Get gateway URL
  const gwRes = await fetch("https://discord.com/api/v10/gateway/bot", {
    headers: { Authorization: `Bot ${TOKEN}` },
  });
  const gwData = await gwRes.json() as any;
  const gatewayUrl = gwData.url + "/?v=10&encoding=json";

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
    const msg = JSON.parse(raw.toString());
    const { op, d, t, s } = msg;

    if (s) seq = s;

    // Hello — start heartbeat
    if (op === 10) {
      heartbeatInterval = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: seq }));
      }, d.heartbeat_interval);
      console.log("Bot is online!");
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

// ── Command Handler ────────────────────────────────────────

async function handleMessage(msg: any) {
  const content: string = msg.content?.trim() ?? "";
  const channelId: string = msg.channel_id;
  const guildId: string = msg.guild_id;
  const author: string = msg.author?.username ?? "unknown";

  if (!content.startsWith("!")) return;
  const args = content.slice(1).split(/\s+/);
  const cmd = args[0]?.toLowerCase();

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
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [{ title, description: desc, color, fields, footer: { text: "Powered by RaidScout" } }],
      }),
    });
  }

  // ── !list ────────────────────────────────────────────
  if (cmd === "list") {
    const serverId = await resolveServerId(guildId);
    if (!serverId) return reply("This server is not linked to RaidScout.");
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

  // ── !commands ─────────────────────────────────────────
  if (cmd === "commands" || cmd === "help") {
    return replyEmbed(
      "📋 RaidScout Bot Commands",
      "Prefix all commands with `!`",
      0x8b5cf6,
      [
        { name: "!list", value: "Show all boss names", inline: false },
        { name: "!spawn", value: "List boss spawns in the next 24 hours", inline: false },
        { name: "!spawn <boss>", value: "Check spawn for a specific boss (e.g. `!spawn Venatus`)", inline: false },
        { name: "!kill <boss>", value: "Record a boss kill right now (e.g. `!kill Venatus`)", inline: false },
        { name: "!kill <boss> HH:MM", value: "Record a kill at a specific time (defaults to yesterday)", inline: false },
        { name: "!kill <boss> HH:MM today", value: "Record a kill at a specific time today", inline: false },
        { name: "!commands", value: "Show this help message", inline: false },
      ],
    );
  }

  // ── !spawn [boss] ──────────────────────────────────────
  if (cmd === "spawn") {
    const serverId = await resolveServerId(guildId);
    if (!serverId) return reply("This server is not linked to RaidScout.");

    const filter = args[1];
    const [bosses, deaths, guilds] = await Promise.all([
      supabaseQuery(`bosses?server_id=eq.${serverId}&order=name`),
      supabaseQuery(`death_records?server_id=eq.${serverId}&order=death_time.desc&limit=200`),
      supabaseQuery(`guilds?server_id=eq.${serverId}`),
    ]);

    const now = new Date();
    const cutoff = addHours(now, 24);
    const upcoming: { name: string; time: string; unix: number; guild: string }[] = [];

    const bossGuilds = await supabaseQuery(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode`);

    for (const boss of bosses) {
      if (filter && boss.name.toLowerCase() !== filter.toLowerCase()) continue;

      const lastDeath = deaths
        .filter((d: any) => d.boss_id === boss.id && !d.is_initial_spawn)
        .sort((a: any, b: any) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];

      let spawn: Date;
      if (boss.spawn_type === "fixed_hours") {
        spawn = lastDeath ? addHours(new Date(lastDeath.death_time), boss.respawn_hours ?? 0) : now;
        if (spawn <= now && now <= addHours(spawn, 24)) spawn = now;
      } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
        let earliest: Date | null = null;
        for (let d = 0; d <= 7; d++) {
          const check = new Date(now);
          check.setDate(check.getDate() + d);
          for (const slot of boss.schedule) {
            if (slot.day !== check.getDay()) continue;
            const [h, m] = slot.time.split(":").map(Number);
            const c = new Date(check.getFullYear(), check.getMonth(), check.getDate(), h, m);
            if (c > now && (!earliest || c < earliest)) earliest = c;
          }
        }
        spawn = earliest ?? now;
      } else continue;

      if (spawn.getTime() <= cutoff.getTime()) {
        // Compute owner guild
        const bgs = bossGuilds.filter((bg: any) => bg.boss_id === boss.id);
        let gName = "";
        if (bgs.length > 0) {
          const dow = spawn.getDay();
          const se = bgs.find((bg: any) => bg.day_of_week === dow);
          if (se) {
            gName = guilds.find((g: any) => g.id === se.guild_id)?.name ?? "";
          } else {
            const re = bgs.filter((bg: any) => bg.sort_order !== null).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            if (re.length > 0) {
              const counter = boss.rotation_counter ?? 1;
              const idx = ((counter - 1) % re.length + re.length) % re.length;
              gName = guilds.find((g: any) => g.id === re[idx].guild_id)?.name ?? "";
            }
          }
        }
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

    return replyEmbed(
      filter ? `${filter} Spawn` : "📋 Upcoming Boss Spawns (24h)",
      filter ? `Spawn info for **${filter}**.` : "Bosses spawning in the next 24 hours:",
      0x8b5cf6,
      upcoming.map((b, i) => ({
        name: `${i + 1}. ${b.name}${b.guild ? ` — ${b.guild}` : ""}`,
        value: `${b.time}${b.time !== "**ALIVE NOW**" ? ` <t:${b.unix}:R>` : ""}`,
        inline: false,
      })),
    );
  }

  // ── !kill <boss> [HH:MM] [yesterday|today] ────────────
  if (cmd === "kill") {
    const serverId = await resolveServerId(guildId);
    if (!serverId) return reply("This server is not linked to RaidScout.");

    // Parse: !kill Boss Name [HH:MM] [yesterday|today]
    // Default: assume the kill happened yesterday (past event).
    // Use "today" explicitly if the kill just happened.
    let timeStr: string | undefined;
    let bossName: string;
    let dayOffset = -1; // -1 = yesterday (default), 0 = today

    const remaining = args.slice(1); // everything after "kill"

    // Check for yesterday/today at the end
    const lastWord = remaining[remaining.length - 1]?.toLowerCase();
    if (lastWord === "today") {
      dayOffset = 0;
      remaining.pop();
    } else if (lastWord === "yesterday") {
      remaining.pop(); // -1 is already default
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
      `bosses?server_id=eq.${serverId}&name=ilike.${encodeURIComponent(bossName)}`,
    );
    if (!bosses?.length) return reply(`Boss **${bossName}** not found.`);
    const boss = bosses[0];

    let deathTime = new Date();
    if (timeStr) {
      const [h, m] = timeStr.split(":").map(Number);
      if (h > 23 || m > 59) return reply("Invalid time.");

      // Interpret custom time in the server's timezone
      const tz = await resolveServerTimezone(serverId);
      const now = new Date();
      const localDate = now.toLocaleDateString("en-CA", { timeZone: tz });
      let [y, mo, d] = localDate.split("-").map(Number);

      // Apply day offset (0 = today, -1 = yesterday)
      if (dayOffset !== 0) {
        const adjusted = new Date(Date.UTC(y, mo - 1, d) + dayOffset * 86_400_000);
        y = adjusted.getUTCFullYear();
        mo = adjusted.getUTCMonth() + 1;
        d = adjusted.getUTCDate();
      }

      // Convert local time to UTC by computing the timezone offset.
      // Example: Asia/Manila (UTC+8) — 12:00 local → 04:00 UTC
      const testUtc = Date.UTC(y, mo - 1, d, h, m); // naive "h:m UTC"
      const testLocal = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date(testUtc));
      const [tlH, tlM] = testLocal.split(":").map(Number);
      const offsetMs = ((tlH - h) * 60 + (tlM - m)) * 60_000;
      deathTime = new Date(testUtc - offsetMs);
      // Note: !kill always records TODAY at the given time.
      // No "assume yesterday" — the user explicitly picks the date by running the command.
    }

    // Determine owner guild
    const bgs = await supabaseQuery(`boss_guilds?boss_id=eq.${boss.id}&select=guild_id,sort_order,day_of_week,mode`);
    let ownerGuildId: string | null = null;
    if (bgs?.length) {
      const dow = deathTime.getDay();
      const se = bgs.find((bg: any) => bg.day_of_week === dow);
      if (se) {
        ownerGuildId = se.guild_id;
      } else {
        const re = bgs.filter((bg: any) => bg.sort_order !== null).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        if (re.length > 0) {
          const idx = ((boss.rotation_counter ?? 1) - 1 + re.length) % re.length;
          ownerGuildId = re[idx].guild_id;
        }
      }
    }

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

    // Increment rotation_counter atomically to avoid race conditions.
    // Uses PostgREST PATCH with return=representation to get the server-confirmed value.
    // For multi-instance bot deployments, replace this with a Supabase RPC:
    //   UPDATE bosses SET rotation_counter = rotation_counter + 1 WHERE id = $1 RETURNING rotation_counter;
    if (bgs?.length) {
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/bosses?id=eq.${boss.id}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ rotation_counter: (boss.rotation_counter ?? 0) + 1 }),
      });
      const updated = await patchRes.json();
      if (updated?.[0]?.rotation_counter != null) {
        boss.rotation_counter = updated[0].rotation_counter;
      }
    }

    const allGuilds = await supabaseQuery(`guilds?server_id=eq.${serverId}`);
    const guildName = ownerGuildId ? allGuilds.find((g: any) => g.id === ownerGuildId)?.name ?? "" : "";

    // Send Discord notification to all linked webhooks
    fetch(`${SUPABASE_URL}/functions/v1/discord-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY! },
      body: JSON.stringify({
        server_id: serverId,
        event: "boss_died",
        boss_name: boss.name,
        guild_name: guildName || undefined,
      }),
    }).catch(() => {}); // fire-and-forget
    const unix = Math.floor(deathTime.getTime() / 1000);

    return replyEmbed(
      `☠️ ${boss.name} Killed`,
      `**${boss.name}**${guildName ? ` — ${guildName}` : ""} recorded as killed.`,
      0xef4444,
      [
        { name: "Death Time", value: `<t:${unix}:f>`, inline: true },
        { name: "Recorded By", value: author, inline: true },
      ],
    );
  }
}

// ── Start ──────────────────────────────────────────────────

console.log("RaidScout Discord Bot starting...");
connect().catch(console.error);
