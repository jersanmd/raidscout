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

export async function createServer(name: string, guildName?: string): Promise<{ id: string; name: string; guild_id?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Use RPC function that creates server + seeds bosses + creates guild in one transaction
  const { data, error } = await supabase
    .rpc("create_server_with_bosses", { server_name: name.trim(), guild_name: guildName?.trim() || null });

  if (error) throw error;
  return data as { id: string; name: string; guild_id?: string };
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

export async function fetchAuditLog(limit = 200, serverId?: string | null, since?: string | null, until?: string | null): Promise<any[]> {
  let query = supabase
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  
  if (serverId) {
    query = query.eq("server_id", serverId);
  }
  if (since) {
    query = query.gte("created_at", since);
  }
  if (until) {
    query = query.lte("created_at", until);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchServerStats(serverId: string): Promise<{
  member_count: number;
  boss_count: number;
  death_count: number;
  has_webhook: boolean;
}> {
  const { data, error } = await supabase
    .rpc("get_server_stats", { p_server_id: serverId });
  if (error) throw error;
  return (data as any) ?? { member_count: 0, boss_count: 0, death_count: 0, has_webhook: false };
}

export async function fetchDatabaseStats(): Promise<any> {
  const { data, error } = await supabase
    .rpc("get_database_stats");
  if (error) throw error;
  return data ?? {};
}

export async function fetchPlanUsage(): Promise<any> {
  const { data, error } = await supabase
    .rpc("get_plan_usage");
  if (error) throw error;
  return data ?? {};
}

export async function fetchCronStatus(): Promise<{
  active: boolean;
  last_run: string | null;
  servers: { name: string; kills: number }[];
  total_kills: number;
}> {
  const { data, error } = await supabase
    .rpc("get_cron_test_status");
  if (error) throw error;
  return (data as any) ?? { active: false, last_run: null, servers: [], total_kills: 0 };
}

export async function fetchAllServers(): Promise<any[]> {
  const { data, error } = await supabase
    .rpc("get_all_servers_with_counts");
  if (error) throw error;
  return data ?? [];
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

/** Set boss rotation to a specific guild index (0-based) */
export async function setBossRotation(bossId: string, index: number): Promise<number> {
  const { data, error } = await supabase
    .rpc("set_boss_rotation", { p_boss_id: bossId, p_index: index });
  if (error) throw error;
  return data as number;
}

/** Advance boss rotation by 1 on kill (wraps within guild count). Returns new index. */
export async function advanceBossRotation(bossId: string): Promise<number> {
  const { data, error } = await supabase
    .rpc("advance_boss_rotation", { p_boss_id: bossId });
  if (error) throw error;
  return data as number;
}

// ── Death Records ───────────────────────────────────────────

export async function fetchDeathRecords(serverId?: string | null): Promise<DeathRecord[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  // Optimized: only fetch latest death per boss — 39 rows instead of 800+
  const { data, error } = await supabase
    .rpc("get_latest_deaths", { p_server_id: sid });
  if (error) throw error;
  return (data as DeathRecord[]) ?? [];
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

/** Adjust spawn time by upserting a spawn override. Kill records are never touched. */
export async function setBossSpawnTime(bossId: string, spawnDate: Date): Promise<void> {
  const { data: bossData, error: bossErr } = await supabase
    .from("bosses")
    .select("respawn_hours, server_id")
    .eq("id", bossId)
    .single();
  if (bossErr) throw bossErr;
  
  const respawnHours = (bossData as any)?.respawn_hours ?? 0;
  const serverId = (bossData as any)?.server_id ?? getCurrentServerId();
  const newDeathTime = new Date(spawnDate.getTime() - respawnHours * 3600000);

  // Delete any existing override for this boss in this server
  await supabase
    .from("boss_spawn_overrides")
    .delete()
    .eq("boss_id", bossId)
    .eq("server_id", serverId);

  // Insert the new override
  const { error } = await supabase
    .from("boss_spawn_overrides")
    .insert({ boss_id: bossId, server_id: serverId, death_time: newDeathTime.toISOString() });
  if (error) throw error;
}

export async function fetchSpawnOverrides(serverId: string): Promise<{ boss_id: string; death_time: string }[]> {
  const { data, error } = await supabase
    .from("boss_spawn_overrides")
    .select("boss_id, death_time")
    .eq("server_id", serverId);
  if (error) throw error;
  return data ?? [];
}

export async function markAllUnknownAlive(serverId: string): Promise<number> {
  const { data, error } = await supabase
    .rpc("bulk_mark_bosses_alive", { p_server_id: serverId });
  if (error) throw error;
  return data ?? 0;
}

// ── Realtime ────────────────────────────────────────────────

/** Track active channels to prevent duplicate subscriptions */
const activeChannels = new Map<string, ReturnType<typeof supabase.channel>>();

function getOrCreateChannel(chanName: string): { channel: ReturnType<typeof supabase.channel>; isNew: boolean } {
  const existing = activeChannels.get(chanName);
  if (existing) return { channel: existing, isNew: false };
  const channel = supabase.channel(chanName);
  activeChannels.set(chanName, channel);
  return { channel, isNew: true };
}

/** Remove a channel from Supabase AND the local cache */
export function cleanupChannel(channel: ReturnType<typeof supabase.channel>) {
  // Find and delete from activeChannels by value
  for (const [name, ch] of activeChannels) {
    if (ch === channel) {
      activeChannels.delete(name);
      break;
    }
  }
  supabase.removeChannel(channel).catch(() => {});
}

export function subscribeToDeathRecords(
  serverId: string,
  onInsert: (record: DeathRecord) => void,
  onUpdate: (record: DeathRecord) => void,
  onDelete: (record: { id: string }) => void
) {
  const sid = serverId || "unknown";
  const chanName = `deaths-${sid}`;
  const { channel, isNew } = getOrCreateChannel(chanName);
  
  if (isNew) {
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "death_records" },
      (payload) => onInsert(payload.new as DeathRecord));
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "death_records" },
      (payload) => onUpdate(payload.new as DeathRecord));
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table: "death_records" },
      (payload) => onDelete(payload.old as { id: string }));
    channel.subscribe((status) => {
      if (status === "CLOSED" || status === "CHANNEL_ERROR") activeChannels.delete(chanName);
    });
  }
  
  return channel;
}

