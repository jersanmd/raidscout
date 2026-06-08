// @ts-nocheck
// Notifications -- broadcast to linked Discord servers with role mention resolution

import { TOKEN, SUPABASE_URL, SUPABASE_KEY } from "./config";
import { discordFetch } from "./discord-api";
import { supabaseQuerySafe } from "./supabase";

export const sentNotifs = new Map<string, number>();

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, ts] of sentNotifs) {
    if (ts < cutoff) sentNotifs.delete(key);
  }
}, 5 * 60_000);

// Cache guild role lookups (guildId -> roleName -> roleId)
const guildRoleCache = new Map<string, Map<string, string>>();

async function resolveRoles(guildId: string): Promise<Map<string, string>> {
  if (guildRoleCache.has(guildId)) return guildRoleCache.get(guildId)!;
  const map = new Map<string, string>();
  try {
    const res = await discordFetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${TOKEN}` },
    });
    if (res.ok) {
      const roles = await res.json();
      for (const role of roles) {
        map.set(role.name.toLowerCase(), role.id);
      }
    }
  } catch { /* skip */ }
  guildRoleCache.set(guildId, map);
  // Clear cache every 30 min
  setTimeout(() => guildRoleCache.delete(guildId), 30 * 60_000);
  return map;
}

function resolvePrefix(prefix: string, roleMap: Map<string, string>): string {
  return prefix.replace(/@(\S+)/g, (_, name) => {
    const id = roleMap.get(name.toLowerCase());
    return id ? `<@&${id}>` : `@${name}`;
  });
}

export async function broadcastNotification(
  serverId: string,
  _config: any,
  _sourceChannelId: string,
  message: string,
) {
  try {
    const configs = await supabaseQuerySafe(
      `discord_configs?raidscout_server_id=eq.${serverId}&select=notification_channel_id,discord_guild_id,notification_prefix`
    );
    if (!configs?.length) return;

    const rawPrefix = await supabaseQuerySafe(
      `servers?select=notification_prefix&id=eq.${serverId}`
    ).then(rows => rows?.[0]?.notification_prefix || "").catch(() => "");

    for (const cfg of configs) {
      const chId = cfg.notification_channel_id;
      if (!chId) continue;

      let prefix = cfg.notification_prefix || rawPrefix;
      if (prefix && cfg.discord_guild_id) {
        const roleMap = await resolveRoles(cfg.discord_guild_id);
        prefix = resolvePrefix(prefix, roleMap);
      }

      const content = prefix ? `${prefix} ${message}` : message;
      await discordFetch(`https://discord.com/api/v10/channels/${chId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content, allowed_mentions: { parse: ["everyone", "roles"] } }),
      });
    }
  } catch (err: any) {
    console.error("[notif] broadcastNotification failed:", err.message);
  }
}
