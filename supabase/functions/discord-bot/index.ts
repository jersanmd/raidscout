// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}

/** Verify the request actually came from Discord using Ed25519 signature verification. */
async function verifyDiscordRequest(req: Request, body: string): Promise<boolean> {
  const PUBLIC_KEY = Deno.env.get("DISCORD_APPLICATION_PUBLIC_KEY");
  if (!PUBLIC_KEY) return true; // skip verification if key not set (dev)

  const signature = req.headers.get("X-Signature-Ed25519");
  const timestamp = req.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    hexToUint8(PUBLIC_KEY),
    { name: "NODE-ED25519", namedCurve: "NODE-ED25519" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "NODE-ED25519",
    key,
    hexToUint8(signature),
    encoder.encode(timestamp + body)
  );
}

function hexToUint8(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Look up the RaidScout server linked to a Discord guild, then check if it's expired. */
async function checkServerExpired(guildId: string): Promise<{ expired: boolean; serverName?: string; ownerId?: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find the RaidScout server linked to this Discord guild
  const { data: config } = await supabase
    .from("discord_configs")
    .select("raidscout_server_id")
    .eq("discord_guild_id", guildId)
    .maybeSingle();

  if (!config) return { expired: false }; // No linked server — let command through

  // Check server expiration
  const { data: server } = await supabase
    .from("servers")
    .select("name, owner_id, trial_ends_at, subscription_ends_at, deleted_at")
    .eq("id", config.raidscout_server_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!server) return { expired: false };

  const now = new Date();
  const trialActive = server.trial_ends_at && new Date(server.trial_ends_at) > now;
  const subActive = server.subscription_ends_at && new Date(server.subscription_ends_at) > now;
  const expired = !trialActive && !subActive;

  return { expired, serverName: server.name, ownerId: server.owner_id };
}

/** Send a follow-up message to Discord (used for ephemeral replies to interactions). */
async function sendDiscordResponse(
  interactionId: string,
  interactionToken: string,
  content: string,
  ephemeral = false
) {
  await fetch(
    `https://discord.com/api/v10/interactions/${interactionId}/${interactionToken}/callback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: {
          content,
          flags: ephemeral ? 64 : 0,
        },
      }),
    }
  );
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const body = await req.text();

  // Verify Discord signature
  const valid = await verifyDiscordRequest(req, body);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let data;
  try { data = JSON.parse(body); } catch {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  // Discord PING (URL verification)
  if (data.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  // Discord APPLICATION_COMMAND
  if (data.type === 2) {
    const guildId = data.guild_id;
    const interactionId = data.id;
    const interactionToken = data.token;

    if (guildId) {
      const { expired, serverName } = await checkServerExpired(guildId);

      if (expired) {
        // Reply ephemeral — only the command user sees this
        await sendDiscordResponse(
          interactionId,
          interactionToken,
          `⏰ **${serverName || "This server"}'s RaidScout access has expired.**\n\nAll bot commands are disabled until the server owner renews. Contact the owner or visit the billing dashboard to restore access.`,
          true // ephemeral
        );
        return new Response(null, { status: 200, headers: corsHeaders() });
      }
    }

    // Server is active — route command to handler
    // For !kill commands: call can_kill_boss(p_server_id, p_boss_id) RPC first,
    // then insert death record via insertDeathRecord if allowed.
    await sendDiscordResponse(
      interactionId,
      interactionToken,
      "⚔️ Command received! Full bot command support coming soon.",
      true
    );
    return new Response(null, { status: 200, headers: corsHeaders() });
  }

  return new Response("OK", { headers: corsHeaders() });
});

