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

interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
}

export async function resolveRoles(guildId: string): Promise<Map<string, string>> {
  if (guildRoleCache.has(guildId)) return guildRoleCache.get(guildId)!;
  const map = new Map<string, string>();
  try {
    const res = await discordFetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${TOKEN}` },
    });
    if (res.ok) {
      const roles = (await res.json()) as DiscordRole[];
      for (const role of roles) {
        map.set(role.name.toLowerCase(), role.id);
      }
    }
  } catch (err) { console.error("[bot] role fetch failed for guild:", guildId, err); }
  guildRoleCache.set(guildId, map);
  // Clear cache every 30 min
  setTimeout(() => guildRoleCache.delete(guildId), 30 * 60_000);
  return map;
}

export function resolvePrefix(prefix: string, roleMap: Map<string, string>): string {
  // Match from @ until next @ or end. Then try progressively shorter word
  // combinations to find a matching role (handles "@RoleName display text").
  return prefix.replace(/@(.+?)(?=\s*@|$)/g, (_, name) => {
    const words = name.trim().split(/\s+/);
    for (let i = words.length; i > 0; i--) {
      const candidate = words.slice(0, i).join(" ");
      const id = roleMap.get(candidate.toLowerCase());
      if (id) {
        const remaining = words.slice(i).join(" ");
        return `<@&${id}>${remaining ? " " + remaining : ""}`;
      }
    }
    return `@${name.trim()}`;
  });
}

export async function broadcastNotification(
  serverId: string,
  _config: any,
  _sourceChannelId: string,
  message: string,
  preFetched?: { configs?: any[]; serverPrefix?: string },
) {
  try {
    const configs = preFetched?.configs
      ?? await supabaseQuerySafe(`discord_configs?raidscout_server_id=eq.${serverId}&select=id,notification_channel_id,discord_guild_id,notification_prefix`);

    if (!configs?.length) return;

    const rawPrefix = preFetched?.serverPrefix
      ?? await supabaseQuerySafe(`servers?select=notification_prefix&id=eq.${serverId}`).then(rows => rows?.[0]?.notification_prefix || "").catch(() => "");

    for (const cfg of configs) {
      const chId = cfg.notification_channel_id;
      if (!chId) continue;

      try {
        let prefix = cfg.notification_prefix || rawPrefix;
        if (prefix && cfg.discord_guild_id) {
          const roleMap = await resolveRoles(cfg.discord_guild_id);
          prefix = resolvePrefix(prefix, roleMap);
        }

        const content = prefix ? `${prefix} ${message}` : message;
        const res = await discordFetch(`https://discord.com/api/v10/channels/${chId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ content, allowed_mentions: { parse: ["everyone", "roles"] } }),
        });
        // Self-heal: clear channel if Discord says it's gone or we lack access
        if (!res.ok && (res.status === 404 || res.status === 403)) {
          console.warn(`[notif] clearing dead channel config ${cfg.id} (guild ${cfg.discord_guild_id} ch ${chId}, status ${res.status})`);
          fetch(`${SUPABASE_URL}/rest/v1/discord_configs?id=eq.${cfg.id}`, {
            method: "PATCH",
            headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ notification_channel_id: null }),
          }).catch(() => {});
        }
      } catch (cfgErr: any) {
        console.error(`[notif] failed to send to Discord guild ${cfg.discord_guild_id} ch ${chId}:`, cfgErr.message);
        // Do NOT clear channel on network errors — timeouts/429s during high load (e.g. forcespawnall)
        // are transient and don't mean the channel is dead.
      }
    }
  } catch (err: any) {
    console.error("[notif] broadcastNotification failed:", err.message);
  }
}
