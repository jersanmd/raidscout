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

const ALLOWED_ORIGINS = [
  "https://www.raidscout.com",
  "https://raidscout-staging.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}

async function sendDiscordMessage(
  webhookUrl: string,
  content: string,
  embeds: DiscordEmbed[],
  retries = 3
) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, embeds }),
    });
    if (response.ok) return response;

    // Handle rate limiting (429)
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After") ||
                         response.headers.get("X-RateLimit-Reset-After");
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : (attempt + 1) * 2000;
      console.warn(`Discord 429 rate limited — retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    throw new Error(`Discord webhook failed: ${response.status}`);
  }
  throw new Error(`Discord webhook failed after ${retries} retries`);
}

// Stagger parallel sends to avoid bursting all webhooks at once
async function sendToAllWebhooks(webhooks: string[], content: string, embed: DiscordEmbed | null) {
  const embeds = embed ? [embed] : [];
  const results = [];
  for (let i = 0; i < webhooks.length; i++) {
    // 200ms stagger between each webhook to spread load
    if (i > 0) await new Promise(r => setTimeout(r, 200));
    results.push(
      sendDiscordMessage(webhooks[i], content, embeds).catch(e =>
        console.error("Webhook send failed:", e)
      )
    );
  }
  await Promise.all(results);
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { server_id, event, boss_name, attendees, spawn_time, guild_name, bosses } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

    // Check maintenance mode — skip notifications if maintenance is on
    const maintRes = await fetch(
      `${supabaseUrl}/rest/v1/app_settings?key=eq.maintenance_mode&select=value`,
      { headers }
    );
    const maintRows = await maintRes.json();
    if (maintRows?.[0]?.value === "true") {
      return new Response(JSON.stringify({ skipped: true, reason: "maintenance" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    // Fetch server name + prefix (exclude soft-deleted)
    const sRes = await fetch(
      `${supabaseUrl}/rest/v1/servers?select=name,notification_prefix,discord_webhook_url&id=eq.${server_id}&deleted_at=is.null`,
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
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
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
      const guildLine = guild_name ? `**${guild_name}** — ` : "";
      content = `${ping} ⚠️ **${boss_name}** has spawned!\n${guildLine}<t:${Math.floor(Date.now() / 1000)}:f>`;
      embed = null;
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
    } else if (event === "cp_reminder") {
      content = `${ping} ⚔️ **Daily CP Update Reminder!**\n\nIt's time to update your Combat Power! Use \`!updatestats <YourName> <CP>\` in the server to log your stats.\n\n📊 Stay competitive — track your growth on the leaderboard!`;
      embed = {
        title: "⚔️ CP Update Reminder",
        description: "All members are requested to update their Combat Power today. Use `!updatestats` to submit your CP.",
        color: 0x22c55e, // green
        fields: [
          { name: "Server", value: serverName, inline: true },
          { name: "Command", value: "`!updatestats <name> <cp>`", inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "Powered by RaidScout" },
      };
    } else {
      return new Response(
        JSON.stringify({ ok: false, reason: "Unknown event" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send to all webhooks with rate-limit-aware staggering
    await sendToAllWebhooks(webhooks, content, embed);

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
