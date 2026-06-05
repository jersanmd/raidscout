import { supabase, getCurrentServerId } from "./client";
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
): Promise<PointRule> {
  const { data, error } = await supabase
    .from("point_rules")
    .insert({ server_id: serverId, guild_id: guildId, rule_type: ruleType, config })
    .select()
    .single();
  if (error) throw error;
  return data as PointRule;
}

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

export async function deletePointRule(ruleId: string): Promise<void> {
  const { error } = await supabase
    .from("point_rules")
    .delete()
    .eq("id", ruleId);
  if (error) throw error;
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
