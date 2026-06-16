// ── Get Discord Guild Info ──────────────────────────────────
// Fetches Discord guild name & icon for a given guild ID.
// Uses the bot token to call Discord's API.
// Includes in-memory cache (5 min) to avoid rate limits.
//
// Deploy: supabase functions deploy get-discord-guild
// Secret: supabase secrets set DISCORD_BOT_TOKEN=xxx

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const DISCORD_API = "https://discord.com/api/v10";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry { name: string; icon_url: string | null; ts: number }
const cache = new Map<string, CacheEntry>();

serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { guild_id } = await req.json();
    if (!guild_id || typeof guild_id !== "string") {
      return new Response(JSON.stringify({ error: "guild_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check cache
    const cached = cache.get(guild_id);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return new Response(JSON.stringify({ name: cached.name, icon_url: cached.icon_url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "Bot token not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(`${DISCORD_API}/guilds/${guild_id}`, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: `Discord API error: ${res.status}`, detail: err }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const guild: { id: string; name: string; icon: string | null } = await res.json();
    const iconUrl = guild.icon
      ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
      : null;

    // Store in cache
    cache.set(guild_id, { name: guild.name, icon_url: iconUrl, ts: Date.now() });

    return new Response(JSON.stringify({ name: guild.name, icon_url: iconUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
