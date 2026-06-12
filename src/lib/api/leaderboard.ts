import { supabase, getCurrentServerId } from "./client";
import type { LeaderboardEntry } from "@/types";
import { supabaseUrl, supabaseKey } from "./client";

// ── Leaderboard ─────────────────────────────────────────────

export async function fetchLeaderboardResetAt(serverId?: string | null): Promise<string | null> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return null;
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "leaderboard_reset_at")
    .eq("server_id", sid)
    .maybeSingle();

  if (error || !data) return null;
  return data.value;
}

export async function fetchLeaderboard(serverId?: string | null): Promise<LeaderboardEntry[]> {
  return fetchLeaderboardByPeriod("1970-01-01T00:00:00Z", serverId);
}

export async function fetchLeaderboardByPeriod(
  since: string | null,
  serverId?: string | null
): Promise<LeaderboardEntry[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];

  // Use RPC first — includes both boss + activity points
  const { data, error } = await supabase
    .rpc("get_leaderboard", { p_server_id: sid, p_since: since });

  if (!error && data) {
    return ((data as any[]) ?? []).map((row: any) => ({
      id: row.member_id, name: row.member_name, points: row.total_points,
      last_attended: row.last_attended,
    }));
  }

  // Fallback: edge function
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/get-leaderboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ server_id: sid, since }),
    });
    if (resp.ok) return await resp.json();
  } catch { /* fall through */ }

  return [];
}

export async function resetGuildPoints(
  guildId: string,
  serverId: string
): Promise<{ deletedAttendance: number; deletedAdjustments: number }> {
  const { data: members, error: memErr } = await supabase
    .from("members")
    .select("id")
    .eq("guild_id", guildId)
    .eq("server_id", serverId);
  if (memErr) throw memErr;
  const memberIds = (members || []).map((m: any) => m.id);
  if (memberIds.length === 0) return { deletedAttendance: 0, deletedAdjustments: 0 };

  const { count: attCount, error: attErr } = await supabase
    .from("attendance_records")
    .delete({ count: "exact" })
    .in("member_id", memberIds)
    .eq("server_id", serverId);
  if (attErr) throw attErr;

  const { count: adjCount, error: adjErr } = await supabase
    .from("point_adjustments")
    .delete({ count: "exact" })
    .in("member_id", memberIds)
    .eq("server_id", serverId);
  if (adjErr) throw adjErr;

  return { deletedAttendance: attCount ?? 0, deletedAdjustments: adjCount ?? 0 };
}

export async function adjustMemberPoints(
  memberId: string,
  serverId: string,
  points: number,
  reason: string = ""
): Promise<string> {
  const { data, error } = await supabase
    .rpc("adjust_member_points", {
      p_member_id: memberId,
      p_server_id: serverId,
      p_points: points,
      p_reason: reason,
    });
  if (error) throw error;
  return data as string;
}

export async function fetchPointAdjustments(
  serverId: string,
  memberId?: string | null,
  since?: string | null
): Promise<import("@/types").PointAdjustment[]> {
  const { data, error } = await supabase
    .rpc("fetch_point_adjustments", {
      p_server_id: serverId,
      p_member_id: memberId ?? null,
    });
  if (error) throw error;
  let results = (data ?? []) as import("@/types").PointAdjustment[];
  // Filter client-side by since date (RPC doesn't support this parameter yet)
  if (since) {
    const cutoff = new Date(since);
    results = results.filter(a => new Date(a.created_at) >= cutoff);
  }
  return results;
}

// ── Member Kill History ─────────────────────────────────────

export type { MemberBossKill, MemberActivityAttendance } from "../../../shared/types";

