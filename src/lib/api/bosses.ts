import { supabase, getCurrentServerId } from "./client";
import type { Boss, Activity } from "@/types";
import { supabaseUrl, supabaseKey } from "./client";
import type { BossGuild } from "@/types";

// ── Bosses ──────────────────────────────────────────────────

export async function fetchBosses(serverId?: string | null): Promise<Boss[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase.from("bosses").select("*").order("name").eq("server_id", sid).eq("is_enabled", true);
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

export async function setBossRotation(bossId: string, index: number): Promise<number> {
  const { data, error } = await supabase
    .rpc("set_boss_rotation", { p_boss_id: bossId, p_index: index });
  if (error) throw error;
  return data as number;
}

export async function advanceBossRotation(bossId: string): Promise<number> {
  const { data, error } = await supabase
    .rpc("advance_boss_rotation", { p_boss_id: bossId });
  if (error) throw error;
  return data as number;
}

export async function adjustBossRotation(bossId: string, direction: number): Promise<number> {
  const { data, error } = await supabase.rpc("adjust_boss_rotation", {
    p_boss_id: bossId,
    p_direction: direction,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

// ── Custom Boss & Activity CRUD ─────────────────────────────

export async function fetchAllBossesForServer(serverId: string): Promise<Boss[]> {
  const { data, error } = await supabase
    .from("bosses")
    .select("*")
    .eq("server_id", serverId)
    .order("name");
  if (error) throw error;
  return (data || []) as Boss[];
}

export async function fetchAllActivitiesForServer(serverId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("server_id", serverId)
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
  return { id: id as string } as Boss;
}

export async function createCustomActivity(
  serverId: string,
  data: {
    name: string; schedule_type: string; schedule?: any;
    points_per_participant?: number;
    party_size?: number | null; category?: string | null; tags?: string[];
    image_url?: string | null;
  }
): Promise<Activity> {
  const { data: id, error } = await supabase.rpc("create_custom_activity", {
    p_server_id: serverId, p_name: data.name, p_schedule_type: data.schedule_type,
    p_schedule: data.schedule ?? null,
    p_points_per_participant: data.points_per_participant ?? 1,
    p_party_size: data.party_size ?? null,
    p_category: data.category ?? null, p_tags: data.tags ?? [],
    p_image_url: data.image_url ?? null,
  });
  if (error) throw error;
  return { id: id as string } as Activity;
}

export async function updateCustomBoss(id: string, updates: Record<string, any>): Promise<void> {
  if (updates.boss_points !== undefined) updates.points = updates.boss_points;
  const { error } = await supabase.from("bosses").update(updates).eq("id", id);
  if (error) throw error;
}

export async function updateCustomActivity(id: string, updates: Record<string, any>): Promise<void> {
  const { error } = await supabase.from("activities").update(updates).eq("id", id);
  if (error) throw error;
}

export async function toggleBossEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from("bosses").update({ is_enabled: enabled }).eq("id", id);
  if (error) throw error;
}

export async function toggleActivityEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from("activities").update({ is_enabled: enabled }).eq("id", id);
  if (error) throw error;
}

export async function finishActivity(activityId: string): Promise<void> {
  const { data: activity } = await supabase.from("activities").select("schedule_type").eq("id", activityId).single();
  if (!activity) throw new Error("Activity not found");

  if (activity.schedule_type === "one_time") {
    const { error } = await supabase.from("activities").update({ is_enabled: false }).eq("id", activityId);
    if (error) throw error;
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("activity_instances").insert({
    activity_id: activityId,
    start_time: now,
    end_time: now,
  });
  if (error) throw error;
}

// ── Spawn Overrides ─────────────────────────────────────────

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

  await supabase
    .from("boss_spawn_overrides")
    .delete()
    .eq("boss_id", bossId)
    .eq("server_id", serverId);

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
  mode: "rotation" | "schedule" | "daily" = "rotation"
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
}

export async function upsertBossGuildPoints(
  bossId: string,
  guildId: string,
  points?: number | null,
  hasSalary?: boolean
): Promise<void> {
  const { data: existing } = await supabase
    .from("boss_guilds")
    .select("id")
    .eq("boss_id", bossId)
    .eq("guild_id", guildId)
    .limit(1);

  if (existing && existing.length > 0) {
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
