// ── Discord Gateway Bot ─────────────────────────────────────
// Standalone bot that listens for ;nextspawn and ;killed chat commands.
// Uses Discord's WebSocket Gateway (no Interactions Endpoint needed).
//
// Run: npx tsx scripts/discord-bot-gateway.ts
// Requires: DISCORD_BOT_TOKEN, SUPABASE_SERVICE_ROLE_KEY
import { WebSocket } from "ws";
import * as http from "http";
import { TOKEN, setBotUserId, botUserId } from "./bot/config";
import { SUPABASE_URL, SUPABASE_KEY } from "./bot/config";
import { installLogging } from "./bot/logging";
import { LOG_BUFFER } from "./bot/logging";
import { handleGuildJoin } from "./bot/guild-join";
import { handleMessage } from "./bot/commands";
import { startSpawnCron } from "./bot/spawn-cron";
import { getCronStats } from "./bot/spawn-cron";
import { withCommandTracking, getActiveCommandCount } from "./bot/concurrency";
import { createThreadInChannel } from "./bot/threads";

// -- Crash resilience --------------------------------------
process.on("uncaughtException", (err: any) => {
  console.error("Uncaught exception:", err.message, err.stack?.split("\n")[1]?.trim());
});
process.on("unhandledRejection", (reason: any) => {
  console.error("Unhandled rejection:", reason?.message ?? reason);
});

// -- Logging -----------------------------------------------
installLogging();

// -- WebSocket Gateway --------------------------------------
let discordConnected = false;

async function connect() {
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
  let heartbeatInterval: any;
  let seq: number | null = null;

  ws.on("open", () => {
    console.log("Connected. Identifying...");
    ws.send(JSON.stringify({
      op: 2,
      d: {
        token: TOKEN,
        intents: 1 << 9 | 1 << 0 | 1 << 15,
        properties: { os: "linux", browser: "raidscout", device: "raidscout" },
      },
    }));
  });

  ws.on("message", (raw: any) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const { op, d, t, s } = msg;
    if (s) seq = s;

    if (op === 10) {
      heartbeatInterval = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: seq }));
      }, d.heartbeat_interval);
      console.log("Bot is online!");
    }

    if (t === "GUILD_CREATE") { handleGuildJoin(d).catch(console.error); }
    if (t === "READY") { setBotUserId(d.user.id); discordConnected = true; }
    if (t === "MESSAGE_CREATE") {
      // Ignore the bot's own messages to prevent self-reaction loops
      if (d.author?.id === botUserId) return;
      withCommandTracking(
        () => handleMessage(d),
        25_000,
        () => {
          fetch(`https://discord.com/api/v10/channels/${d.channel_id}/messages`, {
            method: "POST",
            headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ content: "⏳ Command timed out — the server is currently overloaded. Please try again." }),
          }).catch(() => {});
        },
      ).catch((err) => console.error("[gateway] Command error:", err.message));
    }
  });

  ws.on("close", (code: any) => {
    discordConnected = false;
    clearInterval(heartbeatInterval);
    console.log(`Disconnected (code ${code}). Reconnecting in 5s...`);
    setTimeout(connect, 5000);
  });

  ws.on("error", (err: any) => {
    console.error("WebSocket error:", err.message);
  });
}

console.log("RaidScout Discord Bot starting...");

