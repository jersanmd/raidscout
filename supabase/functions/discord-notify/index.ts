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

    // Fetch server's webhook URL from database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const dbRes = await fetch(
      `${supabaseUrl}/rest/v1/servers?select=name,discord_webhook_url,notification_prefix&id=eq.${server_id}`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const servers = await dbRes.json();
    const server = servers?.[0];
    
    if (!server?.discord_webhook_url) {
      return new Response(
        JSON.stringify({ ok: false, reason: "No webhook configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    const serverName = server.name || "Unknown Server";
    const ping = server.notification_prefix || "@everyone";
    let content: string;
    let embed: DiscordEmbed | null = null;

    if (event === "boss_died") {
      const attendeeList = attendees?.length
        ? attendees.join(", ")
        : "No participants recorded";
      const guildLine = guild_name ? ` - ${guild_name}` : "";
      content = `${ping} ${boss_name} has been defeated!`;
      embed = {
        title: `☠️ ${boss_name}${guildLine} has been defeated!`,
        description: `**${boss_name}** has been killed on **${serverName}**.`,
        color: 0xef4444, // red
        fields: [
          { name: "Participants", value: attendeeList, inline: false },
          { name: "Server", value: serverName, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "RaidScout" },
      };
    } else if (event === "boss_spawned") {
      const guildLine = guild_name ? ` - ${guild_name}` : "";
      const desc = `**${boss_name}** is now alive on **${serverName}**.` +
        (spawn_time ? "\nSpawn time: " + spawn_time : "");
      content = `${ping} ${boss_name} is spawning!!!`;
      embed = {
        title: `⚔️ ${boss_name}${guildLine} is spawning!!!`,
        description: desc,
        color: 0x22c55e, // green
        fields: [
          { name: "Server", value: serverName, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "RaidScout" },
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
        footer: { text: "RaidScout" },
      };
    } else {
      return new Response(
        JSON.stringify({ ok: false, reason: "Unknown event" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    await sendDiscordMessage(server.discord_webhook_url, content, embed ? [embed] : []);

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
