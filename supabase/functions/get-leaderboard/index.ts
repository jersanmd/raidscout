// ── Leaderboard Edge Function v2 ──────────────────────────
// Computes per-member kill points using same logic as history modal.
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  try {
    const { server_id, since } = await req.json();
    if (!server_id) return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get server timezone
    const { data: srv } = await supabase.from("servers").select("timezone").eq("id", server_id).single();
    const tz = srv?.timezone || "UTC";

    // Get members
    const { data: members } = await supabase.from("members").select("id, name, guild_id").eq("server_id", server_id);
    if (!members?.length) return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

    // Get guild resets
    const { data: settings } = await supabase.from("app_settings").select("key, value").eq("server_id", server_id).like("key", "leaderboard_reset_at:%");
    const guildResets = new Map<string, number>();
    for (const s of settings || []) guildResets.set(s.key.replace("leaderboard_reset_at:", ""), new Date(s.value).getTime());

    // Build guild id→name map
    const { data: guilds } = await supabase.from("guilds").select("id, name").eq("server_id", server_id);
    const guildIdToName = new Map((guilds || []).map(g => [g.id, g.name]));

    // Get attendance
    const memberIds = members.map(m => m.id);
    const { data: att } = await supabase.from("attendance_records").select("member_id, death_record_id, created_at").in("member_id", memberIds);

    // Get deaths
    const deathIds = [...new Set((att || []).map(a => a.death_record_id))];
    const { data: deaths } = await supabase.from("death_records").select("id, death_time, boss_id").in("id", deathIds.length ? deathIds : ["none"]);

    // Get bosses
    const bossIds = [...new Set((deaths || []).map(d => d.boss_id))];
    const { data: bosses } = await supabase.from("bosses").select("id, name, boss_points").in("id", bossIds.length ? bossIds : ["none"]);

    // Get boss_guilds point overrides (deduplicated)
    const { data: bgRows } = await supabase.from("boss_guilds").select("boss_id, guild_id, points").not("points", "is", null);
    const bgPoints = new Map<string, number>();
    for (const bg of bgRows || []) {
      const k = `${bg.boss_id}:${bg.guild_id}`;
      if (!bgPoints.has(k) || bg.points > bgPoints.get(k)!) bgPoints.set(k, bg.points);
    }

    // Get time multipliers
    const { data: rules } = await supabase.from("point_rules").select("guild_id, config").eq("server_id", server_id).eq("rule_type", "time_multiplier").eq("enabled", true);
    const multipliers = new Map<string, { s: number; e: number; m: number }[]>();
    for (const r of rules || []) {
      if (!multipliers.has(r.guild_id)) multipliers.set(r.guild_id, []);
      multipliers.get(r.guild_id)!.push({ s: r.config.start_hour, e: r.config.end_hour, m: r.config.multiplier });
    }

    // Point adjustments
    const { data: adj } = await supabase.from("point_adjustments").select("member_id, points").eq("server_id", server_id);
    const adjMap = new Map<string, number>();
    for (const a of (adj || [])) adjMap.set(a.member_id, (adjMap.get(a.member_id) || 0) + a.points);

    // Maps
    const deathMap = new Map((deaths || []).map(d => [d.id, d]));
    const bossMap = new Map((bosses || []).map(b => [b.id, b]));

    // Compute per-member scores
    const scores = new Map<string, { name: string; points: number }>();
    for (const m of members) {
      const guildName = guildIdToName.get(m.guild_id) || "";
      const resetMs = since ? 0 : (guildResets.get(guildName) || 0);
      let points = 0;
      const seen = new Set<string>();

      for (const a of (att || [])) {
        if (a.member_id !== m.id) continue;
        const death = deathMap.get(a.death_record_id);
        if (!death) continue;
        if (since && new Date(death.death_time) < new Date(since)) continue;
        if (!since && resetMs > 0 && new Date(a.created_at).getTime() < resetMs) continue;
        if (seen.has(a.death_record_id)) continue;
        seen.add(a.death_record_id);

        const boss = bossMap.get(death.boss_id);
        const basePts = bgPoints.get(`${death.boss_id}:${m.guild_id}`) ?? boss?.boss_points ?? 1;

        let mult = 1;
        const gm = multipliers.get(m.guild_id);
        if (gm) {
          const hour = parseInt(new Date(death.death_time).toLocaleString("en-US", { timeZone: tz, hour: "2-digit", hour12: false }), 10);
          for (const r of gm) {
            if (r.s <= r.e ? hour >= r.s && hour < r.e : hour >= r.s || hour < r.e) mult = Math.max(mult, r.m);
          }
        }
        points += basePts * mult;
      }
      if (points > 0 || seen.size > 0) scores.set(m.id, { name: m.name, points: points + (adjMap.get(m.id) || 0) });
    }

    const entries = [...scores.entries()].sort((a, b) => b[1].points - a[1].points).map(([id, s]) => ({ id, name: s.name, points: s.points }));
    return new Response(JSON.stringify(entries), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }
});
