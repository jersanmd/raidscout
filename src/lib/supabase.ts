import { createClient } from "@supabase/supabase-js";
import type { Boss, DeathRecord, Member, AttendanceRecord, LeaderboardEntry } from "@/types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local"
  );
}

/** Check if Supabase is configured (not the placeholder values) */
export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseKey && !supabaseUrl.includes("your-project") && !supabaseKey.includes("your-key");
}

// Only create the client when properly configured, otherwise use a no-op placeholder
// that won't crash but will fail gracefully on any actual calls.
export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl!, supabaseKey!)
  : createClient("https://placeholder.supabase.co", "placeholder-key");

// ── Server ID helper (set by ServerContext, used by inserts) ──
let _currentServerId: string | null = null;
export function setCurrentServerId(id: string | null) { _currentServerId = id; }
export function getCurrentServerId(): string | null { return _currentServerId; }

// ── Viewer key helper (set by AuthContext, used for viewer writes) ──
let _currentViewerKey: string | null = null;
export function setCurrentViewerKey(key: string | null) { _currentViewerKey = key; }
export function getCurrentViewerKey(): string | null { return _currentViewerKey; }

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

export async function setBossPoints(bossId: string, points: number): Promise<void> {
  const { error } = await supabase
    .rpc("set_boss_points", { p_boss_id: bossId, p_points: points });
  if (error) throw error;
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
  deathTime: Date,
  ownerGuildId?: string | null
): Promise<DeathRecord> {
  // Prefer direct insert when user has a valid session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { data, error } = await supabase
      .from("death_records")
      .insert({
        boss_id: bossId,
        user_id: session.user.id,
        server_id: _currentServerId,
        death_time: deathTime.toISOString(),
        owner_guild_id: ownerGuildId ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as DeathRecord;
  }

  // Fall back to viewer RPC
  if (_currentViewerKey) {
    const { data, error } = await supabase
      .rpc("viewer_insert_death_record", {
        p_boss_id: bossId,
        p_death_time: deathTime.toISOString(),
        p_server_id: _currentServerId,
        p_viewer_key: _currentViewerKey,
        p_owner_guild_id: ownerGuildId ?? null,
      });
    if (error) throw error;
    return (data as any[])[0] as DeathRecord;
  }

  throw new Error("Not authenticated");
}

export async function deleteDeathRecord(recordId: string): Promise<void> {
  // Prefer direct delete when user has a valid session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { error } = await supabase.from("death_records").delete().eq("id", recordId);
    if (error) throw error;
    return;
  }

  // Fall back to viewer RPC
  if (_currentViewerKey) {
    const { error } = await supabase
      .rpc("viewer_delete_death_record", {
        p_record_id: recordId,
        p_viewer_key: _currentViewerKey,
      });
    if (error) throw error;
    return;
  }

  throw new Error("Not authenticated");
}

/** Adjust the last death record's time to set a new spawn date. Returns the updated record. */
export async function setBossSpawnTime(bossId: string, spawnDate: Date): Promise<DeathRecord | null> {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data: bossData, error: bossErr } = await supabase
    .from("bosses")
    .select("respawn_hours, server_id")
    .eq("id", bossId)
    .single();
  if (bossErr) throw bossErr;
  
  const respawnHours = (bossData as any)?.respawn_hours ?? 0;
  const serverId = (bossData as any)?.server_id ?? _currentServerId;
  const newDeathTime = new Date(spawnDate.getTime() - respawnHours * 3600000);

  const { data: deaths, error: fetchErr } = await supabase
    .from("death_records")
    .select("id")
    .eq("boss_id", bossId)
    .order("death_time", { ascending: false })
    .limit(1);

  if (fetchErr) throw fetchErr;

  if (!deaths || deaths.length === 0) {
    const { data: inserted, error } = await supabase.from("death_records")
      .insert({
        boss_id: bossId,
        user_id: user?.id,
        server_id: serverId,
        death_time: newDeathTime.toISOString(),
        is_initial_spawn: true,
      })
      .select()
      .single();
    if (error) throw error;
    return inserted as DeathRecord;
  } else {
    const { data: updated, error } = await supabase
      .from("death_records")
      .update({ death_time: newDeathTime.toISOString() })
      .eq("id", deaths[0].id)
      .select()
      .single();
    if (error) throw error;
    return updated as DeathRecord;
  }
}

