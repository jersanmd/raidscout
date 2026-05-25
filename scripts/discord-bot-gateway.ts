// ── Discord Gateway Bot ─────────────────────────────────────
// Standalone bot that listens for !spawn and !kill chat commands.
// Uses Discord's WebSocket Gateway (no Interactions Endpoint needed).
//
// Run: npx tsx scripts/discord-bot-gateway.ts
// Requires: DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://oeugehqgpodzhagomeex.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TOKEN) { console.error("Set DISCORD_BOT_TOKEN"); process.exit(1); }
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
        intents: 1 << 9 | 1 << 0, // GUILD_MESSAGES | GUILDS
        properties: { os: "linux", browser: "raidscout", device: "raidscout" },
      },
    }));
  });

  ws.on("message", async (raw: Buffer) => {
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

  ws.on("close", (code: number) => {
    clearInterval(heartbeatInterval);
    console.log(`Disconnected (code ${code}). Reconnecting in 5s...`);
    setTimeout(connect, 5000);
  });

  ws.on("error", (err: any) => {
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
    const upcoming: string[] = [];

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
        const unix = Math.floor(spawn.getTime() / 1000);
        const label = spawn <= now ? "**ALIVE**" : `<t:${unix}:t> (<t:${unix}:R>)`;
        upcoming.push(`${boss.name} — ${label}`);
      }
    }

    if (upcoming.length === 0) return reply("No bosses spawning in 24h.");
    return reply(`**Boss Spawns (24h)**\n${upcoming.join("\n")}`);
  }

  // ── !kill <boss> [HH:MM] ───────────────────────────────
  if (cmd === "kill") {
    const serverId = await resolveServerId(guildId);
    if (!serverId) return reply("This server is not linked to RaidScout.");

    // Find boss name (may be multi-word, before time)
    let timeStr: string | undefined;
    let bossName: string;
    const lastArg = args[args.length - 1];
    if (/^\d{1,2}:\d{2}$/.test(lastArg)) {
      timeStr = lastArg;
      bossName = args.slice(1, -1).join(" ");
    } else {
      bossName = args.slice(1).join(" ");
    }

    if (!bossName) return reply("Usage: `!kill Boss Name [HH:MM]`");

    const bosses = await supabaseQuery(
      `bosses?server_id=eq.${serverId}&name=ilike.${encodeURIComponent(bossName)}`,
    );
    if (!bosses?.length) return reply(`Boss **${bossName}** not found.`);
    const boss = bosses[0];

    let deathTime = new Date();
    if (timeStr) {
      const [h, m] = timeStr.split(":").map(Number);
      if (h > 23 || m > 59) return reply("Invalid time.");
      deathTime.setHours(h, m, 0, 0);
      if (deathTime > new Date()) deathTime.setDate(deathTime.getDate() - 1);
    }

    await supabaseInsert("death_records", {
      boss_id: boss.id,
      server_id: serverId,
      death_time: deathTime.toISOString(),
      user_id: "00000000-0000-0000-0000-000000000000",
    });

    const unix = Math.floor(deathTime.getTime() / 1000);
    return reply(`☠️ **${boss.name}** killed at <t:${unix}:f> (recorded by ${author})`);
  }
}

// ── Start ──────────────────────────────────────────────────

console.log("RaidScout Discord Bot starting...");
connect().catch(console.error);
