import { supabase, getCurrentServerId } from "./client";
import { writeAuditEntry, AuditAction } from "./audit";
import type { Boss, Activity } from "@/types";
import { supabaseUrl, supabaseKey } from "./client";
import type { BossGuild } from "@/types";
import { advanceActivityRotation } from "./activityGuilds";

// ── Bosses ──────────────────────────────────────────────────

export async function fetchBosses(serverId?: string | null): Promise<Boss[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase.from("bosses").select("*").order("name").eq("server_id", sid).eq("is_enabled", true).is("deleted_at", null);
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
  const { error } = await supabase.rpc("set_boss_salary", { p_boss_id: bossId, p_has_salary: hasSalary });
  if (error) throw error;
}

export async function setBossRotation(bossId: string, index: number): Promise<number> {
  const { data, error } = await supabase
    .rpc("set_boss_rotation", { p_boss_id: bossId, p_index: index });
  if (error) throw error;
  return data as number;
}

export async function advanceBossRotation(bossId: string, serverId?: string | null, bossName?: string | null): Promise<number> {
  const { data, error } = await supabase
    .rpc("advance_boss_rotation", { p_boss_id: bossId });
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.BOSS_ROTATION_ADVANCE, server_id: serverId, target_id: bossId, details: { boss_name: bossName || bossId } });
  return data as number;
}

export async function adjustBossRotation(bossId: string, direction: number, bossName?: string): Promise<number> {
  const { data, error } = await supabase.rpc("adjust_boss_rotation", {
    p_boss_id: bossId,
    p_direction: direction,
  });
  if (error) throw new Error(error.message);
  const sid = getCurrentServerId();
  if (sid) writeAuditEntry({ action: AuditAction.BOSS_TIME_EDIT, server_id: sid, target_id: bossId, details: { boss_name: bossName || bossId, direction } });
  return data as number;
}

// ── Custom Boss & Activity CRUD ─────────────────────────────

export async function fetchAllBossesForServer(serverId: string): Promise<Boss[]> {
  const { data, error } = await supabase
    .from("bosses")
    .select("*")
    .eq("server_id", serverId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return (data || []) as Boss[];
}

export async function fetchAllActivitiesForServer(serverId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("server_id", serverId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return (data || []) as Activity[];
}

export async function createCustomBoss(
  serverId: string,
  data: {
    name: string; spawn_type: string; respawn_hours?: number | null;
    schedule?: any; is_recurring?: boolean; boss_points?: number;
    category?: string | null; tags?: string[];
    image_url?: string | null;
  }
): Promise<Boss> {
  const { data: id, error } = await supabase.rpc("create_custom_boss", {
    p_server_id: serverId, p_name: data.name, p_spawn_type: data.spawn_type,
    p_respawn_hours: data.respawn_hours ?? null, p_schedule: data.schedule ?? null,
    p_is_recurring: data.is_recurring ?? true,
    p_boss_points: data.boss_points ?? 1,
    p_category: data.category ?? null, p_tags: data.tags ?? [],
    p_image_url: data.image_url ?? null,
  });
  if (error) throw error;
  writeAuditEntry({ action: AuditAction.BOSS_CREATE, server_id: serverId, target_id: id as string, details: { boss_name: data.name } });
  return { id: id as string } as Boss;
}

export async function createCustomActivity(
  serverId: string,
  data: {
    name: string; schedule_type: string; schedule?: any;
    points_per_participant?: number; duration_minutes?: number | null;
    party_size?: number | null; category?: string | null; tags?: string[];
    image_url?: string | null;
  }
): Promise<Activity> {
  const { data: id, error } = await supabase.rpc("create_custom_activity", {
    p_server_id: serverId, p_name: data.name, p_schedule_type: data.schedule_type,
    p_schedule: data.schedule ?? null,
    p_points_per_participant: data.points_per_participant ?? 1,
    p_duration_minutes: data.duration_minutes ?? null,
    p_party_size: data.party_size ?? null,
    p_category: data.category ?? null, p_tags: data.tags ?? [],
    p_image_url: data.image_url ?? null,
  });
  if (error) throw error;
  writeAuditEntry({ action: AuditAction.ACTIVITY_CREATE, server_id: serverId, target_id: id as string, details: { activity_name: data.name } });
  return { id: id as string } as Activity;
}

export async function updateCustomBoss(id: string, updates: Record<string, any>, serverId?: string): Promise<void> {
  const { error } = await supabase.rpc("update_custom_boss", {
    p_boss_id: id,
    p_name: updates.name ?? null,
    p_spawn_type: updates.spawn_type ?? null,
    p_respawn_hours: updates.respawn_hours ?? null,
    p_schedule: updates.schedule ?? null,
    p_is_recurring: updates.is_recurring ?? true,
    p_boss_points: updates.boss_points ?? 1,
    p_category: updates.category ?? null,
    p_tags: updates.tags ?? [],
    p_image_url: updates.image_url ?? null,
  });
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.BOSS_UPDATE, server_id: serverId, target_id: id, details: { boss_name: updates.name || id, changed: Object.keys(updates).filter(k => k !== "name").join(", ") } });
}