// ── Realtime ────────────────────────────────────────────────

export function subscribeToDeathRecords(
  onInsert: (record: DeathRecord) => void,
  onUpdate: (record: DeathRecord) => void,
  onDelete: (record: { id: string }) => void
) {
  const chanName = `death_records_changes_${Date.now()}`;
  return supabase
    .channel(chanName)
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

/** Broadcast a spawn alert to all clients on the same server */
export function broadcastSpawnAlert(serverId: string, bossName: string) {
  const channel = supabase.channel(`spawn-alerts-${serverId}`, {
    config: { broadcast: { self: true } },
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      channel.send({
        type: "broadcast",
        event: "boss_spawned",
        payload: { bossName },
      });
      setTimeout(() => channel.unsubscribe(), 1000);
    }
  });
}

/** Listen for spawn alerts from other clients on the same server */
export function subscribeToSpawnAlerts(
  serverId: string,
  onSpawn: (bossName: string) => void
) {
  return supabase
    .channel(`spawn-alerts-${serverId}`)
    .on("broadcast", { event: "boss_spawned" }, ({ payload }) => {
      onSpawn(payload.bossName);
    })
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

  // Prefer direct upsert when user has a valid session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
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

  // Fall back to viewer RPC
  if (_currentViewerKey) {
    const { data, error } = await supabase
      .rpc("viewer_upsert_member", {
        p_name: trimmed,
        p_server_id: _currentServerId,
        p_viewer_key: _currentViewerKey,
      });
    if (error) throw error;
    return (data as any[])[0] as Member;
  }

  throw new Error("Not authenticated");
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
    .select("member_id, members!inner(name), created_at, death_record_id")
    .gte("created_at", since);
  if (sid) query = query.eq("server_id", sid);
  const { data, error } = await query;

  if (error) throw error;

  // Fetch boss points for all referenced death records
  const deathRecordIds = [...new Set((data as any[]).map(r => r.death_record_id).filter(Boolean))];
  let bossPointsMap = new Map<string, number>(); // death_record_id → boss_points
  if (deathRecordIds.length > 0) {
    try {
      const { data: drData } = await supabase
        .from("death_records")
        .select("id, boss_id")
        .in("id", deathRecordIds);
      if (drData) {
        const bossIds = [...new Set((drData as any[]).map(d => d.boss_id).filter(Boolean))];
        if (bossIds.length > 0) {
          const { data: bossData } = await supabase
            .from("bosses")
            .select("id, boss_points")
            .in("id", bossIds);
          if (bossData) {
            const bossPointMap = new Map((bossData as any[]).map(b => [b.id, b.boss_points ?? 1]));
            for (const dr of drData as any[]) {
              bossPointsMap.set(dr.id, bossPointMap.get(dr.boss_id) ?? 1);
            }
          }
        }
      }
    } catch { /* ignore — fall back to 1 point per attendance */ }
  }

  // Aggregate in JS
  const pointMap = new Map<string, { name: string; points: number; last: string }>();
  for (const row of data as any[]) {
    const id = row.member_id;
    const bossPts = bossPointsMap.get(row.death_record_id) ?? 1;
    const existing = pointMap.get(id);
    if (existing) {
      existing.points += bossPts;
      if (row.created_at > existing.last) existing.last = row.created_at;
    } else {
      pointMap.set(id, {
        name: row.members.name,
        points: bossPts,
        last: row.created_at,
      });
    }
  }

  // Fetch point adjustments for the same period and merge
  if (sid) {
    try {
      const { data: adjustments, error: adjErr } = await supabase
        .from("point_adjustments")
        .select("member_id, points, created_at")
        .eq("server_id", sid)
        .gte("created_at", since);

      if (!adjErr && adjustments) {
        for (const adj of adjustments as any[]) {
          const existing = pointMap.get(adj.member_id);
          if (existing) {
            existing.points += adj.points;
            if (adj.created_at > existing.last) existing.last = adj.created_at;
          }
          // If member has no attendance but has adjustments, still show them
          // (fetch name via members lookup below)
          if (!existing && adj.points > 0) {
            pointMap.set(adj.member_id, {
              name: "", // will be filled below
              points: adj.points,
              last: adj.created_at,
            });
          }
        }
      }
    } catch { /* adjustments optional — don't break leaderboard if they fail */ }
  }

  // Fill in names for adjustment-only entries
  const memberIds = Array.from(pointMap.entries())
    .filter(([, v]) => !v.name)
    .map(([id]) => id);

  if (memberIds.length > 0) {
    try {
      const { data: members } = await supabase
        .from("members")
        .select("id, name")
        .in("id", memberIds);
      if (members) {
        for (const m of members as any[]) {
          const entry = pointMap.get(m.id);
          if (entry && !entry.name) entry.name = m.name;
        }
      }
    } catch { /* ignore */ }
  }

  // Remove entries that ended up with ≤0 points or no name
  for (const [id, val] of pointMap) {
    if (val.points <= 0 || !val.name) pointMap.delete(id);
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

// ── Point Adjustments ───────────────────────────────────────

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
  memberId?: string | null
): Promise<import("@/types").PointAdjustment[]> {
  const { data, error } = await supabase
    .rpc("fetch_point_adjustments", {
      p_server_id: serverId,
      p_member_id: memberId ?? null,
    });
  if (error) throw error;
  return (data ?? []) as import("@/types").PointAdjustment[];
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
  // Prefer direct insert when user has a valid session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
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

  // Fall back to viewer RPC
  if (_currentViewerKey) {
    const { data, error } = await supabase
      .rpc("viewer_add_attendance", {
        p_death_record_id: deathRecordId,
        p_member_id: memberId,
        p_viewer_key: _currentViewerKey,
      });
    if (error) throw error;
    return (data as any[])[0] as AttendanceRecord;
  }

  throw new Error("Not authenticated");
}

export async function removeAttendance(attendanceId: string): Promise<void> {
  // Prefer direct delete when user has a valid session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { error } = await supabase
      .from("attendance_records")
      .delete()
      .eq("id", attendanceId);
    if (error) throw error;
    return;
  }

  // Fall back to viewer RPC
  if (_currentViewerKey) {
    const { error } = await supabase
      .rpc("viewer_remove_attendance", {
        p_attendance_id: attendanceId,
        p_viewer_key: _currentViewerKey,
      });
    if (error) throw error;
    return;
  }

  throw new Error("Not authenticated");
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
    .or("is_initial_spawn.is.null,is_initial_spawn.eq.false")
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
  supabase.functions.invoke("discord-notify", {
    body: {
      server_id: serverId,
      event,
      boss_name: data.boss_name,
      attendees: data.attendees,
      spawn_time: data.spawn_time,
      guild_name: data.guild_name,
    },
  }).then(({ error }) => {
    if (error) console.error("Discord notification failed:", error);
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
  const { data, error } = await supabase.functions.invoke("discord-notify", {
    body: {
      server_id: serverId,
      event: "spawn_announce",
      bosses,
    },
  });
  if (error) throw new Error(`Discord announce failed: ${error.message}`);
  return data;
}

/**
 * Adjust a boss's guild rotation position forward (+1) or backward (-1).
 * Returns the new rotation_adjustment value.
 */
export async function adjustBossRotation(bossId: string, direction: number): Promise<number> {
  const { data, error } = await supabase.rpc("adjust_boss_rotation", {
    p_boss_id: bossId,
    p_direction: direction,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

/**
 * Edit a death record's death time.
 */
export async function editDeathTime(deathRecordId: string, newDeathTime: Date): Promise<void> {
  const { error } = await supabase.rpc("edit_death_record_time", {
    p_death_record_id: deathRecordId,
    p_new_death_time: newDeathTime.toISOString(),
  });
  if (error) throw new Error(error.message);
}

/**
 * Set the display guild on a death record (cosmetic only — does not affect rotation).
 */
export async function setDeathDisplayGuild(deathRecordId: string, guildId: string): Promise<void> {
  const { error } = await supabase.rpc("set_death_display_guild", {
    p_death_record_id: deathRecordId,
    p_guild_id: guildId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Toggle whether viewers can edit spawn times and mark bosses as died.
 * Returns the new value.
 */
export async function toggleViewerCanEdit(serverId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_viewer_can_edit", {
    p_server_id: serverId,
  });
  if (error) throw new Error(error.message);
  return data as boolean;
}

/**
 * Toggle whether viewers can mark bosses as died.
 */
export async function toggleViewerCanMarkDied(serverId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_viewer_can_mark_died", {
    p_server_id: serverId,
  });
  if (error) throw new Error(error.message);
  return data as boolean;
}
