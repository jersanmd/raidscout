import { createClient } from "@supabase/supabase-js";
import type { Boss, DeathRecord, Member, AttendanceRecord, LeaderboardEntry } from "@/types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local"
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseKey || "");

/** Check if Supabase is configured (not the placeholder values) */
export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseKey && !supabaseUrl.includes("your-project") && !supabaseKey.includes("your-key");
}

// ── Server ID helper (set by ServerContext, used by inserts) ──
let _currentServerId: string | null = null;
export function setCurrentServerId(id: string | null) { _currentServerId = id; }
export function getCurrentServerId(): string | null { return _currentServerId; }

// ── Server Management ──────────────────────────────────────

import { BOSSES } from "./constants";

export async function createServer(name: string): Promise<{ id: string; name: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Use RPC function that creates server + seeds bosses in one transaction
  const { data, error } = await supabase
    .rpc("create_server_with_bosses", { server_name: name.trim() });

  if (error) throw error;
  return data as { id: string; name: string };
}

export async function updateServerName(serverId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("servers")
    .update({ name: name.trim() })
    .eq("id", serverId);
  if (error) throw error;
}

export async function deleteServer(serverId: string): Promise<void> {
  const { error } = await supabase.from("servers").delete().eq("id", serverId);
  if (error) throw error;
}

export async function transferServerOwnership(serverId: string, newOwnerId: string): Promise<void> {
  const { error } = await supabase
    .rpc("transfer_server_ownership", { s_id: serverId, new_owner_id: newOwnerId });

  if (error) throw error;
}

export async function transferServerOwnershipByEmail(serverId: string, email: string): Promise<void> {
  // Resolve user ID from email via RPC
  const { data, error } = await supabase
    .rpc("get_user_id_by_email", { user_email: email.toLowerCase().trim() });

  if (error || !data) {
    throw new Error(`Could not find user with email "${email}". Ask them to sign up first.`);
  }

  // Use SECURITY DEFINER RPC to bypass RLS on servers table
  const { error: transferErr } = await supabase
    .rpc("transfer_server_ownership", { s_id: serverId, new_owner_id: data as string });

  if (transferErr) throw transferErr;
}

export async function addServerModerator(serverId: string, email: string): Promise<void> {
  // Resolve user ID from email via RPC (requires the get_user_id_by_email function in Postgres)
  const { data, error } = await supabase
    .rpc("get_user_id_by_email", { user_email: email.toLowerCase().trim() });

  if (error || !data) {
    throw new Error(`Could not find user with email "${email}". Ask them to sign up first.`);
  }

  await addServerModeratorById(serverId, data as string);
}

export async function addServerModeratorById(serverId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("server_members")
    .upsert({ server_id: serverId, user_id: userId, role: "moderator" });
  if (error) throw error;
}

export async function removeServerModerator(serverId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("server_members")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ── Admin Queries ──────────────────────────────────────────

export async function fetchAllServers(): Promise<any[]> {
  const { data, error } = await supabase
    .from("servers")
    .select("id, name, owner_id, created_at");
  if (error) throw error;
  return data;
}

export async function fetchAllUsers(): Promise<any[]> {
  // Use RPC that joins auth.users with user_roles
  const { data, error } = await supabase
    .rpc("get_all_users");
  if (error) {
    // Fallback to user_roles only
    const { data: fallback, error: fbErr } = await supabase
      .from("user_roles")
      .select("user_id, role, created_at");
    if (fbErr) throw fbErr;
    return fallback;
  }
  return data;
}

// ── Server Members ──────────────────────────────────────────

export interface ServerMember {
  user_id: string;
  role: "owner" | "moderator";
  email?: string;
}

export async function fetchServerMembers(serverId: string): Promise<ServerMember[]> {
  // Use RPC that joins server_members with auth.users to get emails
  const { data, error } = await supabase
    .rpc("get_server_members", { s_id: serverId });
  if (error) throw error;
  return ((data as any[]) ?? []).map((row) => ({
    user_id: row.user_id,
    role: row.role,
    email: row.email ?? undefined,
  }));
}

// ── Bosses ──────────────────────────────────────────────────

export async function fetchBosses(serverId?: string | null): Promise<Boss[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase.from("bosses").select("*").order("name").eq("server_id", sid);

  const { data, error } = await query;

  if (error) throw error;
  return data as Boss[];
}

// ── Death Records ───────────────────────────────────────────

export async function fetchDeathRecords(serverId?: string | null): Promise<DeathRecord[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase.from("death_records").select("*").order("death_time", { ascending: false });
  if (sid) query = query.eq("server_id", sid);
  const { data, error } = await query;
  if (error) throw error;
  return data as DeathRecord[];
}

export async function insertDeathRecord(
  bossId: string,
  deathTime: Date
): Promise<DeathRecord> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("death_records")
    .insert({
      boss_id: bossId,
      user_id: user?.id,
      server_id: _currentServerId,
      death_time: deathTime.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as DeathRecord;
}

export async function deleteDeathRecord(recordId: string): Promise<void> {
  const { error } = await supabase.from("death_records").delete().eq("id", recordId);
  if (error) throw error;
}

// ── Realtime ────────────────────────────────────────────────

export function subscribeToDeathRecords(
  onInsert: (record: DeathRecord) => void,
  onUpdate: (record: DeathRecord) => void,
  onDelete: (record: { id: string }) => void
) {
  return supabase
    .channel("death_records_changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "death_records" },
      (payload) => onInsert(payload.new as DeathRecord)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "death_records" },
      (payload) => onUpdate(payload.new as DeathRecord)
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "death_records" },
      (payload) => onDelete(payload.old as { id: string })
    )
    .subscribe();
}