// ── HTTP API for admin panel (CORS enabled) ─────────────────
const PORT = parseInt(process.env.PORT || "3003", 10);
const startTime = Date.now();

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const headers = { ...corsHeaders(), "Content-Type": "application/json" };

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  // GET /status
  if (req.method === "GET" && url.pathname === "/status") {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    const uptimeDisplay = `${h}h ${m}m ${s}s`;

    res.writeHead(200, headers);
    return res.end(JSON.stringify({
      ok: true,
      discord_connected: discordConnected,
      uptime_display: uptimeDisplay,
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      active_commands: getActiveCommandCount(),
      region: process.env.FLY_REGION || "unknown",
      node_version: process.version,
      spawn_cron: getCronStats(),
    }));
  }

  // GET /logs?limit=100
  if (req.method === "GET" && url.pathname === "/logs") {
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);
    const logs = LOG_BUFFER.slice(-limit).reverse();
    res.writeHead(200, headers);
    return res.end(JSON.stringify({ logs }));
  }

  // GET /tick-metrics?range=1h — historical tick durations from Supabase
  if (req.method === "GET" && url.pathname === "/tick-metrics") {
    const range = url.searchParams.get("range") || "1h";
    const rangeMs: Record<string, number> = {
      "1h": 3600000, "3h": 10800000, "6h": 21600000,
      "12h": 43200000, "24h": 86400000, "1d": 86400000,
      "3d": 259200000, "5d": 432000000,
      "7d": 604800000, "14d": 1209600000, "30d": 2592000000,
    };
    const since = Date.now() - (rangeMs[range] || 3600000);

    try {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/tick_metrics?select=created_at,duration_ms&created_at=gte.${new Date(since).toISOString()}&order=created_at.asc&limit=5000`,
        { headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` } }
      );
      if (!resp.ok) throw new Error(`Supabase returned ${resp.status}`);
      const rows = (await resp.json()) as any[];
      const metrics = rows.map((r: any) => ({ ts: new Date(r.created_at).getTime(), duration_ms: r.duration_ms }));
      res.writeHead(200, headers);
      return res.end(JSON.stringify({ ok: true, metrics }));
    } catch (err: any) {
      res.writeHead(500, headers);
      return res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  }

  // GET /health — Fly.io health check
  if (req.method === "GET" && (url.pathname === "/health")) {
    res.writeHead(200, { "Content-Type": "text/plain", ...corsHeaders() });
    res.end(`OK — Discord ${discordConnected ? "connected" : "disconnected"}`);
    return;
  }

  // POST /create-thread — called by create-progress-thread edge function
  if (req.method === "POST" && url.pathname === "/create-thread") {
    let body = "";
    req.on("data", (chunk: string) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { channel_id, thread_name, message, discord_guild_id, notification_prefix } = JSON.parse(body);
        if (!channel_id || !thread_name || !message) {
          res.writeHead(400, headers);
          return res.end(JSON.stringify({ ok: false, error: "Missing channel_id, thread_name, or message" }));
        }

        // Resolve role names in notification_prefix (e.g., @Y6 → <@&role_id>)
        let finalMessage = message;
        if (discord_guild_id && notification_prefix) {
          try {
            const { resolvePrefix, resolveRoles } = await import("./bot/notifications");
            const roleMap = await resolveRoles(discord_guild_id);
            const resolvedPing = resolvePrefix(notification_prefix, roleMap);
            // Replace the raw prefix in the message with the resolved one
            finalMessage = message.replace(notification_prefix, resolvedPing);
          } catch { /* ignore role resolution errors */ }
        }

        const threadId = await createThreadInChannel(channel_id, thread_name, finalMessage, undefined);
        if (threadId) {
          res.writeHead(200, headers);
          res.end(JSON.stringify({ ok: true, thread_id: threadId }));
        } else {
          res.writeHead(500, headers);
          res.end(JSON.stringify({ ok: false, error: "Failed to create thread" }));
        }
      } catch (e: any) {
        res.writeHead(500, headers);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // GET /tick-metrics?range=1h|3h|6h|12h|1d|3d|5d|7d|14d|30d|custom&from=&to=
  if (req.method === "GET" && url.pathname === "/tick-metrics") {
    const range = url.searchParams.get("range") || "1h";
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const rangeMap: Record<string, number> = {
      "1h": 3600, "3h": 10800, "6h": 21600, "12h": 43200,
      "1d": 86400, "3d": 259200, "5d": 432000, "7d": 604800,
      "14d": 1209600, "30d": 2592000,
    };

    let cutoff: number;
    if (range === "custom" && fromParam && toParam) {
      cutoff = Math.floor(new Date(fromParam).getTime() / 1000);
      // We'll filter server-side using the toParam as well
    } else {
      const seconds = rangeMap[range] || 3600;
      cutoff = Math.floor(Date.now() / 1000) - seconds;
    }

    try {
      const SUPABASE_URL = process.env.SUPABASE_URL || "";
      const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const qs = range === "custom" && fromParam && toParam
        ? `created_at=gte.${new Date(fromParam).toISOString()}&created_at=lte.${new Date(toParam).toISOString()}`
        : `created_at=gte.${new Date((cutoff) * 1000).toISOString()}`;

      const dbRes = await fetch(
        `${SUPABASE_URL}/rest/v1/tick_metrics?${qs}&order=created_at.asc&limit=3000`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );

      if (!dbRes.ok) {
        res.writeHead(dbRes.status, headers);
        return res.end(JSON.stringify({ ok: false, error: `DB error: ${dbRes.status}` }));
      }

      const rows = await dbRes.json() as any[];
      const metrics = rows.map((r: any) => ({
        ts: new Date(r.created_at).getTime(),
        duration_ms: r.duration_ms,
        servers: r.servers_checked,
        bosses: r.bosses_checked,
      }));

      res.writeHead(200, headers);
      res.end(JSON.stringify({ ok: true, metrics }));
    } catch (e: any) {
      res.writeHead(500, headers);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // Health check fallback
  res.writeHead(200, { "Content-Type": "text/plain", ...corsHeaders() });
  res.end(`OK — Discord ${discordConnected ? "connected" : "disconnected"}`);
}).listen(PORT, "0.0.0.0", () => {
  console.log(`HTTP API listening on 0.0.0.0:${PORT}`);
});

startSpawnCron();
connect().catch(console.error);
