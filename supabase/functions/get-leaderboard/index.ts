// ── Leaderboard Edge Function v3 ──────────────────────────
// Same point logic as history modal. Queries attendance by server_id.
// @ts-nocheck
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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { server_id, since } = await req.json();
    if (!server_id) return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get server timezone
    const { data: srv } = await supabase.from("servers").select("timezone").eq("id", server_id).single();
    const tz = srv?.timezone || "UTC";

    // Get members
    const { data: members } = await supabase.from("members").select("id, name, guild_id").eq("server_id", server_id);
    if (!members?.length) return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });

    // Get guild resets — fetch ALL app_settings and filter in JS
    const { data: allSettings } = await supabase.from("app_settings").select("key, value").eq("server_id", server_id);
    const guildResets = new Map<string, string>();
    for (const s of allSettings || []) {
      if (s.key.startsWith("leaderboard_reset_at:")) {
        guildResets.set(s.key.replace("leaderboard_reset_at:", ""), s.value);
      }
    }

    // Build guild id→name map
    const { data: guilds } = await supabase.from("guilds").select("id, name").eq("server_id", server_id);
    const guildIdToName = new Map((guilds || []).map(g => [g.id, g.name]));

    // Get attendance — paginate to bypass 1000-row PostgREST limit
    let allAtt: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error: attErr } = await supabase.from("attendance_records")
        .select("id, member_id, death_record_id, created_at")
        .eq("server_id", server_id)
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (attErr || !page?.length) break;
      allAtt = allAtt.concat(page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    const att = allAtt;

    // Get deaths — chunk the id list AND paginate. A single .in() over every death
    // id on the server silently truncates at PostgREST's 1000-row cap, so most
    // kills fell out of deathMap and were skipped by `if (!death) continue`, which
    // drove this path's boss points to near zero. It also let late-attendance
    // credits escape suppression, since that check no-ops when the linked kill is
    // missing. Chunks stay small enough to keep the request URL under the limit.
    const deathIds = [...new Set((att || []).map(a => a.death_record_id))];
    const deaths: any[] = [];
    for (let i = 0; i < deathIds.length; i += 150) {
      const chunk = deathIds.slice(i, i + 150);
      for (let off = 0; ; off += pageSize) {
        const { data: page, error: drErr } = await supabase.from("death_records")
          .select("id, death_time, boss_id")
          .in("id", chunk)
          .range(off, off + pageSize - 1);
        if (drErr || !page?.length) break;
        deaths.push(...page);
        if (page.length < pageSize) break;
      }
    }

    // Get bosses
    const bossIds = [...new Set((deaths || []).map(d => d.boss_id))];
    // PostgREST swaps boss_points↔points columns: requesting "boss_points" returns the points (server override) value
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

    // Point adjustments — paginated, and grouped per member so the same reset
    // cutoff that gates kills can be applied to them below. Previously this summed
    // every adjustment ever made on the server, ignoring the reset entirely.
    let allAdj: any[] = [];
    let adjOffset = 0;
    while (true) {
      const { data: page, error: adjErr } = await supabase.from("point_adjustments")
        .select("member_id, points, created_at, attendance_record_id")
        .eq("server_id", server_id)
        .order("created_at", { ascending: false })
        .range(adjOffset, adjOffset + pageSize - 1);
      if (adjErr || !page?.length) break;
      allAdj = allAdj.concat(page);
      if (page.length < pageSize) break;
      adjOffset += pageSize;
    }
    const adjByMember = new Map<string, any[]>();
    for (const a of allAdj) {
      if (!adjByMember.has(a.member_id)) adjByMember.set(a.member_id, []);
      adjByMember.get(a.member_id)!.push(a);
    }

    // Maps
    const deathMap = new Map((deaths || []).map(d => [d.id, d]));
    const bossMap = new Map((bosses || []).map(b => [b.id, b]));
    // attendance id → its kill, for late-attendance credits (see 20260814000000)
    const attById = new Map((att || []).map(a => [a.id, a]));

    // Compute per-member scores (same dedup logic as fetchMemberKills)
    const scores = new Map<string, { name: string; points: number }>();
    for (const m of members) {
      const guildName = guildIdToName.get(m.guild_id) || "";
      const hasReset = guildResets.has(guildName);
      let points = 0;
      const seen = new Set<string>();

      for (const a of (att || [])) {
        if (a.member_id !== m.id) continue;
        const death = deathMap.get(a.death_record_id);
        if (!death) continue;
        // Explicit since filter
        if (since && new Date(death.death_time) < new Date(since)) continue;
        // Per-guild reset filter: only if guild HAS a reset date
        // Uses death.death_time (kill time), not a.created_at (row write time), so a
        // corrected/re-matched attendance row on an already-finalized kill doesn't
        // reappear on the live board.
        // Compare as Dates: app_settings stores "…T17:22:00.000Z" while PostgREST
        // returns "… 13:36:02.373+00", and a raw string < on those two formats
        // compares the space against the "T" rather than the time.
        if (!since && hasReset) {
          if (death.death_time && new Date(death.death_time) < new Date(guildResets.get(guildName)!)) continue;
        }
        // Dedup
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
      // Adjustments, gated by the same window as kills above.
      const windowStartRaw = since || (hasReset ? guildResets.get(guildName)! : null);
      const windowStart = windowStartRaw ? new Date(windowStartRaw) : null;
      let adjPoints = 0;
      for (const a of (adjByMember.get(m.id) || [])) {
        if (windowStart && new Date(a.created_at) < windowStart) continue;
        // A late-attendance credit stands down whenever its own kill is back
        // inside the window and scoring on its own account (see 20260814000001).
        if (a.attendance_record_id) {
          const linked = attById.get(a.attendance_record_id);
          const linkedDeath = linked ? deathMap.get(linked.death_record_id) : null;
          if (linkedDeath?.death_time && (!windowStart || new Date(linkedDeath.death_time) >= windowStart)) continue;
        }
        adjPoints += a.points;
      }

      scores.set(m.id, { name: m.name, points: points + adjPoints });
    }

    const entries = [...scores.entries()].sort((a, b) => b[1].points - a[1].points).map(([id, s]) => ({ id, name: s.name, points: s.points }));
    return new Response(JSON.stringify(entries), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
