// @ts-nocheck
// Server & cache helpers

import { supabaseQuerySafe } from "./supabase";

export async function resolveServerId(guildId: string, prefix: string): Promise<string | null> {
  const rows = await supabaseQuerySafe(
    `discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(prefix)}&select=raidscout_server_id`,
  );
  return rows?.[0]?.raidscout_server_id ?? null;
}

const guildPrefixes = new Map<string, { prefixes: string[]; cachedAt: number }>();
const PREFIX_CACHE_TTL = 5 * 60_000;

export async function getGuildPrefixes(guildId: string): Promise<string[]> {
  const cached = guildPrefixes.get(guildId);
  if (cached && Date.now() - cached.cachedAt < PREFIX_CACHE_TTL) return cached.prefixes;
  const rows = await supabaseQuerySafe(
    `discord_configs?discord_guild_id=eq.${guildId}&select=command_prefix`,
  );
  const prefixes: string[] = rows?.map((r: any) => r.command_prefix) ?? [];
  guildPrefixes.set(guildId, { prefixes, cachedAt: Date.now() });
  return prefixes;
}

export function bustPrefixCache(guildId: string) { guildPrefixes.delete(guildId); }

export async function resolveServerTimezone(serverId: string): Promise<string> {
  const rows = await supabaseQuerySafe(`servers?select=timezone&id=eq.${serverId}`);
  return rows?.[0]?.timezone || "UTC";
}

export async function getNotifyPrefix(serverId: string): Promise<string> {
  const rows = await supabaseQuerySafe(`servers?select=notification_prefix&id=eq.${serverId}`);
  return rows?.[0]?.notification_prefix || "";
}
