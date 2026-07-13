// ── Member Kills Edge Function ─────────────────────────────
// Returns kill history for a member. Works around PostgREST anon filtering bug.
// Deploy: supabase functions deploy get-member-kills --no-verify-jwt
// Types: Keep in sync with shared/types.ts (MemberBossKill)
// @ts-nocheck -- Deno edge function, not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { member_id, server_id, since, timezone } = await req.json();
    if (!member_id || !server_id) {
      return new Response(
        JSON.stringify({ error: "Missing member_id or server_id" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch attendance with death & boss info
    let query = supabase
      .from("attendance_records")
      .select("death_record_id, death_records!inner(death_time, boss_id, owner_guild_id, bosses!inner(name, boss_points, image_url))")
      .eq("member_id", member_id)
      .eq("server_id", server_id)
      .order("created_at", { ascending: false });

    if (since) query = query.gte("death_records.death_time", since);

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get member's guild for per-guild point overrides
    const { data: memberData } = await supabase
      .from("members")
      .select("guild_id")
      .eq("id", member_id)
      .maybeSingle();
    const guildId = (memberData as any)?.guild_id as string | null;

    // Get per-guild point overrides
    const bossIds = [...new Set((data as any[]).map((r: any) => r.death_records.boss_id))];
    let bgPointsMap: Record<string, number> = {};
    if (guildId && bossIds.length > 0) {
      const { data: bgData } = await supabase
        .from("boss_guilds")
        .select("boss_id, points")
        .eq("guild_id", guildId)
        .in("boss_id", bossIds);
      for (const bg of (bgData || [])) {
        if ((bg as any).points != null) {
          bgPointsMap[(bg as any).boss_id] = (bg as any).points;
        }
      }
    }

    // Fetch time-based multipliers
    let guildMultipliers: { start_hour: number; end_hour: number; multiplier: number }[] = [];
    if (guildId) {
      const { data: rules } = await supabase
        .from("point_rules")
        .select("config")
        .eq("server_id", server_id)
        .eq("guild_id", guildId)
        .eq("rule_type", "time_multiplier")
        .eq("enabled", true);
      for (const rule of (rules || [])) {
        const cfg = (rule as any).config as any;
        if (cfg) {
          guildMultipliers.push({
            start_hour: cfg.start_hour,
            end_hour: cfg.end_hour,
            multiplier: cfg.multiplier,
          });
        }
      }
    }

    // Helper: get multiplier for a death time
    const getMultiplier = (deathTime: string): number => {
      if (!guildMultipliers.length) return 1;
      const tz = timezone || "UTC";
      // Parse hour from death time in server timezone
      const dt = new Date(deathTime);
      const hour = parseInt(
        dt.toLocaleString("en-US", { timeZone: tz, hour: "2-digit", hour12: false }),
        10,
      );
      let mult = 1;
      for (const r of guildMultipliers) {
        const match = r.start_hour <= r.end_hour
          ? hour >= r.start_hour && hour < r.end_hour
          : hour >= r.start_hour || hour < r.end_hour;
        if (match) mult = Math.max(mult, r.multiplier);
      }
      return mult;
    };

    // Fetch guild names for owner_guild_id resolution
    const { data: guildData } = await supabase
      .from("guilds")
      .select("id, name")
      .eq("server_id", server_id);
    const guildNameMap = new Map((guildData || []).map((g: any) => [g.id, g.name]));

    // Map to frontend format with all modifiers
    const kills = (data as any[]).map((r: any) => {
      const bossId = r.death_records?.boss_id;
      const bossPoints = r.death_records?.bosses?.boss_points ?? 1;
      const basePts = guildId && bgPointsMap[bossId] != null
        ? bgPointsMap[bossId]
        : bossPoints;
      const mult = guildId ? getMultiplier(r.death_records?.death_time) : 1;
      const ownerGuildId = r.death_records?.owner_guild_id;
      return {
        death_record_id: r.death_record_id,
        boss_name: r.death_records?.bosses?.name ?? "Unknown",
        killed_at: r.death_records?.death_time,
        points: basePts * mult,
        image_url: r.death_records?.bosses?.image_url || null,
        guild_name: ownerGuildId ? guildNameMap.get(ownerGuildId) || null : null,
      };
    });

    return new Response(JSON.stringify(kills), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