// ── Members ─────────────────────────────────────────────────

export async function fetchMembers(serverId?: string | null): Promise<Member[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase.from("members").select("*").order("name");
  if (sid) query = query.eq("server_id", sid);
  const { data, error } = await query;
  if (error) throw error;
  return data as Member[];
}

export async function upsertMember(name: string): Promise<Member> {
  const trimmed = name.trim();
  const { data: existing } = await supabase
    .from("members")
    .select("*")
    .eq("name", trimmed)
    .eq("server_id", _currentServerId)
    .maybeSingle();

  if (existing) return existing as Member;

  const { data, error } = await supabase
    .from("members")
    .insert({ name: trimmed, server_id: _currentServerId })
    .select()
    .single();

  if (error) throw error;
  return data as Member;
}

export async function updateMemberName(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("members")
    .update({ name: name.trim() })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteMember(id: string): Promise<void> {
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) throw error;
}

// ── Guilds ──────────────────────────────────────────────────

import type { Guild } from "@/types";

export async function fetchGuilds(serverId?: string | null): Promise<Guild[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase
    .from("guilds")
    .select("*")
    .eq("server_id", sid)
    .order("name");
  if (error) throw error;
  return data as Guild[];
}

export async function createGuild(name: string, serverId: string): Promise<Guild> {
  const { data, error } = await supabase
    .from("guilds")
    .insert({ name: name.trim(), server_id: serverId })
    .select()
    .single();
  if (error) throw error;
  return data as Guild;
}

export async function updateGuildName(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("guilds")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGuild(id: string): Promise<void> {
  const { error } = await supabase.from("guilds").delete().eq("id", id);
  if (error) throw error;
}

export async function setMemberGuild(memberId: string, guildId: string | null): Promise<void> {
  const { error } = await supabase
    .from("members")
    .update({ guild_id: guildId })
    .eq("id", memberId);
  if (error) throw error;
}

// ── Boss-Guild Assignments ─────────────────────────────────

import type { BossGuild } from "@/types";

export async function fetchBossGuilds(serverId?: string | null): Promise<BossGuild[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase
    .from("boss_guilds")
    .select("*, bosses!inner(server_id)")
    .eq("bosses.server_id", sid)
    .order("sort_order", { ascending: true })
    .order("day_of_week", { ascending: true });
  if (error) throw error;
  return data as BossGuild[];
}

export async function setBossGuilds(
  bossId: string,
  assignments: { guild_id: string; sort_order?: number; day_of_week?: number }[],
  mode: "rotation" | "schedule" | "daily" = "rotation"
): Promise<void> {
  // Delete existing assignments for this boss, then insert new ones
  const { error: delErr } = await supabase
    .from("boss_guilds")
    .delete()
    .eq("boss_id", bossId);
  if (delErr) throw delErr;

  if (assignments.length === 0) return;

  const rows = assignments.map((a) => ({
    boss_id: bossId,
    guild_id: a.guild_id,
    sort_order: a.sort_order ?? null,
    day_of_week: a.day_of_week ?? null,
    mode,
  }));

  const { error } = await supabase.from("boss_guilds").insert(rows);
  if (error) throw error;
}

export async function getBossOwnerGuild(bossId: string): Promise<string | null> {
  const { data, error } = await supabase
    .rpc("get_boss_owner_guild", { b_id: bossId });
  if (error) throw error;
  return data as string | null;
}

// ── App Settings ────────────────────────────────────────────

export async function fetchLeaderboardResetAt(): Promise<string | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "leaderboard_reset_at")
    .maybeSingle();

  if (error || !data) return null;
  return data.value;
}