export async function updateCustomActivity(id: string, updates: Record<string, any>, serverId?: string): Promise<void> {
  const { error } = await supabase.rpc("update_custom_activity", {
    p_activity_id: id,
    p_name: updates.name ?? null,
    p_schedule_type: updates.schedule_type ?? null,
    p_schedule: updates.schedule ?? null,
    p_duration_minutes: updates.duration_minutes ?? null,
    p_points_per_participant: updates.points_per_participant ?? 1,
    p_party_size: updates.party_size ?? null,
    p_category: updates.category ?? null,
    p_tags: updates.tags ?? [],
    p_image_url: updates.image_url ?? null,
  });
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.ACTIVITY_UPDATE, server_id: serverId, target_id: id, details: { activity_name: updates.name || id, changed: Object.keys(updates).filter(k => k !== "name").join(", ") } });
}

export async function toggleBossEnabled(id: string, enabled: boolean, serverId?: string, bossName?: string): Promise<void> {
  const { error } = await supabase.rpc("toggle_boss_enabled", { p_boss_id: id, p_enabled: enabled });
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.BOSS_TOGGLE, server_id: serverId, target_id: id, details: { boss_name: bossName || id, enabled } });
}

export async function toggleActivityEnabled(id: string, enabled: boolean, serverId?: string, activityName?: string): Promise<void> {
  const { error } = await supabase.rpc("toggle_activity_enabled", { p_activity_id: id, p_enabled: enabled });
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.ACTIVITY_TOGGLE, server_id: serverId, target_id: id, details: { activity_name: activityName || id, enabled } });
}

export async function finishActivity(activityId: string, serverId?: string, activityName?: string): Promise<void> {
  const { data: activity } = await supabase.from("activities").select("schedule_type").eq("id", activityId).single();
  if (!activity) throw new Error("Activity not found");

  if (activity.schedule_type === "one_time") {
    const { error } = await supabase.from("activities").update({ is_enabled: false }).eq("id", activityId);
    if (error) throw error;
    if (serverId) writeAuditEntry({ action: AuditAction.ACTIVITY_TOGGLE, server_id: serverId, target_id: activityId, details: { activity_name: activityName || activityId, enabled: false, reason: "one_time_completed" } });
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("activity_instances").insert({
    activity_id: activityId,
    start_time: now,
    end_time: now,
  });
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.ACTIVITY_FINALIZE, server_id: serverId, target_id: activityId, details: { activity_name: activityName || activityId } });

  // Advance guild rotation
  try { await advanceActivityRotation(activityId, serverId); } catch (err) { console.error("[bosses] advanceActivityRotation on start failed:", err); }
}