/** Realtime subscription for boss table changes (rotation_counter, schedule, etc.) */
export function subscribeToBosses(serverId: string, onChange: () => void) {
  const sid = serverId || "unknown";
  const chanName = `bosses-${sid}`;
  const { channel, isNew } = getOrCreateChannel(chanName);
  
  if (isNew) {
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "bosses" }, () => onChange());
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "bosses" }, () => onChange());
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table: "bosses" }, () => onChange());
    channel.subscribe((status) => {
      if (status === "CLOSED" || status === "CHANNEL_ERROR") activeChannels.delete(chanName);
    });
  }
  
  return channel;
}

/** Realtime subscription for server settings changes (viewer permissions, webhook) */
export function subscribeToServerSettings(
  serverId: string,
  onUpdate: (payload: any) => void
) {
  const chanName = `servers-${serverId}`;
  const { channel, isNew } = getOrCreateChannel(chanName);
  
  if (isNew) {
    const callbacks = new Set<(payload: any) => void>();
    (channel as any).__callbacks = callbacks;
    callbacks.add(onUpdate);
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "servers" },
      (payload) => callbacks.forEach(cb => cb(payload)));
    channel.subscribe((status) => {
      if (status === "CLOSED" || status === "CHANNEL_ERROR") activeChannels.delete(chanName);
    });
  } else {
    const callbacks = (channel as any).__callbacks as Set<(payload: any) => void>;
    if (callbacks) callbacks.add(onUpdate);
  }
  
  return channel;
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

export async function upsertMember(name: string, guildId?: string | null): Promise<Member> {
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
      .insert({ name: trimmed, server_id: _currentServerId, guild_id: guildId || null })
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

export async function bulkAddMembers(names: string[]): Promise<number> {
  const rows = names.map((name) => ({
    name: name.trim(),
    server_id: _currentServerId,
  }));

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { data, error } = await supabase
      .from("members")
      .insert(rows)
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  }

  // Viewer fallback — insert one at a time via RPC
  if (_currentViewerKey) {
    let added = 0;
    for (const row of rows) {
      try {
        await supabase.rpc("viewer_upsert_member", {
          p_name: row.name,
          p_server_id: _currentServerId,
          p_viewer_key: _currentViewerKey,
        });
        added++;
      } catch { /* skip duplicates */ }
    }
    return added;
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
  // Use same boss_points-aware logic as fetchLeaderboardByPeriod,
  // just with an epoch start to include all records
  return fetchLeaderboardByPeriod("1970-01-01T00:00:00Z", serverId);
}

export async function fetchLeaderboardByPeriod(
  since: string,
  serverId?: string | null
): Promise<LeaderboardEntry[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];

  const { data, error } = await supabase
    .rpc("get_leaderboard", { p_server_id: sid, p_since: since });

  if (error) throw error;

  return ((data as any[]) ?? []).map((row: any) => ({
    id: row.member_id,
    name: row.member_name,
    points: row.points,
    last_attended: row.last_attended,
  }));
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
  /** Points earned for this boss kill */
  points?: number;
}