export async function fetchLeaderboard(serverId?: string | null): Promise<LeaderboardEntry[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase.from("leaderboard").select("*").gt("points", 0).order("points", { ascending: false });
  if (sid) query = query.eq("server_id", sid);
  const { data, error } = await query;
  if (error) throw error;
  return data as LeaderboardEntry[];
}

export async function fetchLeaderboardByPeriod(
  since: string, // ISO date string
  serverId?: string | null
): Promise<LeaderboardEntry[]> {
  // Count attendance records per member within the date range
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase
    .from("attendance_records")
    .select("member_id, members!inner(name), created_at")
    .gte("created_at", since);
  if (sid) query = query.eq("server_id", sid);
  const { data, error } = await query;

  if (error) throw error;

  // Aggregate in JS since Supabase doesn't support GROUP BY via REST
  const pointMap = new Map<string, { name: string; points: number; last: string }>();
  for (const row of data as any[]) {
    const id = row.member_id;
    const existing = pointMap.get(id);
    if (existing) {
      existing.points++;
      if (row.created_at > existing.last) existing.last = row.created_at;
    } else {
      pointMap.set(id, {
        name: row.members.name,
        points: 1,
        last: row.created_at,
      });
    }
  }

  return Array.from(pointMap.entries())
    .map(([id, val]) => ({
      id,
      name: val.name,
      points: val.points,
      last_attended: val.last,
    }))
    .filter((e) => e.points > 0)
    .sort((a, b) => b.points - a.points || b.last_attended.localeCompare(a.last_attended));
}

// ── Attendance ──────────────────────────────────────────────

export async function fetchAttendanceForDeath(deathRecordId: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("death_record_id", deathRecordId);

  if (error) throw error;
  return data as AttendanceRecord[];
}