/** Record an activity end with a custom time and attendance. */
export async function recordActivityEnd(
  activityId: string,
  endTime: Date,
  attendeeIds: string[],
  serverId?: string | null
): Promise<string> {
  const { data: activity } = await supabase.from("activities").select("name, schedule_type").eq("id", activityId).single();
  if (!activity) throw new Error("Activity not found");

  if (activity.schedule_type === "one_time") {
    const { error } = await supabase.from("activities").update({ is_enabled: false }).eq("id", activityId);
    if (error) throw error;
  }

  const endTimeStr = endTime.toISOString();
  // Create the activity instance with start_time = end_time (since we don't track actual start)
  const { data: instance, error: insertErr } = await supabase
    .from("activity_instances")
    .insert({
      activity_id: activityId,
      start_time: endTimeStr,
      end_time: endTimeStr,
    })
    .select()
    .single();
  if (insertErr || !instance) throw insertErr ?? new Error("Failed to create activity instance");

  // Record attendance via RPC (bypasses RLS)
  for (const memberId of attendeeIds) {
    try {
      await supabase.rpc("mark_activity_attendance", {
        p_activity_instance_id: instance.id,
        p_member_id: memberId,
        p_present: true,
      });
    } catch (err) {
      console.error("Failed to add activity attendance for member:", memberId, err);
    }
  }

  // Advance guild rotation
  try { await advanceActivityRotation(activityId, serverId); } catch (err) { console.error("[bosses] advanceActivityRotation on end failed:", err); }

  if (serverId) writeAuditEntry({ action: AuditAction.ACTIVITY_END_RECORD, server_id: serverId, target_id: activityId, details: { activity_name: activity?.name || activityId, end_time: endTime.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), attendees: attendeeIds.length } });

  return instance.id;
}

// ── Spawn Overrides ─────────────────────────────────────────

export async function setBossSpawnTime(bossId: string, spawnDate: Date): Promise<void> {
  const { data: bossData, error: bossErr } = await supabase
    .from("bosses")
    .select("name, respawn_hours, server_id")
    .eq("id", bossId)
    .single();
  if (bossErr) throw bossErr;

  const bossName = (bossData as any)?.name || bossId;
  const respawnHours = (bossData as any)?.respawn_hours ?? 0;
  const serverId = (bossData as any)?.server_id ?? getCurrentServerId();
  const newDeathTime = new Date(spawnDate.getTime() - respawnHours * 3600000);

  await supabase
    .from("boss_spawn_overrides")
    .delete()
    .eq("boss_id", bossId)
    .eq("server_id", serverId);

  const { error } = await supabase
    .from("boss_spawn_overrides")
    .insert({ boss_id: bossId, server_id: serverId, death_time: newDeathTime.toISOString() });
  if (error) throw error;
  const dt = spawnDate.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (serverId) writeAuditEntry({ action: AuditAction.BOSS_SPAWN_SET, server_id: serverId, target_id: bossId, details: { boss_name: bossName, spawn_date: dt } });
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

// ── Boss-Guild Assignments ─────────────────────────────────

export async function fetchBossGuilds(serverId?: string | null): Promise<BossGuild[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];

  const response = await fetch(`${supabaseUrl}/functions/v1/get-boss-guilds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`,
      "apikey": supabaseKey,
    },
    body: JSON.stringify({ server_id: sid }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `Failed to fetch boss guilds (${response.status})`);
  }

  const data = await response.json();
  return (data || []) as BossGuild[];
}

