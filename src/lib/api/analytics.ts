import { supabase, getCurrentServerId } from "./client";
import { supabaseUrl, supabaseKey } from "./client";

// ── Analytics ───────────────────────────────────────────────

export interface AnalyticsData {
  total_kills: number;
  total_attendance: number;
  active_members: number;
  kills_by_week: { week_label: string; count: number }[];
  top_bosses: { name: string; kills: number }[];
  top_hunters: { name: string; attended: number }[];
  kills_by_day: { day: string; count: number }[];
  total_activities: number;
  activity_participation: number;
  activity_completion_rate: number;
}

export async function fetchAnalytics(since: string, serverId?: string | null): Promise<AnalyticsData> {
  const sid = serverId ?? getCurrentServerId();
  const empty = { total_kills: 0, total_attendance: 0, active_members: 0, kills_by_week: [], top_bosses: [], top_hunters: [], kills_by_day: [], total_activities: 0, activity_participation: 0, activity_completion_rate: 0 };
  if (!sid) return empty;

  // Get death records since date (paginated)
  const deaths: any[] = [];
  const PAGE_SIZE = 1000;
  let page = 0;
  while (true) {
    const { data: pageData, error: dErr } = await supabase
      .from("death_records")
      .select("id, death_time, boss_id")
      .eq("server_id", sid)
      .gte("death_time", since)
      .order("death_time", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (dErr) throw dErr;
    if (!pageData?.length) break;
    deaths.push(...pageData);
    if (pageData.length < PAGE_SIZE) break;
    page++;
  }
  if (!deaths?.length) return empty;

  const deathIds = deaths.map(d => d.id);

  // Get attendance — batched via edge function
  let att: any[] = [];
  const ATT_BATCH = 500;
  for (let i = 0; i < deathIds.length; i += ATT_BATCH) {
    const batch = deathIds.slice(i, i + ATT_BATCH);
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/get-attendance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey,
        },
        body: JSON.stringify({ death_record_ids: batch }),
      });
      if (resp.ok) {
        const batchData = await resp.json();
        if (batchData?.length) att.push(...batchData);
      }
    } catch { /* continue to next batch */ }
  }

  if (!att.length) {
    const { data: directAtt, error: aErr } = await supabase
      .from("attendance_records")
      .select("death_record_id, member_id")
      .in("death_record_id", deathIds);
    if (aErr) throw aErr;
    att = directAtt || [];
  }

  // Get bosses for names
  const bossIds = [...new Set(deaths.map(d => d.boss_id))];
  const { data: bosses, error: bErr } = await supabase
    .from("bosses")
    .select("id, name")
    .in("id", bossIds);
  if (bErr) throw bErr;
  const bossNameMap = new Map((bosses || []).map(b => [b.id, b.name]));

  // Get members for names
  const memberIds = [...new Set((att || []).map(a => a.member_id))];
  const { data: members, error: mErr } = await supabase
    .from("members")
    .select("id, name")
    .in("id", memberIds);
  if (mErr) throw mErr;
  const memberNameMap = new Map((members || []).map(m => [m.id, m.name]));

  const totalKills = deaths.length;
  const totalAttendance = (att || []).length;
  const activeMembers = new Set((att || []).map(a => a.member_id)).size;

  // Kills by week
  const weekMap = new Map<string, number>();
  for (const d of deaths) {
    const dt = new Date(d.death_time);
    const day = dt.getDay();
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - (day === 0 ? 6 : day - 1));
    const label = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    weekMap.set(label, (weekMap.get(label) || 0) + 1);
  }
  const killsByWeek = [...weekMap.entries()]
    .sort((a, b) => new Date(`${a[0]}, ${new Date().getFullYear()}`).getTime() - new Date(`${b[0]}, ${new Date().getFullYear()}`).getTime())
    .map(([week_label, count]) => ({ week_label, count }));

  // Top bosses
  const bossCounts = new Map<string, number>();
  for (const d of deaths) {
    const name = bossNameMap.get(d.boss_id) || "Unknown";
    bossCounts.set(name, (bossCounts.get(name) || 0) + 1);
  }
  const topBosses = [...bossCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([name, kills]) => ({ name, kills }));

  // Top hunters
  const hunterCounts = new Map<string, number>();
  for (const a of att || []) {
    const name = memberNameMap.get(a.member_id) || "Unknown";
    hunterCounts.set(name, (hunterCounts.get(name) || 0) + 1);
  }
  const topHunters = [...hunterCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([name, attended]) => ({ name, attended }));

  // Kills by day of week
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayCounts = new Map<number, number>();
  for (const d of deaths) {
    const day = d.death_time ? new Date(d.death_time).getDay() : -1;
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
  }
  const killsByDay = dayNames.map(day => ({ day, count: dayCounts.get(dayNames.indexOf(day)) || 0 }));

  return { total_kills: totalKills, total_attendance: totalAttendance, active_members: activeMembers, kills_by_week: killsByWeek, top_bosses: topBosses, top_hunters: topHunters, kills_by_day: killsByDay, total_activities: 0, activity_participation: 0, activity_completion_rate: 0 };
}
