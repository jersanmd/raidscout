import { supabase, getCurrentServerId } from "./client";
import { writeAuditEntry, AuditAction } from "./audit";

// ── Static Parties ─────────────────────────────────────────

export interface StaticParty {
  id: string;
  name: string;
  guild_id: string | null;
  guild_name: string | null;
  boss_id: string | null;
  boss_name: string | null;
  activity_id: string | null;
  activity_name: string | null;
  member_ids: string[];
  member_names: string[];
}

export async function fetchStaticParties(serverId?: string | null): Promise<StaticParty[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase.rpc("fetch_static_parties", { p_server_id: sid });
  if (error) throw error;
  return (data || []) as StaticParty[];
}

export async function createParty(name: string, guildId: string | null, bossId: string | null = null, activityId: string | null = null): Promise<string> {
  const sid = getCurrentServerId();
  if (!sid) throw new Error("No server selected");
  const { data, error } = await supabase.rpc("create_static_party", {
    p_server_id: sid, p_name: name.trim(), p_guild_id: guildId,
    p_boss_id: bossId, p_activity_id: activityId,
  });
  if (error) throw error;
  writeAuditEntry({ action: AuditAction.PARTY_CREATE, server_id: sid, target_id: data as string, details: { name: name.trim(), guild_id: guildId, boss_id: bossId, activity_id: activityId } });
  return data as string;
}

export async function deleteParty(partyId: string, serverId?: string): Promise<void> {
  const { error } = await supabase.rpc("delete_static_party", { p_party_id: partyId });
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.PARTY_DELETE, server_id: serverId, target_id: partyId });
}

export async function addMemberToParty(partyId: string, memberId: string): Promise<void> {
  const { error } = await supabase.rpc("add_member_to_party", {
    p_party_id: partyId, p_member_id: memberId,
  });
  if (error) throw error;
}

export async function removeMemberFromParty(memberId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_member_from_party", { p_member_id: memberId });
  if (error) throw error;
}

/** Assign a party to a specific boss */
export async function assignPartyToBoss(partyId: string, bossId: string): Promise<void> {
  const { error } = await supabase.rpc("assign_party_to_boss", {
    p_party_id: partyId, p_boss_id: bossId,
  });
  if (error) throw error;
}

/** Unlink a party from its boss/activity */
export async function unlinkParty(partyId: string): Promise<void> {
  const { error } = await supabase.rpc("unlink_party", {
    p_party_id: partyId,
  });
  if (error) throw error;
}