/** Get all bosses a specific member participated in killing */
export async function fetchMemberKills(memberId: string, since?: string, serverId?: string | null): Promise<MemberBossKill[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase
    .from("attendance_records")
    .select("death_record_id, death_records!inner(death_time, boss_id, bosses!inner(name, boss_points))")
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
    points: row.death_records.bosses.boss_points ?? 1,
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

export async function fetchAnalytics(since: string, serverId?: string | null, guildId?: string | null): Promise<AnalyticsData> {
  const sid = serverId ?? getCurrentServerId();
  const { data, error } = await supabase
    .rpc("get_analytics", { since, s_id: sid || undefined, guild_id: guildId || undefined });

  if (error) throw error;
  return data as AnalyticsData;
}

// ── History from Supabase ──────────────────────────────────

import type { HistoryEntry } from "./history";

export async function fetchHistoryFromSupabase(serverId?: string | null, since?: string, until?: string): Promise<HistoryEntry[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase
    .from("death_records")
    .select(`
      id, death_time, owner_guild_id, display_owner_guild_id,
      bosses!inner(id, name, spawn_type, respawn_hours, schedule),
      attendance_records(id)
    `)
    .or("is_initial_spawn.is.null,is_initial_spawn.eq.false")
    .order("death_time", { ascending: false });
  if (sid) query = query.eq("server_id", sid);
  if (since) query = query.gte("death_time", since);
  if (until) query = query.lte("death_time", until);
  if (!since && !until) query = query.limit(500);
  const { data: deaths, error } = await query;

  if (error) throw error;

  // Deduplicate: inner join with attendance_records may return duplicate rows
  const seen = new Set<string>();
  const unique = (deaths as any[]).filter((d: any) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  // Fetch guild names for owner_guild_id + display_owner_guild_id references
  const guildIds = [...new Set(
    unique.flatMap((d: any) => [d.owner_guild_id, d.display_owner_guild_id]).filter(Boolean)
  )];
  const guildMap = new Map<string, string>();
  if (guildIds.length > 0) {
    try {
      const { data: guildData } = await supabase
        .from("guilds")
        .select("id, name")
        .in("id", guildIds as string[]);
      if (guildData) {
        for (const g of guildData as any[]) guildMap.set(g.id, g.name);
      }
    } catch { /* ignore — guild names are cosmetic */ }
  }

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
      ownerGuildName: guildMap.get(d.display_owner_guild_id ?? d.owner_guild_id),
    };
  });
}

// ── Leaderboard Snapshots ───────────────────────────────────

export async function saveLeaderboardSnapshot(
  period: "all_time" | "weekly" | "monthly",
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
  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .select("*")
    .eq("id", id)
    .eq("server_id", serverId)
    .single();

  if (error) throw error;
  return data as any;
}

// ── Discord Notifications ──────────────────────────────────

const BOT_NOTIFY_URL = import.meta.env.VITE_BOT_NOTIFY_URL || "http://localhost:3003";

export async function notifyDiscord(
  serverId: string,
  event: "boss_died" | "boss_spawned",
  data: { boss_name: string; attendees?: string[]; spawn_time?: string; guild_name?: string }
): Promise<{ ok: boolean; skipped?: boolean }> {
  try {
    const res = await fetch(`${BOT_NOTIFY_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: serverId,
        event: event === "boss_died" ? "boss_died" : "boss_spawning",
        boss_name: data.boss_name,
        guild_name: data.guild_name,
      }),
    });
    if (!res.ok) {
      console.error(`Discord notify HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      return { ok: false };
    }
    const body = await res.json().catch(() => ({}));
    if (body.skipped) {
      console.warn(`Discord notify skipped: ${body.skipped}`);
      return { ok: false, skipped: true };
    }
    return { ok: true };
  } catch (err) {
    console.error("Discord notification failed:", err);
    return { ok: false };
  }
}

export interface SpawnAnnounceBoss {
  name: string;
  spawn_time: string;
  unix_spawn_time?: number;
  guild_name?: string;
}

export async function announceSpawns(
  serverId: string,
  bosses: SpawnAnnounceBoss[]
): Promise<{ success: boolean; skipped: number; failed: number }> {
  let skipped = 0;
  let failed = 0;
  for (const boss of bosses) {
    try {
      const res = await fetch(`${BOT_NOTIFY_URL}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server_id: serverId,
          event: "boss_spawning",
          boss_name: boss.name,
          guild_name: boss.guild_name,
        }),
      });
      if (!res.ok) { failed++; continue; }
      const body = await res.json().catch(() => ({}));
      if (body.skipped) { skipped++; }
    } catch {
      failed++;
    }
  }
  return { success: failed === 0, skipped, failed };
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
