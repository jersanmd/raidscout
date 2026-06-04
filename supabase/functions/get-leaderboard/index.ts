// ── Leaderboard Edge Function ──────────────────────────────
// Computes leaderboard from raw tables (bypasses PostgREST function cache).
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const { server_id, since } = await req.json();
    if (!server_id) return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get server timezone
    const { data: srv } = await supabase.from("servers").select("timezone").eq("id", server_id).single();
    const tz = srv?.timezone || "UTC";

    // Get guild resets from app_settings (key: "leaderboard_reset_at:GuildName")
    const { data: settings } = await supabase.from("app_settings").select("key, value").eq("server_id", server_id).like("key", "leaderboard_reset_at:%");
    const guildResets: Record<string, string> = {};
    for (const s of settings || []) {
      const guildName = s.key.replace("leaderboard_reset_at:", "");
      guildResets[guildName] = s.value;
    }

    // Build guild name -> id map
    const { data: guilds } = await supabase.from("guilds").select("id, name").eq("server_id", server_id);
    const guildNameToId = new Map((guilds || []).map(g => [g.name, g.id]));
    const guildIdToName = new Map((guilds || []).map(g => [g.id, g.name]));

    // Get deduplicated boss_guilds point overrides
    const { data: bgRows } = await supabase.from("boss_guilds").select("boss_id, guild_id, points").not("points", "is", null);
    const bgPoints: Record<string, number> = {};
    for (const bg of bgRows || []) {
      const key = `${bg.boss_id}:${bg.guild_id}`;
      if (bgPoints[key] == null || bg.points > bgPoints[key]) bgPoints[key] = bg.points;
    }

    // Get time multipliers
    const { data: rules } = await supabase.from("point_rules").select("guild_id, config").eq("server_id", server_id).eq("rule_type", "time_multiplier").eq("enabled", true);
    const multipliers: Record<string, { start: number; end: number; mult: number }[]> = {};
    for (const r of rules || []) {
      if (!multipliers[r.guild_id]) multipliers[r.guild_id] = [];
      multipliers[r.guild_id].push({ start: r.config.start_hour, end: r.config.end_hour, mult: r.config.multiplier });
    }

    // Get members
    const { data: members } = await supabase.from("members").select("id, name, guild_id").eq("server_id", server_id);
    if (!members?.length) return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

    // Get attendance (only for this server's members)
    const memberIds = members.map(m => m.id);
    const { data: att } = await supabase.from("attendance_records").select("member_id, death_record_id, created_at").in("member_id", memberIds);

    // Get death records
    const deathIds = [...new Set((att || []).map(a => a.death_record_id))];
    const { data: deaths } = await supabase.from("death_records").select("id, death_time, boss_id").in("id", deathIds.length ? deathIds : ["none"]);

    // Get bosses
    const bossIds = [...new Set((deaths || []).map(d => d.boss_id))];
    const { data: bosses } = await supabase.from("bosses").select("id, name, boss_points").in("id", bossIds.length ? bossIds : ["none"]);

    // Build lookup maps
    const deathMap = new Map((deaths || []).map(d => [d.id, d]));
    const bossMap = new Map((bosses || []).map(b => [b.id, b]));

    // Get point adjustments
    const { data: adj } = await supabase.from("point_adjustments").select("member_id, points").eq("server_id", server_id);
    const adjMap = new Map<string, number>();
    for (const a of (adj || [])) adjMap.set(a.member_id, (adjMap.get(a.member_id) || 0) + a.points);

    // Compute scores
    const scores = new Map<string, { name: string; points: number; kills: number }>();
    for (const m of members) {
      const guildName = guildIdToName.get(m.guild_id) || "";
      const resetMs = guildResets[guildName] ? new Date(guildResets[guildName]).getTime() : 0;
      let points = 0, kills = 0;
      const seenDeaths = new Set<string>();

      for (const a of (att || [])) {
        if (a.member_id !== m.id) continue;
        const death = deathMap.get(a.death_record_id);
        if (!death) continue;
        if (since && new Date(death.death_time) < new Date(since)) continue;
        if (!since && resetMs && new Date(a.created_at).getTime() < resetMs) continue;
        if (seenDeaths.has(a.death_record_id)) continue;
        seenDeaths.add(a.death_record_id);
        kills++;

        const boss = bossMap.get(death.boss_id);
        const bgKey = `${death.boss_id}:${m.guild_id}`;
        const basePts = bgPoints[bgKey] ?? boss?.boss_points ?? 1;

        let mult = 1;
        const gm = multipliers[m.guild_id];
        if (gm) {
          const dt = new Date(death.death_time);
          const hour = parseInt(dt.toLocaleString("en-US", { timeZone: tz, hour: "2-digit", hour12: false }), 10);
          for (const r of gm) {
            const match = r.start <= r.end ? hour >= r.start && hour < r.end : hour >= r.start || hour < r.end;
            if (match) mult = Math.max(mult, r.mult);
          }
        }
        points += basePts * mult;
      }
      scores.set(m.id, { name: m.name, points: points + (adjMap.get(m.id) || 0), kills });
    }

    const entries = [...scores.entries()]
      .filter(([, s]) => s.kills > 0 || s.points > 0)
      .sort((a, b) => b[1].points - a[1].points)
      .map(([id, s]) => ({ id, name: s.name, points: s.points }));

    return new Response(JSON.stringify(entries), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }
});
