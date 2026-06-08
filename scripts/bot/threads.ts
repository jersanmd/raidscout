// @ts-nocheck
// Auto-thread creation for spawn events

import { TOKEN, SUPABASE_URL, SUPABASE_KEY } from "./config";
import { discordFetch } from "./discord-api";
import { supabaseQuerySafe } from "./supabase";
import { fetchPartyList, formatPartyListForThread } from "./party-utils";
import { resolveServerTimezone } from "./server-cache";

const threadCache = new Map<string, { threadId: string; createdAt: number }>();
const THREAD_CACHE_TTL = 30 * 60_000; // 30 minutes

async function createThreadInChannel(
  channelId: string,
  threadName: string,
  firstMessage: string,
  guildName: string | undefined,
) {
  const threadRes = await discordFetch(
    `https://discord.com/api/v10/channels/${channelId}/threads`,
    {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: threadName,
        type: 11,
        auto_archive_duration: 10080,
      }),
    }
  );

  if (threadRes.ok) {
    const thread = await threadRes.json() as any;
    console.log(`[thread] Created "${threadName}" in channel ${channelId}${guildName ? ` for ${guildName}` : ""}`);

    await discordFetch(
      `https://discord.com/api/v10/channels/${thread.id}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: firstMessage }),
      }
    ).catch(() => {});
    return thread.id;
  }
  return null;
}

export async function createEventThreads(
  serverId: string,
  name: string,
  guildName: string | undefined,
  spawnUnix: number,
  ownerType: "boss" | "activity" = "boss",
  targetId?: string,
) {
  try {
    const configs = await supabaseQuerySafe(
      `discord_configs?raidscout_server_id=eq.${serverId}&select=id,thread_channel_id,thread_guilds`
    );
    if (!configs?.length) return;

    const tz = await resolveServerTimezone(serverId).catch(() => "UTC");
    const spawnDate = new Date(spawnUnix * 1000);
    const timeStr = spawnDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz });
    const dateStr = spawnDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });

    for (const cfg of configs) {
      const channelId: string = cfg.thread_channel_id;
      const threadGuilds: string[] = cfg.thread_guilds || [];
      if (!channelId) continue;

      // Build party list
      let firstMessage = ".";
      if (targetId) {
        const parties = await fetchPartyList(serverId, targetId, ownerType);
        const formatted = formatPartyListForThread(parties);
        if (formatted) {
          firstMessage = `**Party Setup -- ${name}**\n${formatted}`;
        }
      }

      const hasParties = firstMessage !== ".";
      const hasGuildOwner = !!guildName;

      // ── Guild whitelist check ──
      const guildAllowed = threadGuilds.length === 0 ||
        (guildName != null && threadGuilds.some(g => g.toLowerCase() === guildName.toLowerCase()));

      // Main thread: only if guild is allowed or has parties
      if ((hasGuildOwner && guildAllowed) || hasParties) {
        const cacheKey = `${channelId}-${name}-${guildName || "noguild"}-${spawnUnix}`;
        const threadName = `${name}${guildName ? ` -- ${guildName}` : ""} -- ${dateStr}, ${timeStr}`;
        await createThreadInChannel(channelId, threadName, firstMessage, guildName);
        threadCache.set(cacheKey, { threadId: "", createdAt: Date.now() }); // mark as processed
      }

      // ── Assist guild threads ──
      if (targetId && guildName && ownerType === "boss") {
        try {
          const assistTable = "boss_assists";
          const ownerCol = "boss_id";
          const assists = await supabaseQuerySafe(
            `${assistTable}?${ownerCol}=eq.${targetId}&select=assistant_guild_id`
          );
          if (assists?.length) {
            const guildIds = [...new Set(assists.map((a: any) => a.assistant_guild_id))];
            const guildRows = await supabaseQuerySafe(
              `guilds?select=id,name&id=in.(${guildIds.map((id: string) => `'${id}'`).join(",")})`
            );
            const guildNames = new Map((guildRows || []).map((g: any) => [g.id, g.name]));

            for (const gid of guildIds) {
              const assistGuild = guildNames.get(gid);
              if (!assistGuild || assistGuild === guildName) continue;

              // Respect thread_guilds whitelist for assist threads too
              const assistAllowed = threadGuilds.length === 0 ||
                threadGuilds.some(g => g.toLowerCase() === assistGuild.toLowerCase());
              if (!assistAllowed) continue;

              const assistCacheKey = `${channelId}-${name}-${assistGuild}-assist-${spawnUnix}`;
              if (threadCache.has(assistCacheKey)) continue;
              threadCache.set(assistCacheKey, { threadId: "", createdAt: Date.now() });

              const assistThreadName = `${name} -- ${assistGuild} [Assist] -- ${dateStr}, ${timeStr}`;
              await createThreadInChannel(channelId, assistThreadName, ".", assistGuild);
            }
          }
        } catch (assistErr: any) {
          console.error("[thread] Assist lookup failed:", assistErr.message);
        }
      }
    }
  } catch (err: any) {
    console.error("[thread] createEventThreads failed:", err.message);
  }
}

// Clean up stale cache entries
setInterval(() => {
  const cutoff = Date.now() - THREAD_CACHE_TTL;
  for (const [key, entry] of threadCache) {
    if (entry.createdAt < cutoff) threadCache.delete(key);
  }
}, 10 * 60_000);
