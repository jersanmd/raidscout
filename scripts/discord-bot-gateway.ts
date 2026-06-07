// ── Discord Gateway Bot ─────────────────────────────────────
// Standalone bot that listens for ;nextspawn and ;killed chat commands.
// Uses Discord's WebSocket Gateway (no Interactions Endpoint needed).
//
// Run: npx tsx scripts/discord-bot-gateway.ts
// Requires: DISCORD_BOT_TOKEN, SUPABASE_SERVICE_ROLE_KEY
// @ts-nocheck

import { WebSocket } from "ws";
import { TOKEN, setBotUserId } from "./bot/config";
import { installLogging } from "./bot/logging";
import { handleGuildJoin } from "./bot/guild-join";
import { handleMessage } from "./bot/commands";
import { startSpawnCron } from "./bot/spawn-cron";

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
    if (t === "MESSAGE_CREATE") { handleMessage(d).catch(console.error); }
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
startSpawnCron();
connect().catch(console.error);
