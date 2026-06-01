// ── Discord Notify Edge Function ───────────────────────────
// Handles event-based Discord notifications for boss kills and spawns.
//
// Called from the frontend via fetch() when a boss is killed or spawns.
// Sends rich embeds with @everyone pings to the server's configured
// Discord webhook.
//
// Deploy: supabase functions deploy discord-notify
// @ts-nocheck -- Deno edge function, not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
  footer?: { text: string };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

async function sendDiscordMessage(
  webhookUrl: string,
  content: string,
  embeds: DiscordEmbed[]
) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, embeds }),
  });
  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status}`);
  }
  return response;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { server_id, event, boss_name, attendees, spawn_time, guild_name, bosses } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
    
    // Fetch server name + prefix
    const sRes = await fetch(
      `${supabaseUrl}/rest/v1/servers?select=name,notification_prefix,discord_webhook_url&id=eq.${server_id}`,
      { headers }
    );
    const servers = await sRes.json();
    const server = servers?.[0];
    const serverName = server?.name || "Unknown Server";
    const ping = server?.notification_prefix || "@everyone";

    // Fetch all guild Discord links with webhooks
    const dcRes = await fetch(
      `${supabaseUrl}/rest/v1/discord_configs?select=webhook_url,discord_guild_id,label&raidscout_server_id=eq.${server_id}`,
      { headers }
    );
    const configs = await dcRes.json();

    // Collect all webhook URLs: legacy + per-guild
    const webhooks: string[] = [];
    if (server?.discord_webhook_url) webhooks.push(server.discord_webhook_url);
    for (const c of configs || []) {
      if (c.webhook_url) webhooks.push(c.webhook_url);
    }

    if (webhooks.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, reason: "No webhook configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }
    let content: string;
    let embed: DiscordEmbed | null = null;

    if (event === "boss_died") {
      const attendeeList = attendees?.length
        ? attendees.join(", ")
        : "No participants recorded";
      const byLine = guild_name ? ` by ${guild_name}` : "";
      content = `${ping} ${boss_name}${byLine} — defeated!`;
      embed = {
        title: `☠️ ${boss_name}${byLine}`,
        color: 0xef4444, // red
        fields: [
          { name: "Participants", value: attendeeList, inline: false },
          { name: "Server", value: serverName, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "Powered by RaidScout" },
      };
    } else if (event === "boss_spawned") {
      const guildLine = guild_name ? ` of ${guild_name}` : "";
      content = `${ping} ${boss_name} is spawning!!!`;
      embed = {
        title: `⚔️ ${boss_name}${guildLine} has spawned.`,
        color: 0x22c55e, // green
        fields: [
          { name: "Server", value: serverName, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "Powered by RaidScout" },
      };
    } else if (event === "spawn_announce") {
      const bossList = Array.isArray(bosses) ? bosses : [];

      const fields = bossList.map((b, i) => {
        const time = b.spawn_time || "Unknown";
        const relative = b.unix_spawn_time ? ` <t:${b.unix_spawn_time}:R>` : "";
        const guild = b.guild_name ? ` - ${b.guild_name}` : "";
        return {
          name: `${i + 1}. ${b.name}${guild}`,
          value: `${time}${relative}`,
          inline: false,
        };
      });

      content = ping;
      embed = {
        title: "📋 Next 24h Boss Spawns",
        description: `Upcoming boss spawns on **${serverName}**:`,
        color: 0x8b5cf6,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: "Powered by RaidScout" },
      };
    } else {
      return new Response(
        JSON.stringify({ ok: false, reason: "Unknown event" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    // Send to all webhooks in parallel
    await Promise.all(webhooks.map(url =>
      sendDiscordMessage(url, content, embed ? [embed] : []).catch(e =>
        console.error("Webhook send failed:", e)
      )
    ));

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
});
