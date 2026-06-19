import { supabase, getCurrentServerId } from "./client";

// ── Analytics ───────────────────────────────────────────────

export interface AnalyticsData {
  total_kills: number;
  total_attendance: number;
  active_members: number;
  kills_by_week: { week_label: string; count: number }[];
  kills_by_date: { date: string; count: number }[];
  kills_by_date_detail: { date: string; count: number; bosses: { name: string; guild: string | null; kills: number; last_death: string }[] }[];
  kills_by_guild_series: { guild: string | null; data: { date: string; count: number }[] }[];
  top_bosses: { name: string; kills: number }[];
  top_bosses_by_guild: { name: string; kills: number; avg_attendance: number; by_guild: { guild: string | null; count: number }[] }[];
  top_hunters: { name: string; attended: number }[];
  kills_by_day: { day: string; count: number }[];
  kills_by_day_by_guild: { day: string; count: number; by_guild: { guild: string | null; count: number }[] }[];
  total_activities: number;
  activity_participation: number;
  activity_completion_rate: number;
}

export async function fetchAnalytics(since: string, serverId?: string | null): Promise<AnalyticsData> {
  const sid = serverId ?? getCurrentServerId();
  const empty = { total_kills: 0, total_attendance: 0, active_members: 0, kills_by_week: [], kills_by_date: [], kills_by_date_detail: [], kills_by_guild_series: [], top_bosses: [], top_bosses_by_guild: [], top_hunters: [], kills_by_day: [], kills_by_day_by_guild: [], total_activities: 0, activity_participation: 0, activity_completion_rate: 0 };
  if (!sid) return empty;

  // Get death records since date (paginated)
  const deaths: any[] = [];
  const PAGE_SIZE = 1000;
  let page = 0;
  while (true) {
    const { data: pageData, error: dErr } = await supabase
      .from("death_records")
      .select("id, death_time, boss_id, owner_guild_id")
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

  // Get attendance — batched .in() to avoid URL length limits on large datasets
  let att: any[] = [];
  {
    const BATCH_SIZE = 200; // keep URL length under Supabase's ~8KB limit
    for (let i = 0; i < deathIds.length; i += BATCH_SIZE) {
      const idBatch = deathIds.slice(i, i + BATCH_SIZE);
      let attPage = 0;
      while (true) {
        const { data: batch, error: aErr } = await supabase
          .from("attendance_records")
          .select("death_record_id, member_id")
          .in("death_record_id", idBatch)
          .range(attPage * 1000, (attPage + 1) * 1000 - 1);
        if (aErr) { console.warn("attendance fetch error:", aErr); break; }
        if (!batch?.length) break;
        att.push(...batch);
        if (batch.length < 1000) break;
        attPage++;
      }
    }
  }

  // Get bosses for names (boss count is usually small, single query is fine)
  const bossIds = [...new Set(deaths.map(d => d.boss_id))];
  const { data: bosses, error: bErr } = await supabase
    .from("bosses")
    .select("id, name")
    .in("id", bossIds);
  if (bErr) throw bErr;
  const bossNameMap = new Map((bosses || []).map(b => [b.id, b.name]));

  // Get guild ownership for bosses
  const bossGuildMap = new Map<string, string | null>(); // current owner (for trend chart)
  const guildNameById = new Map<string, string>(); // all guild IDs → names
  try {
    const { data: bg } = await supabase
      .from("boss_guilds")
      .select("boss_id, guild_id, sort_order")
      .order("sort_order", { ascending: false })
      .in("boss_id", bossIds.length ? bossIds : ["00000000-0000-0000-0000-000000000000"]);
    if (bg?.length) {
      const guildIds = [...new Set(bg.map(r => r.guild_id))];
      const { data: guildData } = await supabase
        .from("guilds")
        .select("id, name")
        .in("id", guildIds);
      for (const g of (guildData ?? [])) guildNameById.set(g.id, g.name);
      for (const row of bg) {
        const gName = guildNameById.get(row.guild_id) ?? null;
        if (!bossGuildMap.has(row.boss_id)) {
          bossGuildMap.set(row.boss_id, gName);
        }
      }
    }
  } catch { /* guild lookup is best-effort */ }

  // Also fetch guild names for owner_guild_id values from death records
  const deathGuildIds = [...new Set(deaths.map(d => d.owner_guild_id).filter(Boolean) as string[])];
  const missingGuildIds = deathGuildIds.filter(id => !guildNameById.has(id));
  if (missingGuildIds.length > 0) {
    try {
      const { data: extraGuilds } = await supabase
        .from("guilds")
        .select("id, name")
        .in("id", missingGuildIds);
      for (const g of (extraGuilds ?? [])) guildNameById.set(g.id, g.name);
    } catch { /* best-effort */ }
  }

  // Get members for names — batched to avoid URL length limits
  const memberIds = [...new Set((att || []).map(a => a.member_id))];
  const memberNameMap = new Map<string, string>();
  const MEMBER_BATCH = 200;
  for (let i = 0; i < memberIds.length; i += MEMBER_BATCH) {
    const idBatch = memberIds.slice(i, i + MEMBER_BATCH);
    const { data: members, error: mErr } = await supabase
      .from("members")
      .select("id, name")
      .in("id", idBatch);
    if (mErr) throw mErr;
    (members || []).forEach((m: any) => memberNameMap.set(m.id, m.name));
  }

  const totalKills = deaths.length;
  const totalAttendance = (att || []).length;
  // Activity stats — completed instances within date range
  let totalActivities = 0;
  let activityParticipation = 0;
  let activityMemberIds = new Set<string>();

  try {
    // Get activities for this server first (no server_id on activity_instances)
    const { data: serverActivities } = await supabase
      .from("activities")
      .select("id")
      .eq("server_id", sid)
      .is("deleted_at", null);

    if (serverActivities?.length) {
      const serverActivityIds = serverActivities.map(a => a.id);

      const { data: activityInstances } = await supabase
        .from("activity_instances")
        .select("id, activity_id, start_time, end_time")
        .in("activity_id", serverActivityIds)
        .not("end_time", "is", null)
        .gte("end_time", since)
        .order("end_time", { ascending: false })
        .limit(5000);

      if (activityInstances?.length) {
        totalActivities = activityInstances.length;

        // Get activity attendance
        const instanceIds = activityInstances.map(ai => ai.id);
        for (let i = 0; i < instanceIds.length; i += 500) {
          const batch = instanceIds.slice(i, i + 500);
          try {
            const { data: batchData } = await supabase
              .from("activity_attendance")
              .select("activity_instance_id, member_id")
              .in("activity_instance_id", batch)
              .eq("present", true);
            if (batchData) {
              activityParticipation += batchData.length;
              for (const aa of batchData) activityMemberIds.add(aa.member_id);
            }
          } catch (err) { console.error("[analytics] activity attendance batch fetch failed:", err); }
        }
      }
    }
  } catch (err) { console.error("[analytics] activity stats fetch failed:", err); }

  const allActiveMemberIds = new Set([...new Set((att || []).map((a: any) => a.member_id)), ...activityMemberIds]);
  const activeMembers = allActiveMemberIds.size;

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

  // Kills by date (daily time series for trend chart)
  const dateMap = new Map<string, number>();
  for (const d of deaths) {
    const dt = new Date(d.death_time);
    const dateKey = dt.toISOString().slice(0, 10); // YYYY-MM-DD
    dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + 1);
  }
  const killsByDate = [...dateMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  // Detailed daily breakdown: boss names + kill counts + guild ownership per day
  const detailMap = new Map<string, Map<string, { guild: string | null; count: number; lastDeath: string }>>();
  for (const d of deaths) {
    const dateKey = new Date(d.death_time).toISOString().slice(0, 10);
    if (!detailMap.has(dateKey)) detailMap.set(dateKey, new Map());
    const bossName = bossNameMap.get(d.boss_id) || "Unknown";
    const guildName = d.owner_guild_id ? (guildNameById.get(d.owner_guild_id) ?? null) : null;
    const deathTime = d.death_time;
    const dayMap = detailMap.get(dateKey)!;
    const existing = dayMap.get(bossName);
    if (existing) {
      existing.count++;
      if (deathTime > existing.lastDeath) existing.lastDeath = deathTime;
    } else {
      dayMap.set(bossName, { guild: guildName, count: 1, lastDeath: deathTime });
    }
  }
  const killsByDateDetail = killsByDate.map(({ date, count }) => {
    const bossMap = detailMap.get(date) || new Map();
    const bosses = [...bossMap.entries()]
      .map(([name, info]) => ({ name, guild: info.guild, kills: info.count, last_death: info.lastDeath }))
      .sort((a, b) => b.last_death.localeCompare(a.last_death)); // most recent first
    return { date, count, bosses };
  });

  // Per-guild daily series (for multi-line trend chart)
  const guildDateMap = new Map<string, Map<string, number>>(); // guildName -> dateKey -> count
  for (const d of deaths) {
    const dateKey = new Date(d.death_time).toISOString().slice(0, 10);
    const guildName = d.owner_guild_id ? (guildNameById.get(d.owner_guild_id) ?? "__unguilded__") : "__unguilded__";
    if (!guildDateMap.has(guildName)) guildDateMap.set(guildName, new Map());
    const gdm = guildDateMap.get(guildName)!;
    gdm.set(dateKey, (gdm.get(dateKey) || 0) + 1);
  }
  // Build series with zero-filled data for all dates (so lines align)
  const allDates = killsByDate.map(d => d.date);
  const killsByGuildSeries = [...guildDateMap.entries()]
    .sort(([a], [b]) => {
      if (a === "__unguilded__") return 1; // unassigned last
      if (b === "__unguilded__") return -1;
      return a.localeCompare(b);
    })
    .map(([guild, dateCounts]) => ({
      guild: guild === "__unguilded__" ? null : guild,
      data: allDates.map(date => ({ date, count: dateCounts.get(date) || 0 })),
    }));

  // Top bosses — total counts from raw deaths
  const bossCounts = new Map<string, number>();
  for (const d of deaths) {
    const name = bossNameMap.get(d.boss_id) || "Unknown";
    bossCounts.set(name, (bossCounts.get(name) || 0) + 1);
  }
  const topBosses = [...bossCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([name, kills]) => ({ name, kills }));

  // Compute attendance per death record, then average per boss
  const attPerDeath = new Map<string, number>(); // deathId -> attendance count
  for (const a of (att ?? [])) {
    attPerDeath.set(a.death_record_id, (attPerDeath.get(a.death_record_id) || 0) + 1);
  }
  // Map death -> boss name, sum attendance per boss
  const bossAttTotals = new Map<string, number>(); // bossName -> total attendance
  const bossKillCounts = new Map<string, number>(); // bossName -> total kills (for avg)
  for (const d of deaths) {
    const name = bossNameMap.get(d.boss_id) || "Unknown";
    bossKillCounts.set(name, (bossKillCounts.get(name) || 0) + 1);
    bossAttTotals.set(name, (bossAttTotals.get(name) || 0) + (attPerDeath.get(d.id) || 0));
  }

  // Top bosses by guild — attribute each kill to its death record's guild owner
  const bossGuildTotals = new Map<string, Map<string, number>>();
  for (const d of deaths) {
    const name = bossNameMap.get(d.boss_id) || "Unknown";
    const gName = (d.owner_guild_id ? guildNameById.get(d.owner_guild_id) : null) ?? "__unguilded__";
    if (!bossGuildTotals.has(name)) bossGuildTotals.set(name, new Map());
    const gm = bossGuildTotals.get(name)!;
    gm.set(gName, (gm.get(gName) || 0) + 1);
  }
  const topBossesByGuild = [...bossGuildTotals.entries()]
    .sort((a, b) => {
      const aTotal = [...a[1].values()].reduce((s, c) => s + c, 0);
      const bTotal = [...b[1].values()].reduce((s, c) => s + c, 0);
      return bTotal - aTotal;
    })
    .slice(0, 50)
    .map(([name, gm]) => {
      const total = [...gm.values()].reduce((s, c) => s + c, 0);
      const totalKillCount = bossKillCounts.get(name) || 1;
      const avgAtt = Math.round((bossAttTotals.get(name) || 0) / totalKillCount);
      const byGuild = [...gm.entries()]
        .map(([guild, count]) => ({ guild: guild === "__unguilded__" ? null : guild, count }))
        .sort((a, b) => {
          if (a.guild === null) return 1;
          if (b.guild === null) return -1;
          return (a.guild ?? "").localeCompare(b.guild ?? "");
        });
      return { name, kills: total, avg_attendance: avgAtt, by_guild: byGuild };
    });

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

  // Kills by day of week — attribute each kill to its death record's guild owner
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayGuildCounts = new Map<number, Map<string, number>>();
  for (const d of deaths) {
    const day = d.death_time ? new Date(d.death_time).getDay() : -1;
    const gName = (d.owner_guild_id ? guildNameById.get(d.owner_guild_id) : null) ?? "__unguilded__";
    if (!dayGuildCounts.has(day)) dayGuildCounts.set(day, new Map());
    const gm = dayGuildCounts.get(day)!;
    gm.set(gName, (gm.get(gName) || 0) + 1);
  }
  const killsByDay = dayNames.map(day => ({ day, count: dayGuildCounts.get(dayNames.indexOf(day)) ? [...dayGuildCounts.get(dayNames.indexOf(day))!.values()].reduce((s, c) => s + c, 0) : 0 }));
  const killsByDayByGuild = dayNames.map(day => {
    const idx = dayNames.indexOf(day);
    const gm = dayGuildCounts.get(idx) || new Map();
    const byGuild = [...gm.entries()]
      .map(([guild, count]) => ({ guild: guild === "__unguilded__" ? null : guild, count }))
      .sort((a, b) => {
        if (a.guild === null) return 1;
        if (b.guild === null) return -1;
        return (a.guild ?? "").localeCompare(b.guild ?? "");
      });
    return { day, count: byGuild.reduce((s, g) => s + g.count, 0), by_guild: byGuild };
  });

  return { total_kills: totalKills, total_attendance: totalAttendance, active_members: activeMembers, kills_by_week: killsByWeek, kills_by_date: killsByDate, kills_by_date_detail: killsByDateDetail, kills_by_guild_series: killsByGuildSeries, top_bosses: topBosses, top_bosses_by_guild: topBossesByGuild, top_hunters: topHunters, kills_by_day: killsByDay, kills_by_day_by_guild: killsByDayByGuild, total_activities: totalActivities, activity_participation: activityParticipation, activity_completion_rate: 0 };
}