export async function fetchAllBossGuildsForServer(serverId?: string | null): Promise<BossGuild[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data: bossRows } = await supabase
    .from("bosses")
    .select("id")
    .eq("server_id", sid);
  const bossIds = (bossRows || []).map(b => b.id);
  if (!bossIds.length) return [];
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
  mode: "rotation" | "schedule" | "daily" = "rotation",
  serverId?: string | null,
  bossName?: string | null
): Promise<void> {
  const { data: existing } = await supabase
    .from("boss_guilds")
    .select("guild_id, points, has_salary, sort_order, mode, day_of_week")
    .eq("boss_id", bossId);
  const preserved = new Map((existing || []).map((r: any) => [r.guild_id, { points: r.points, has_salary: r.has_salary }]));
  const pointsOnlyRows = (existing || []).filter((r: any) => r.sort_order === -1 && !assignments.some(a => a.guild_id === r.guild_id));

  const { error: delErr } = await supabase
    .from("boss_guilds")
    .delete()
    .eq("boss_id", bossId);
  if (delErr) throw delErr;

  if (assignments.length > 0) {
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

  for (const row of pointsOnlyRows) {
    const { error } = await supabase.from("boss_guilds").insert({
      boss_id: bossId,
      guild_id: row.guild_id,
      sort_order: -1,
      day_of_week: null,
      mode: "rotation",
      points: row.points,
      has_salary: row.has_salary,
    });
    if (error) console.warn("Failed to re-insert points-only row:", error);
  }
  if (serverId) writeAuditEntry({ action: AuditAction.BOSS_GUILDS_SET, server_id: serverId, target_id: bossId, details: { boss_name: bossName || bossId, mode, guild_count: assignments.length } });
}

export async function upsertBossGuildPoints(
  bossId: string,
  guildId: string,
  points?: number | null,
  hasSalary?: boolean
): Promise<void> {
  // Try RPC first (bypasses RLS entirely)
  try {
    const { error } = await supabase.rpc("upsert_boss_guild_points", {
      p_boss_id: bossId,
      p_guild_id: guildId,
      p_points: points ?? null,
      p_has_salary: hasSalary ?? null,
    });
    if (!error) return; // RPC succeeded
    // If RPC failed with anything other than "function not found", throw it
    if (error.code !== "42883" && !error.message?.includes("Could not find the function")) {
      throw error;
    }
  } catch (err: any) {
    // If RPC doesn't exist, fall through to direct operations
    if (err?.code === "42883" || err?.message?.includes("Could not find")) {
      // fall through
    } else {
      throw err;
    }
  }

  // Fallback: direct table operations
  await upsertBossGuildPointsDirect(bossId, guildId, points, hasSalary);
}

/** Direct INSERT/UPDATE on boss_guilds (goes through RLS) — used when RPC not deployed */
async function upsertBossGuildPointsDirect(
  bossId: string,
  guildId: string,
  points?: number | null,
  hasSalary?: boolean
): Promise<void> {
  const update: Record<string, any> = {};
  if (points !== undefined) update.points = points;
  if (hasSalary !== undefined) update.has_salary = hasSalary;
  if (Object.keys(update).length === 0) return;

  const { data: existing } = await supabase
    .from("boss_guilds")
    .select("id")
    .eq("boss_id", bossId)
    .eq("guild_id", guildId);

  if (existing && existing.length > 0) {
    // Update all matching rows
    const { error } = await supabase
      .from("boss_guilds")
      .update(update)
      .eq("boss_id", bossId)
      .eq("guild_id", guildId);
    if (error) throw error;

    // Verify the update actually took effect (RLS can silently skip rows)
    const { data: verify } = await supabase
      .from("boss_guilds")
      .select("has_salary, points")
      .eq("boss_id", bossId)
      .eq("guild_id", guildId);
    if (hasSalary !== undefined && verify?.length) {
      const allMatch = verify.every((r: any) => r.has_salary === hasSalary);
      if (!allMatch) throw new Error("Salary update was blocked by access policy. Ask your server owner to deploy the RPC migration.");
    }
  } else {
    const row: Record<string, any> = {
      boss_id: bossId,
      guild_id: guildId,
      sort_order: -1,
      day_of_week: null,
      mode: "rotation",
      ...update,
    };
    const { error: insertErr } = await supabase.from("boss_guilds").insert(row);
    if (!insertErr) return;

    if (insertErr.code === "23505" || insertErr.message?.includes("duplicate")) {
      const { error: updateErr } = await supabase
        .from("boss_guilds")
        .update(update)
        .eq("boss_id", bossId)
        .eq("guild_id", guildId);
      if (updateErr) throw updateErr;
    } else {
      throw insertErr;
    }
  }
}

export async function batchSetGuildSalary(
  guildId: string,
  bossIds: string[],
  hasSalary: boolean
): Promise<void> {
  if (!bossIds.length) return;
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
