import { supabase, getCurrentServerId } from "./client";
import { writeAuditEntry, AuditAction } from "./audit";
import type { PointRule } from "@/types";

// ── Point Rules ─────────────────────────────────────────────

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

export async function createPointRule(
  serverId: string,
  guildId: string,
  ruleType: "time_multiplier",
  config: Record<string, unknown>,
  guildName?: string,
): Promise<PointRule> {
  const { data, error } = await supabase
    .from("point_rules")
    .insert({ server_id: serverId, guild_id: guildId, rule_type: ruleType, config })
    .select()
    .single();
  if (error) throw error;
  // The caller used to write its own richer entry on top of this one, so every
  // rule produced two log rows. Auditing stays here — at the boundary, where it
  // can't be forgotten — and takes guildName since only the UI resolves it.
  writeAuditEntry({
    action: AuditAction.POINT_RULE_CREATE,
    server_id: serverId,
    target_id: data.id,
    details: { rule_type: ruleType, guild_name: guildName ?? guildId, ...config },
  });
  return data as PointRule;
}

export async function updatePointRule(
  ruleId: string,
  updates: { config?: Record<string, unknown>; enabled?: boolean },
  serverId?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("point_rules")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", ruleId);
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.POINT_RULE_UPDATE, server_id: serverId, target_id: ruleId, details: updates });
}

export async function deletePointRule(ruleId: string, serverId?: string | null): Promise<void> {
  const { error } = await supabase
    .from("point_rules")
    .delete()
    .eq("id", ruleId);
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.POINT_RULE_DELETE, server_id: serverId, target_id: ruleId });
}

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
