// ── Create Progress Thread Edge Function ────────────────────
// Creates a Discord thread in the configured progress channel
// when the "Demand Update" button is pressed.
//
// Deploy: supabase functions deploy create-progress-thread

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { server_id, exclude_config_ids } = await req.json();
    if (!server_id) {
      return new Response(JSON.stringify({ ok: false, reason: "Missing server_id" }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

    // Fetch ALL progress channel configs for this server (with per-config prefixes)
    const dcRes = await fetch(
      `${supabaseUrl}/rest/v1/discord_configs?select=progress_channel_id,label,notification_prefix,command_prefix,discord_guild_id,webhook_url,raidscout_server_id&raidscout_server_id=eq.${server_id}`,
      { headers }
    );
    const configs = await dcRes.json();

    const progressConfigs = (configs || []).filter((c: any) => c.progress_channel_id);

    // Filter out excluded configs
    const excludeSet = new Set(exclude_config_ids || []);
    const activeConfigs = progressConfigs.filter((c: any) => !excludeSet.has(c.progress_channel_id));
    if (activeConfigs.length === 0) {
      return new Response(JSON.stringify({ ok: false, reason: "No progress channel configured" }), {
        status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    // Fetch server name + timezone
    const sRes = await fetch(
      `${supabaseUrl}/rest/v1/servers?select=name,timezone&id=eq.${server_id}`,
      { headers }
    );
    const servers = await sRes.json();
    const serverName = servers?.[0]?.name || "Unknown Server";
    const serverTz = servers?.[0]?.timezone || "UTC";

    const botUrl = Deno.env.get("BOT_SERVER_URL") || "https://raidscout-bot.fly.dev";
    const now = new Date();
    const threadName = `Progress Report: ${now.toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: serverTz, timeZoneName: "short",
    })}`;

    console.log(`[create-progress-thread] Found ${progressConfigs.length} progress config(s), ${activeConfigs.length} active after exclusions, tz=${serverTz}, bot URL: ${botUrl}`);

    // Create a thread in each active progress channel
    const results: { guild: string; channel_id: string; ok: boolean; thread_id?: string; error?: string }[] = [];

    for (const config of activeConfigs) {
      try {
        const ping = config.notification_prefix || "@everyone";
        const guildLabel = config.label || "Unknown Guild";
        const cmdPrefix = config.command_prefix || "!";

        const instructionMessage = [
          `${ping}`,
          ``,
          `**⚔️ Progress Report — ${serverName} (${guildLabel})**`,
          ``,
          `Please update your Combat Power using the following format:`,
          ``,
          `\`\`\``,
          `${cmdPrefix}updatestats <YourName> <CP>`,
          `\`\`\``,
          ``,
          `**Examples:**`,
          `• \`${cmdPrefix}updatestats PressX 120,000\``,
          `• \`${cmdPrefix}updatestats PressX 120k\`  (k = thousand)`,
          ``,
          `**Rules:**`,
          `1. You **must** attach a screenshot as proof along with your message`,
          `2. Send exactly **1 message + 1 image** together`,
          `3. Messages without an image will be rejected`,
          `4. Use comma \`,\` or \`k\` suffix for readability — we'll parse it automatically`,
          ``,
          `Thank you! 🫡`
        ].join("\n");

        console.log(`[create-progress-thread] Creating thread in ${config.progress_channel_id} (${guildLabel}, prefix=${ping})...`);
        const res = await fetch(`${botUrl}/create-thread`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel_id: config.progress_channel_id,
            thread_name: threadName,
            message: instructionMessage,
            server_id: server_id,
            discord_guild_id: config.discord_guild_id || null,
            notification_prefix: config.notification_prefix || null,
          }),
        });

        if (!res.ok) {
          const err = await res.text().catch(() => "");
          results.push({ guild: config.label || config.discord_guild_id || "unknown", channel_id: config.progress_channel_id, ok: false, error: `${res.status}: ${err}` });
        } else {
          const body = await res.json().catch(() => ({}));
          results.push({ guild: config.label || config.discord_guild_id || "unknown", channel_id: config.progress_channel_id, ok: true, thread_id: body.thread_id });
        }
      } catch (e) {
        results.push({ guild: config.label || config.discord_guild_id || "unknown", channel_id: config.progress_channel_id, ok: false, error: String(e) });
      }
    }

    const succeeded = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    return new Response(JSON.stringify({
      ok: succeeded > 0,
      thread_name: threadName,
      succeeded,
      failed,
      results,
    }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });

  } catch (err) {
    console.error("create-progress-thread error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
});
