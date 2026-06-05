import { supabase, getCurrentServerId } from "./client";
import type { Guild, BossAssist } from "@/types";

// ── Guilds ──────────────────────────────────────────────────

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

// ── Boss Assists ────────────────────────────────────────────

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

export async function toggleBossAssist(
  bossId: string,
  ownerGuildId: string,
  assistantGuildId: string,
  serverId: string,
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("boss_assists")
    .select("id")
    .eq("boss_id", bossId)
    .eq("owner_guild_id", ownerGuildId)
    .eq("assistant_guild_id", assistantGuildId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("boss_assists")
      .delete()
      .eq("id", existing.id);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from("boss_assists")
    .insert({ boss_id: bossId, owner_guild_id: ownerGuildId, assistant_guild_id: assistantGuildId, server_id: serverId });
  if (error) throw error;
  return true;
}
