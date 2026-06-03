import { createClient } from "@supabase/supabase-js";
import type { Boss, DeathRecord, Member, AttendanceRecord, LeaderboardEntry, PointRule, BossAssist } from "@/types";

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
  const { error } = await supabase
    .from("servers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", serverId);
  if (error) throw error;
}

export async function restoreServer(serverId: string): Promise<void> {
  const { error } = await supabase
    .from("servers")
    .update({ deleted_at: null })
    .eq("id", serverId);
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
  total_raid_members?: number;
  guild_members?: { guild: string; count: number }[];
}> {
  const { data, error } = await supabase
    .rpc("get_server_stats", { p_server_id: serverId });
  if (error) throw error;
  const stats = (data as any) ?? { member_count: 0, boss_count: 0, death_count: 0, has_webhook: false };
  
  // Also check linked Discord configs for Bot Alerts status
  if (!stats.has_webhook) {
    const { count } = await supabase
      .from("discord_configs")
      .select("*", { count: "exact", head: true })
      .eq("raidscout_server_id", serverId);
    stats.has_webhook = (count ?? 0) > 0;
  }
  
  return stats;
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

// ── Moderator Permissions ────────────────────────────────────

export type ModeratorPermissions = {
  can_access_settings: boolean;
  can_manage_guilds: boolean;
  can_manage_viewer_key: boolean;
  can_change_timezone: boolean;
  can_manage_boss_guilds: boolean;
  can_manage_moderators: boolean;
  can_access_integrations: boolean;
  can_edit_participants: boolean;
  can_export_attendance: boolean;
  can_manage_raid_members: boolean;
  can_adjust_points: boolean;
  can_record_death: boolean;
  can_edit_death_records: boolean;
  can_set_spawn: boolean;
  can_rotate_guilds: boolean;
  can_announce_discord: boolean;
};

export const DEFAULT_MODERATOR_PERMISSIONS: ModeratorPermissions = {
  can_access_settings: false,
  can_manage_guilds: false,
  can_manage_viewer_key: false,
  can_change_timezone: false,
  can_manage_boss_guilds: false,
  can_manage_moderators: false,
  can_access_integrations: false,
  can_edit_participants: false,
  can_export_attendance: false,
  can_manage_raid_members: false,
  can_adjust_points: false,
  can_record_death: false,
  can_edit_death_records: false,
  can_set_spawn: false,
  can_rotate_guilds: false,
  can_announce_discord: false,
};

export async function fetchModeratorPermissions(serverId: string): Promise<Record<string, ModeratorPermissions>> {
  const { data, error } = await supabase
    .from("moderator_permissions")
    .select("*")
    .eq("server_id", serverId);
  if (error) throw error;
  const result: Record<string, ModeratorPermissions> = {};
  for (const row of (data as any[]) ?? []) {
    result[row.user_id] = {
      can_access_settings: row.can_access_settings,
      can_manage_guilds: row.can_manage_guilds,
      can_manage_viewer_key: row.can_manage_viewer_key,
      can_change_timezone: row.can_change_timezone,
      can_manage_boss_guilds: row.can_manage_boss_guilds,
      can_manage_moderators: row.can_manage_moderators,
      can_access_integrations: row.can_access_integrations,
      can_edit_participants: row.can_edit_participants,
      can_export_attendance: row.can_export_attendance,
      can_manage_raid_members: row.can_manage_raid_members,
      can_adjust_points: row.can_adjust_points,
      can_record_death: row.can_record_death,
      can_edit_death_records: row.can_edit_death_records,
      can_set_spawn: row.can_set_spawn,
      can_rotate_guilds: row.can_rotate_guilds,
      can_announce_discord: row.can_announce_discord,
    };
  }
  return result;
}

export async function updateModeratorPermissions(
  serverId: string,
  userId: string,
  permissions: Partial<ModeratorPermissions>
): Promise<void> {
  const { error } = await supabase
    .from("moderator_permissions")
    .upsert({ server_id: serverId, user_id: userId, ...permissions }, { onConflict: "server_id,user_id" });
  if (error) throw error;
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

export async function setBossSalary(bossId: string, hasSalary: boolean): Promise<void> {
  const { error } = await supabase
    .from("bosses")
    .update({ has_salary: hasSalary })
    .eq("id", bossId);
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
  ownerGuildId?: string | null,
  partyLeaders?: Record<string, string> | null,
  rallyImageUrl?: string | null
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
        party_leaders: partyLeaders ?? {},
        rally_image_url: rallyImageUrl ?? null,
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

export async function bulkAddMembers(names: string[], guildId?: string | null): Promise<number> {
  const rows = names.map((name) => ({
    name: name.trim(),
    server_id: _currentServerId,
    guild_id: guildId || null,
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
          p_guild_id: row.guild_id,
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

/** Fetch all boss_guilds rows for a server (for the Boss Points matrix).
 *  Unlike fetchBossGuilds, returns rows even if they only have points/salary
 *  and no rotation assignment (no sort_order/day_of_week/mode). */
export async function fetchAllBossGuildsForServer(serverId?: string | null): Promise<BossGuild[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  // Get all boss IDs for this server first
  const { data: bossRows } = await supabase
    .from("bosses")
    .select("id")
    .eq("server_id", sid);
  const bossIds = (bossRows || []).map(b => b.id);
  if (!bossIds.length) return [];
  // Fetch all boss_guilds for these bosses
  const { data, error } = await supabase
    .from("boss_guilds")
    .select("*")
    .in("boss_id", bossIds);
  if (error) throw error;
  return data as BossGuild[];
}

export async function setBossGuilds(
  bossId: string,
  assignments: { guild_id: string; sort_order?: number; day_of_week?: number }[],
  mode: "rotation" | "schedule" | "daily" = "rotation"
): Promise<void> {
  // Preserve existing points/salary for this boss before deleting
  const { data: existing } = await supabase
    .from("boss_guilds")
    .select("guild_id, points, has_salary")
    .eq("boss_id", bossId);
  const preserved = new Map((existing || []).map((r: any) => [r.guild_id, { points: r.points, has_salary: r.has_salary }]));

  // Delete existing assignments for this boss, then insert new ones
  const { error: delErr } = await supabase
    .from("boss_guilds")
    .delete()
    .eq("boss_id", bossId);
  if (delErr) throw delErr;

  if (assignments.length === 0) return;

  const rows = assignments.map((a) => {
    const prev = preserved.get(a.guild_id);
    return {
      boss_id: bossId,
      guild_id: a.guild_id,
      sort_order: a.sort_order ?? null,
      day_of_week: a.day_of_week ?? null,
      mode,
      points: prev?.points ?? null,
      has_salary: prev?.has_salary ?? false,
    };
  });

  const { error } = await supabase.from("boss_guilds").insert(rows);
  if (error) throw error;
}

/** Upsert per-guild points and/or salary for a boss-guild pair.
 *  Creates the row if it doesn't exist (without rotation fields),
 *  or updates only the points/salary columns on an existing row. */
export async function upsertBossGuildPoints(
  bossId: string,
  guildId: string,
  points?: number | null,
  hasSalary?: boolean
): Promise<void> {
  // Check if a row already exists for this boss-guild pair
  const { data: existing } = await supabase
    .from("boss_guilds")
    .select("id")
    .eq("boss_id", bossId)
    .eq("guild_id", guildId)
    .limit(1);

  if (existing && existing.length > 0) {
    // Update only points/salary fields
    const update: Record<string, any> = {};
    if (points !== undefined) update.points = points;
    if (hasSalary !== undefined) update.has_salary = hasSalary;
    if (Object.keys(update).length === 0) return;
    const { error } = await supabase
      .from("boss_guilds")
      .update(update)
      .eq("id", existing[0].id);
    if (error) throw error;
  } else {
    // Insert new row — points/salary only. Use sort_order: -1 as sentinel
    // (check constraint requires sort_order when mode=rotation)
    const row: Record<string, any> = {
      boss_id: bossId,
      guild_id: guildId,
      sort_order: -1,
      day_of_week: null,
      mode: "rotation",
    };
    if (points !== undefined) row.points = points;
    if (hasSalary !== undefined) row.has_salary = hasSalary;
    const { error } = await supabase.from("boss_guilds").insert(row);
    if (error) throw error;
  }
}

/** Batch-set salary for a guild across multiple bosses in a single RPC call. */
export async function batchSetGuildSalary(
  guildId: string,
  bossIds: string[],
  hasSalary: boolean
): Promise<void> {
  if (!bossIds.length) return;
  // Fallback: do individual upserts in parallel batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < bossIds.length; i += BATCH_SIZE) {
    const chunk = bossIds.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(bossId =>
      upsertBossGuildPoints(bossId, guildId, undefined, hasSalary)
    ));
  }
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
  since: string | null,
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
    points: row.total_points,
    last_attended: row.last_attended,
  }));
}

/** Reset all points for a guild: deletes attendance records and point adjustments
 *  for all members of the guild. Leaderboard snapshots (Finalize History) are NOT affected. */
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

/** Get all bosses a specific member participated in killing, with proper per-guild point calculation */
export async function fetchMemberKills(
  memberId: string,
  since?: string,
  serverId?: string | null,
  serverTimezone?: string,
): Promise<MemberBossKill[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];

  // 1. Fetch attendance records with boss & death info
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
  if (!data?.length) return [];

  // 2. Get member's guild
  const { data: memberData } = await supabase
    .from("members")
    .select("guild_id")
    .eq("id", memberId)
    .maybeSingle();
  const guildId = (memberData as any)?.guild_id as string | null;

  // 3. Get unique boss IDs for per-guild override lookup
  const bossIds = [...new Set((data as any[]).map((r: any) => r.death_records.boss_id))];

  // 4. Fetch per-guild point overrides
  let bgPointsMap = new Map<string, number>();
  if (guildId && bossIds.length > 0) {
    const { data: bgData } = await supabase
      .from("boss_guilds")
      .select("boss_id, points")
      .eq("guild_id", guildId)
      .in("boss_id", bossIds);
    for (const bg of (bgData || [])) {
      if ((bg as any).points != null) {
        bgPointsMap.set((bg as any).boss_id, (bg as any).points);
      }
    }
  }

  // 5. Fetch time-based multipliers
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

  // Helper: get multiplier for a death time
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

  // 6. Map with correct point calculation
  return (data as any[]).map((row: any) => {
    const bossId = row.death_records.boss_id;
    const bossPoints = row.death_records.bosses.boss_points ?? 0;
    // Per-guild override takes priority
    const basePts = guildId && bgPointsMap.has(bossId)
      ? bgPointsMap.get(bossId)!
      : bossPoints;
    const mult = guildId ? getMultiplier(row.death_records.death_time) : 1;
    return {
      boss_name: row.death_records.bosses.name,
      killed_at: row.death_records.death_time,
      death_record_id: row.death_record_id,
      points: basePts * mult,
    };
  });
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
  if (!sid) return { total_kills: 0, total_attendance: 0, active_members: 0, kills_by_week: [], top_bosses: [], top_hunters: [], kills_by_day: [] };

  // Get death records since date
  const { data: deaths, error: dErr } = await supabase
    .from("death_records")
    .select("id, death_time, boss_id")
    .eq("server_id", sid)
    .gte("death_time", since)
    .order("death_time", { ascending: false });
  if (dErr) throw dErr;
  if (!deaths?.length) return { total_kills: 0, total_attendance: 0, active_members: 0, kills_by_week: [], top_bosses: [], top_hunters: [], kills_by_day: [] };

  const deathIds = deaths.map(d => d.id);

  // Get attendance for these deaths
  const { data: att, error: aErr } = await supabase
    .from("attendance_records")
    .select("death_record_id, member_id")
    .in("death_record_id", deathIds);
  if (aErr) throw aErr;

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

  // Compute stats
  const totalKills = deaths.length;
  const totalAttendance = (att || []).length;
  const activeMembers = new Set((att || []).map(a => a.member_id)).size;

  // Kills by week (group by Monday of each week)
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
  for (const d of deaths) dayCounts.set(d.death_time ? new Date(d.death_time).getDay() : -1, (dayCounts.get(d.death_time ? new Date(d.death_time).getDay() : -1) || 0) + 1);
  const killsByDay = dayNames.map(day => ({ day, count: dayCounts.get(dayNames.indexOf(day)) || 0 }));

  return { total_kills: totalKills, total_attendance: totalAttendance, active_members: activeMembers, kills_by_week: killsByWeek, top_bosses: topBosses, top_hunters: topHunters, kills_by_day: killsByDay };
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
  event: "boss_died" | "boss_spawned" | "boss_spawning",
  data: { boss_name: string; attendees?: string[]; spawn_time?: string; guild_name?: string; recorded_by?: string },
  target?: "commands"
): Promise<{ ok: boolean; skipped?: boolean }> {
  // Skip bot notifications on localhost — the bot server handles its own notifications
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return { ok: true };
  }
  try {
    const res = await fetch(`${BOT_NOTIFY_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: serverId,
        event,
        boss_name: data.boss_name,
        guild_name: data.guild_name,
        recorded_by: data.recorded_by,
        ...(target ? { target } : {}),
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

// ── Thread Config ──────────────────────────────────────────

export async function updateThreadConfig(
  configId: string,
  threadChannelId: string | null,
  threadGuilds: string[]
): Promise<void> {
  await supabase
    .from("discord_configs")
    .update({
      thread_channel_id: threadChannelId || null,
      thread_guilds: threadGuilds,
    })
    .eq("id", configId);
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
  // Skip on localhost
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return { success: true, skipped: bosses.length, failed: 0 };
  }
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

// ── Point Rules ─────────────────────────────────────────────

/** Fetch all point rules for a server. */
export async function fetchPointRules(serverId?: string | null): Promise<PointRule[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase
    .from("point_rules")
    .select("*")
    .eq("server_id", sid)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as PointRule[];
}

/** Create a new point rule. */
export async function createPointRule(
  serverId: string,
  guildId: string,
  ruleType: "time_multiplier",
  config: Record<string, unknown>,
): Promise<PointRule> {
  const { data, error } = await supabase
    .from("point_rules")
    .insert({ server_id: serverId, guild_id: guildId, rule_type: ruleType, config })
    .select()
    .single();
  if (error) throw error;
  return data as PointRule;
}

/** Update a point rule's config or enabled state. */
export async function updatePointRule(
  ruleId: string,
  updates: { config?: Record<string, unknown>; enabled?: boolean },
): Promise<void> {
  const { error } = await supabase
    .from("point_rules")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", ruleId);
  if (error) throw error;
}

/** Delete a point rule. */
export async function deletePointRule(ruleId: string): Promise<void> {
  const { error } = await supabase
    .from("point_rules")
    .delete()
    .eq("id", ruleId);
  if (error) throw error;
}

/** Get the effective point multiplier for a guild at a specific kill time. */
export async function getPointMultiplier(
  guildId: string,
  killTime: string,
  serverId?: string | null,
): Promise<number> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return 1;
  const { data, error } = await supabase
    .rpc("get_point_multiplier", {
      p_guild_id: guildId,
      p_kill_time: killTime,
      p_server_id: sid,
    });
  if (error) throw error;
  return (data as number) ?? 1;
}

// ── Boss Assists ────────────────────────────────────────────

/** Fetch all boss assists for a server. */
export async function fetchBossAssists(serverId?: string | null): Promise<BossAssist[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase
    .from("boss_assists")
    .select("*")
    .eq("server_id", sid);
  if (error) throw error;
  return (data || []) as BossAssist[];
}

/** Toggle an assist: add if not exists, remove if exists. Returns true if added. */
export async function toggleBossAssist(
  bossId: string,
  ownerGuildId: string,
  assistantGuildId: string,
  serverId: string,
): Promise<boolean> {
  // Check if already exists
  const { data: existing } = await supabase
    .from("boss_assists")
    .select("id")
    .eq("boss_id", bossId)
    .eq("owner_guild_id", ownerGuildId)
    .eq("assistant_guild_id", assistantGuildId)
    .maybeSingle();

  if (existing) {
    // Remove
    const { error } = await supabase
      .from("boss_assists")
      .delete()
      .eq("id", existing.id);
    if (error) throw error;
    return false;
  }

  // Add
  const { error } = await supabase
    .from("boss_assists")
    .insert({ boss_id: bossId, owner_guild_id: ownerGuildId, assistant_guild_id: assistantGuildId, server_id: serverId });
  if (error) throw error;
  return true;
}

// ------------------------------------------------------------
// Rally Image Storage
// ------------------------------------------------------------

/** Upload a rally screenshot to Supabase Storage. Returns public URL or null. */
export async function uploadRallyImage(file: File): Promise<string | null> {
  try {
    const serverId = getCurrentServerId();
    if (!serverId) return null;
    const ext = file.name.split(".").pop() || "png";
    const fileName = `${serverId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    // Upload via REST API directly for reliability
    const formData = new FormData();
    formData.append("file", file);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? supabaseKey;

    const res = await fetch(
      `${supabaseUrl}/storage/v1/object/rally-images/${fileName}`,
      {
        method: "POST",
        headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
        body: formData,
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Rally image upload failed:", res.status, err);
      return null;
    }

    const { data: urlData } = supabase.storage.from("rally-images").getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch (err) {
    console.error("Rally image upload error:", err);
    return null;
  }
}

/** Add a rally image URL to a death record (stores as JSON array). */
export async function addRallyImageToDeath(deathRecordId: string, newUrl: string): Promise<void> {
  const { data } = await supabase
    .from("death_records")
    .select("rally_image_url")
    .eq("id", deathRecordId)
    .single();
  const existing: string[] = parseRallyImageArray((data as any)?.rally_image_url);
  existing.push(newUrl);
  const { error } = await supabase
    .from("death_records")
    .update({ rally_image_url: JSON.stringify(existing) })
    .eq("id", deathRecordId);
  if (error) console.error("Failed to add rally image:", error);
}

/** Remove a rally image URL from a death record. */
export async function removeRallyImageFromDeath(deathRecordId: string, urlToRemove: string): Promise<void> {
  const { data } = await supabase
    .from("death_records")
    .select("rally_image_url")
    .eq("id", deathRecordId)
    .single();
  const existing: string[] = parseRallyImageArray((data as any)?.rally_image_url);
  const filtered = existing.filter(u => u !== urlToRemove);
  const { error } = await supabase
    .from("death_records")
    .update({ rally_image_url: filtered.length > 0 ? JSON.stringify(filtered) : null })
    .eq("id", deathRecordId);
  if (error) console.error("Failed to remove rally image:", error);

  // Also delete from storage
  try {
    const urlObj = new URL(urlToRemove);
    const path = urlObj.pathname.split("/rally-images/")[1];
    if (path) await supabase.storage.from("rally-images").remove([decodeURIComponent(path)]);
  } catch {}
}

/** Fetch rally image URLs for a death record. Returns array of URLs. */
export async function fetchDeathRallyImages(deathRecordId: string): Promise<string[]> {
  const { data } = await supabase
    .from("death_records")
    .select("rally_image_url")
    .eq("id", deathRecordId)
    .single();
  return parseRallyImageArray((data as any)?.rally_image_url);
}

function parseRallyImageArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}
