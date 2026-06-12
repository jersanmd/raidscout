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
    console.log(`[thread] ✅ Created "${threadName}" → channel ${channelId}${guildName ? ` (${guildName})` : ""}`);

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
  console.error(`[thread] ❌ Failed to create "${threadName}" in channel ${channelId}: HTTP ${threadRes.status}`);
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

    // Resolve thread_guilds UUIDs → guild names
    const allThreadGuildIds = [...new Set(configs.flatMap((c: any) => c.thread_guilds || []))];
    let guildIdToName = new Map<string, string>();
    if (allThreadGuildIds.length > 0) {
      const guildRows = await supabaseQuerySafe(
        `guilds?select=id,name&id=in.(${allThreadGuildIds.join(",")})`
      );
      guildIdToName = new Map((guildRows || []).map((g: any) => [g.id, g.name]));
    }

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

      // ── Guild whitelist check (use resolved guild names, not UUIDs) ──
      const threadGuildNames = threadGuilds.map((gid: string) => guildIdToName.get(gid) || gid);
      const guildAllowed = guildName != null &&
        threadGuildNames.some((g: string) => g.toLowerCase() === guildName.toLowerCase());

      // Main thread: ONLY create when thread_guilds is configured AND owner matches whitelist
      const shouldThread = threadGuilds.length > 0 && guildAllowed;
      if (shouldThread) {
        const cacheKey = `${channelId}-${name}-${guildName || "noguild"}-${spawnUnix}`;
        if (threadCache.has(cacheKey)) {
          console.log(`[thread] ⏭️ Cache hit: "${name}" ${guildName || ""} channel ${channelId}`);
          continue;
        }
        const threadName = `${name}${guildName ? ` -- ${guildName}` : ""} -- ${dateStr}, ${timeStr}`;
        const tid = await createThreadInChannel(channelId, threadName, firstMessage, guildName);
        if (tid) threadCache.set(cacheKey, { threadId: tid, createdAt: Date.now() });
      } else {
        console.log(`[thread] ⏭️ Skip "${name}": owner=${guildName || "none"} whitelist=[${threadGuildNames.join(",")}]`);
      }

      // ── Assist guild threads (owner_guild_id + assistant_guild_id from boss_assists) ──
      if (targetId && ownerType === "boss") {
        try {
          const assists = await supabaseQuerySafe(
            `boss_assists?boss_id=eq.${targetId}&select=owner_guild_id,assistant_guild_id`
          );
          if (assists?.length) {
            // Collect ALL guild IDs involved: owners + assistants
            const allIds = [...new Set([
              ...assists.map((a: any) => a.owner_guild_id),
              ...assists.map((a: any) => a.assistant_guild_id),
            ])];
            const guildRows = await supabaseQuerySafe(
              `guilds?select=id,name&id=in.(${allIds.join(",")})`
            );
            const guildNames = new Map<string, string>((guildRows || []).map((g: any) => [String(g.id), String(g.name)]));
            const resolvedAll = allIds.map((gid: string) => guildNames.get(gid) || gid).filter((n: string) => n !== guildName);
            console.log(`[thread] "${name}" assist guilds: [${resolvedAll.join(",")}]`);

            for (const gid of allIds) {
              const assistGuild = guildNames.get(gid);
              if (!assistGuild || assistGuild === guildName) continue;

              // Only thread assist guilds that are in the server's thread_guilds whitelist
              const assistAllowed = threadGuildNames.length > 0 &&
                threadGuildNames.some((g: string) => g.toLowerCase() === assistGuild.toLowerCase());
              if (!assistAllowed) {
                console.log(`[thread] ⏭️ Assist skip "${name}" → ${assistGuild}: not in whitelist [${threadGuildNames.join(",")}]`);
                continue;
              }

              const assistCacheKey = `${channelId}-${name}-${assistGuild}-assist-${spawnUnix}`;
              if (threadCache.has(assistCacheKey)) {
                console.log(`[thread] ⏭️ Assist cache hit: "${name}" → ${assistGuild}`);
                continue;
              }
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