export async function fetchMemberKills(
  memberId: string,
  since?: string,
  serverId?: string | null,
  serverTimezone?: string,
): Promise<MemberBossKill[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];

  // 1. Fetch attendance records via edge function
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/get-member-kills`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ member_id: memberId, server_id: sid, since, timezone: serverTimezone }),
    });
    if (resp.ok) {
      const kills = await resp.json();
      if (kills?.length) return kills;
    }
  } catch { /* fall through */ }

  // 2. Fallback: direct query
  let query = supabase
    .from("attendance_records")
    .select("death_record_id, death_records!inner(death_time, boss_id, owner_guild_id, bosses!inner(name, boss_points, image_url))")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  if (since) query = query.gte("created_at", since);
  if (sid) query = query.eq("server_id", sid);

  const { data: rawData, error } = await query;
  if (error) throw error;
  if (!rawData?.length) return [];

  const data = rawData;

  // Get member's guild
  const { data: memberData } = await supabase
    .from("members")
    .select("guild_id")
    .eq("id", memberId)
    .maybeSingle();
  const guildId = (memberData as any)?.guild_id as string | null;

  // Get unique boss IDs for per-guild override lookup and resolve guild names
  const bossIds = [...new Set((data as any[]).map((r: any) => r.death_records.boss_id))];

  // Fetch guild names for owner_guild_id resolution
  let guildNameMap = new Map<string, string>();
  const { data: guildData } = await supabase.from("guilds").select("id, name").eq("server_id", sid);
  for (const g of (guildData || [])) { guildNameMap.set(g.id, g.name); }

  // Fetch per-guild point overrides
  let bgPointsMap = new Map<string, number>();
  if (guildId && bossIds.length > 0) {
    const { data: bgData } = await supabase
      .from("boss_guilds")
      .select("boss_id, points")
      .eq("guild_id", guildId)
      .in("boss_id", bossIds);
    for (const bg of (bgData || [])) {
      if ((bg as any).points != null) {
        const bossId = (bg as any).boss_id;
        const pts = (bg as any).points;
        if (!bgPointsMap.has(bossId) || pts > bgPointsMap.get(bossId)!) {
          bgPointsMap.set(bossId, pts);
        }
      }
    }
  }

  // Fetch time-based multipliers
  let guildMultipliers: { start_hour: number; end_hour: number; multiplier: number }[] = [];
  if (guildId) {
    const { data: rules } = await supabase
      .from("point_rules")
      .select("config")
      .eq("server_id", sid)
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

  const getMultiplier = (deathTime: string): number => {
    if (!guildMultipliers.length) return 1;
    const tz = serverTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hour = parseInt(
      new Date(deathTime).toLocaleString("en-US", { timeZone: tz, hour: "2-digit", hour12: false }),
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

  return (data as any[]).map((row: any) => {
    const bossId = row.death_records.boss_id;
    const bossPoints = row.death_records.bosses.boss_points ?? 1;
    const basePts = guildId && bgPointsMap.has(bossId)
      ? bgPointsMap.get(bossId)!
      : bossPoints;
    const mult = guildId ? getMultiplier(row.death_records.death_time) : 1;
    const ownerGuildId = row.death_records.owner_guild_id;
    return {
      boss_name: row.death_records.bosses.name,
      killed_at: row.death_records.death_time,
      death_record_id: row.death_record_id,
      points: basePts * mult,
      image_url: row.death_records.bosses.image_url || null,
      guild_name: ownerGuildId ? guildNameMap.get(ownerGuildId) || null : null,
    };
  });
}

// ── Member Activity History ─────────────────────────────────

export async function fetchMemberActivityHistory(
  memberId: string,
  since?: string,
  serverId?: string | null,
): Promise<MemberActivityAttendance[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];

  const { data, error } = await supabase
    .from("activity_attendance")
    .select("activity_instance_id, activity_instances!inner(end_time, activity_id, activities!inner(name, points_per_participant))")
    .eq("member_id", memberId)
    .eq("present", true)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (data as any[]).map((row: any) => ({
    activity_name: row.activity_instances.activities.name,
    attended_at: row.activity_instances.end_time,
    activity_instance_id: row.activity_instance_id,
    points: row.activity_instances.activities.points_per_participant ?? 1,
  }));
}

// ── Leaderboard Snapshots ───────────────────────────────────

export async function saveLeaderboardSnapshot(
  period: string,
  rankings: { rank: number; memberId: string; memberName: string; points: number }[],
  periodStart: string,
  serverId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .insert({ period, period_start: periodStart, rankings, server_id: serverId })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function fetchLeaderboardSnapshots(serverId?: string | null): Promise<
  { id: string; finalized_at: string; period_start?: string; period: string; ranking_count: number; top_name?: string; top_points?: number }[]
> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/get-snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ server_id: sid }),
    });
    if (resp.ok) return await resp.json();
  } catch { /* fall through */ }

  let query = supabase
    .from("leaderboard_snapshots")
    .select("id, finalized_at, period_start, period, rankings")
    .order("finalized_at", { ascending: false })
    .limit(50);
  if (sid) query = query.eq("server_id", sid);
  const { data, error } = await query;

  if (error) throw error;

  return (data as any[]).map((row) => {
    const rankings = Array.isArray(row.rankings) ? row.rankings : [];
    const top = rankings[0] as { memberName?: string; member_name?: string; points?: number } | undefined;
    return {
      id: row.id,
      finalized_at: row.finalized_at,
      period_start: row.period_start ?? undefined,
      period: row.period,
      ranking_count: rankings.length,
      top_name: top?.memberName ?? top?.member_name ?? undefined,
      top_points: top?.points ?? undefined,
    };
  });
}

export async function fetchSnapshotById(id: string, serverId: string): Promise<{
  id: string;
  finalized_at: string;
  period: string;
  rankings: { rank: number; memberId: string; memberName: string; points: number }[];
}> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/get-snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ server_id: serverId, snapshot_id: id }),
    });
    if (resp.ok) return await resp.json();
  } catch { /* fall through */ }

  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .select("*")
    .eq("id", id)
    .eq("server_id", serverId)
    .single();

  if (error) throw error;
  return data as any;
}
