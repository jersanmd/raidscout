import { supabase, getCurrentServerId } from "./client";
import { writeAuditEntry, AuditAction } from "./audit";
import type { ActivityGuild, ActivityAssist } from "@/types";

export async function fetchActivityGuilds(serverId?: string | null): Promise<ActivityGuild[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase
    .from("activity_guilds")
    .select("*, activities!inner(server_id)")
    .eq("activities.server_id", sid);
  if (error) throw error;
  return (data || []) as ActivityGuild[];
}

export async function fetchAllActivityGuildsForServer(serverId?: string | null): Promise<ActivityGuild[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data: activityRows } = await supabase
    .from("activities")
    .select("id")
    .eq("server_id", sid);
  const activityIds = (activityRows || []).map(a => a.id);
  if (!activityIds.length) return [];
  const { data, error } = await supabase
    .from("activity_guilds")
    .select("*")
    .in("activity_id", activityIds);
  if (error) throw error;
  return (data || []) as ActivityGuild[];
}

export async function setActivityGuilds(
  activityId: string,
  assignments: { guild_id: string; sort_order?: number; day_of_week?: number }[],
  mode: "rotation" | "schedule" | "daily" | "all" = "rotation",
  serverId?: string | null
): Promise<void> {
  await supabase.from("activity_guilds").delete().eq("activity_id", activityId);
  if (assignments.length > 0) {
    const rows = assignments.map((a) => ({
      activity_id: activityId,
      guild_id: a.guild_id,
      sort_order: mode === "schedule" || mode === "all" ? null : (a.sort_order ?? null),
      day_of_week: mode === "schedule" ? (a.day_of_week ?? null) : null,
      mode,
    }));
    const { error } = await supabase.from("activity_guilds").insert(rows);
    if (error) throw error;
  }
  if (serverId) writeAuditEntry({ action: AuditAction.ACTIVITY_GUILDS_SET, server_id: serverId, target_id: activityId, details: { mode, guilds: assignments } });
}

export async function advanceActivityRotation(activityId: string, serverId?: string | null): Promise<void> {
  // Increment rotation by inserting a dummy instance with a counter reference
  // The caller should already have marked the activity as finished
  const { data: ags } = await supabase
    .from("activity_guilds")
    .select("*")
    .eq("activity_id", activityId)
    .eq("mode", "rotation")
    .order("sort_order");
  if (!ags || ags.length < 2) return;
  
  // Simple approach: just cycle the sort_orders
  const first = ags[0];
  for (let i = 0; i < ags.length - 1; i++) {
    await supabase.from("activity_guilds").update({ sort_order: ags[i + 1].sort_order }).eq("id", ags[i].id);
  }
  await supabase.from("activity_guilds").update({ sort_order: first.sort_order }).eq("id", ags[ags.length - 1].id);
  if (serverId) writeAuditEntry({ action: AuditAction.ACTIVITY_ROTATION_ADVANCE, server_id: serverId, target_id: activityId, details: { guilds: ags.map(a => a.guild_id) } });
}

export async function upsertActivityGuildPoints(
  activityId: string,
  guildId: string,
  points?: number | null,
  hasSalary?: boolean
): Promise<void> {
  const { data: existing } = await supabase
    .from("activity_guilds")
    .select("id")
    .eq("activity_id", activityId)
    .eq("guild_id", guildId)
    .limit(1);

  if (existing && existing.length > 0) {
    const update: Record<string, any> = {};
    if (points !== undefined) update.points = points;
    if (hasSalary !== undefined) update.has_salary = hasSalary;
    if (Object.keys(update).length === 0) return;
    const { error } = await supabase
      .from("activity_guilds")
      .update(update)
      .eq("id", existing[0].id);
    if (error) throw error;
  } else {
    const row: Record<string, any> = {
      activity_id: activityId,
      guild_id: guildId,
      mode: "rotation",
    };
    if (points !== undefined) row.points = points;
    if (hasSalary !== undefined) row.has_salary = hasSalary;
    const { error } = await supabase.from("activity_guilds").insert(row);
    if (error) throw error;
  }
}

// ── Activity Assists ─────────────────────────────────────────

export async function fetchActivityAssists(serverId?: string | null): Promise<ActivityAssist[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase
    .from("activity_assists")
    .select("*")
    .eq("server_id", sid);
  if (error) throw error;
  return (data || []) as ActivityAssist[];
}

export async function toggleActivityAssist(
  activityId: string,
  ownerGuildId: string,
  assistantGuildId: string,
  serverId: string,
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("activity_assists")
    .select("id")
    .eq("activity_id", activityId)
    .eq("owner_guild_id", ownerGuildId)
    .eq("assistant_guild_id", assistantGuildId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("activity_assists").delete().eq("id", existing.id);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from("activity_assists")
    .insert({ activity_id: activityId, owner_guild_id: ownerGuildId, assistant_guild_id: assistantGuildId, server_id: serverId });
  if (error) throw error;
  return true;
}