export async function addAttendance(
  deathRecordId: string,
  memberId: string
): Promise<AttendanceRecord> {
  const { data, error } = await supabase
    .from("attendance_records")
    .insert({
      death_record_id: deathRecordId,
      member_id: memberId,
      server_id: _currentServerId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AttendanceRecord;
}

export async function removeAttendance(attendanceId: string): Promise<void> {
  const { error } = await supabase
    .from("attendance_records")
    .delete()
    .eq("id", attendanceId);

  if (error) throw error;
}

// ── Clear All Data ──────────────────────────────────────────

/**
 * Delete ALL attendance records, members, and death records.
 * Use with caution — irreversible.
 */
export async function clearAllData(): Promise<void> {
  // Order matters: delete attendance first (FK to death_records + members),
  // then death_records, then members
  const { error: attErr } = await supabase
    .from("attendance_records")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all

  if (attErr) throw attErr;

  const { error: drErr } = await supabase
    .from("death_records")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (drErr) throw drErr;

  const { error: memErr } = await supabase
    .from("members")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (memErr) throw memErr;
}

// ── Member Kill History ─────────────────────────────────────

export interface MemberBossKill {
  boss_name: string;
  killed_at: string;
  death_record_id: string;
}

/** Get all bosses a specific member participated in killing */
export async function fetchMemberKills(memberId: string, since?: string, serverId?: string | null): Promise<MemberBossKill[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase
    .from("attendance_records")
    .select("death_record_id, death_records!inner(death_time, bosses!inner(name))")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  if (since) {
    query = query.gte("created_at", since);
  }
  if (sid) query = query.eq("server_id", sid);

  const { data, error } = await query;

  if (error) throw error;

  return (data as any[]).map((row: any) => ({
    boss_name: row.death_records.bosses.name,
    killed_at: row.death_records.death_time,
    death_record_id: row.death_record_id,
  }));
}

// ── Analytics ───────────────────────────────────────────────

export interface AnalyticsData {
  total_kills: number;
  total_attendance: number;
  active_members: number;
  kills_by_week: { week_label: string; count: number }[];
  top_bosses: { name: string; kills: number }[];
  top_hunters: { name: string; attended: number }[];
  kills_by_day: { day: string; count: number }[];
}

export async function fetchAnalytics(since: string, serverId?: string | null): Promise<AnalyticsData> {
  const sid = serverId ?? getCurrentServerId();
  const { data, error } = await supabase
    .rpc("get_analytics", { since, s_id: sid || undefined });

  if (error) throw error;
  return data as AnalyticsData;
}

// ── History from Supabase ──────────────────────────────────

import type { HistoryEntry } from "./history";

export async function fetchHistoryFromSupabase(serverId?: string | null): Promise<HistoryEntry[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return []; // never fetch unfiltered
  let query = supabase
    .from("death_records")
    .select(`
      id, death_time,
      bosses!inner(id, name, spawn_type, respawn_hours, schedule),
      attendance_records(id)
    `)
    .order("death_time", { ascending: false })
    .limit(500);
  if (sid) query = query.eq("server_id", sid);
  const { data: deaths, error } = await query;

  if (error) throw error;

  // Deduplicate: inner join with attendance_records may return duplicate rows
  const seen = new Set<string>();
  const unique = (deaths as any[]).filter((d: any) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  return unique.map((d: any) => {
    const boss = d.bosses;
    const deathTime = new Date(d.death_time);
    let respawnTime: Date;

    if (boss.spawn_type === "fixed_hours") {
      respawnTime = new Date(deathTime.getTime() + boss.respawn_hours * 3600_000);
    } else {
      // For schedule bosses, find next spawn
      const schedule = boss.schedule as { day: number; time: string }[];
      respawnTime = new Date(deathTime);
      respawnTime.setHours(23, 59, 59, 999); // fallback

      // Find next schedule slot after death time
      for (let offset = 0; offset < 7; offset++) {
        const check = new Date(deathTime);
        check.setDate(check.getDate() + offset);
        for (const s of schedule) {
          const [h, m] = s.time.split(":").map(Number);
          const slot = new Date(check);
          slot.setHours(h, m, 0, 0);
          if (check.getDay() === s.day && slot > deathTime) {
            respawnTime = slot;
            offset = 99; // break outer
            break;
          }
        }
      }
    }

    return {
      id: d.id,
      bossName: boss.name,
      deathTime: d.death_time,
      respawnTime: respawnTime.toISOString(),
      spawnType: boss.spawn_type,
      deathRecordId: d.id,
      createdAt: d.death_time,
    };
  });
}

// ── Leaderboard Snapshots ───────────────────────────────────

export async function saveLeaderboardSnapshot(
  period: "all_time" | "weekly" | "monthly",
  rankings: { rank: number; memberId: string; memberName: string; points: number }[],
  periodStart: string
): Promise<string> {
  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .insert({ period, period_start: periodStart, rankings, server_id: getCurrentServerId() })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function fetchLeaderboardSnapshots(serverId?: string | null): Promise<
  { id: string; finalized_at: string; period_start?: string; period: string; ranking_count: number; top_name?: string; top_points?: number }[]
> {
  const sid = serverId ?? getCurrentServerId();
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

export async function fetchSnapshotById(id: string): Promise<{
  id: string;
  finalized_at: string;
  period: string;
  rankings: { rank: number; memberId: string; memberName: string; points: number }[];
}> {
  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as any;
}

// ── Discord Notifications ──────────────────────────────────

export async function notifyDiscord(
  serverId: string,
  event: "boss_died" | "boss_spawned",
  data: { boss_name: string; attendees?: string[]; spawn_time?: string; guild_name?: string }
) {
  const functionUrl = `${supabaseUrl}/functions/v1/discord-notify`;
  fetch(functionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      server_id: serverId,
      event,
      boss_name: data.boss_name,
      attendees: data.attendees,
      spawn_time: data.spawn_time,
      guild_name: data.guild_name,
    }),
  }).then(async (res) => {
    if (!res.ok) console.error("Discord notification failed:", res.status, await res.text());
  }).catch((err) => {
    console.error("Discord notification failed:", err);
  }); // fire-and-forget, don't block the UI
}

export interface SpawnAnnounceBoss {
  name: string;
  spawn_time: string; // formatted time string, e.g. "03:56 PM"
  unix_spawn_time?: number; // Unix timestamp in seconds for <t:TIMESTAMP:R> Discord formatting
  guild_name?: string; // owning guild name
}

/**
 * Announce bosses spawning in the next 24 hours to Discord.
 * Sends a simple text-format message with @everyone ping.
 */
export async function announceSpawns(
  serverId: string,
  bosses: SpawnAnnounceBoss[]
) {
  const functionUrl = `${supabaseUrl}/functions/v1/discord-notify`;
  fetch(functionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      server_id: serverId,
      event: "spawn_announce",
      bosses,
    }),
  }).then(async (res) => {
    if (!res.ok) console.error("Spawn announcement failed:", res.status, await res.text());
  }).catch((err) => {
    console.error("Spawn announcement failed:", err);
  }); // fire-and-forget
}
