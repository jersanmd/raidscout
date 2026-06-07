// @ts-nocheck
// Auto-thread creation for spawn events

import { TOKEN, SUPABASE_URL, SUPABASE_KEY } from "./config";
import { discordFetch } from "./discord-api";
import { supabaseQuerySafe } from "./supabase";
import { fetchPartyList, formatPartyListForThread } from "./party-utils";

const threadCache = new Map<string, { threadId: string; createdAt: number }>();
const THREAD_CACHE_TTL = 30 * 60_000; // 30 minutes

export async function createEventThreads(
  serverId: string,
  name: string,
  guildName: string | undefined,
  spawnUnix: number,
  ownerType: "boss" | "activity" = "boss",
  targetId?: string,
) {
  try {
    // Fetch all discord_configs for this server that have thread config
    const configs = await supabaseQuerySafe(
      `discord_configs?raidscout_server_id=eq.${serverId}&select=id,thread_channel_id,thread_guilds`
    );
    if (!configs?.length) return;

    for (const cfg of configs) {
      const channelId: string = cfg.thread_channel_id;
      const threadGuilds: string[] = cfg.thread_guilds || [];
      if (!channelId) continue;

      // Check if a thread already exists for this spawn event
      const cacheKey = `${channelId}-${name}-${spawnUnix}`;
      const cached = threadCache.get(cacheKey);
      let existingThreadId: string | null = cached?.threadId ?? null;

      if (!existingThreadId) {
        // Search active threads in the channel
        try {
          const activeThreads = await discordFetch(
            `https://discord.com/api/v10/channels/${channelId}/threads/active`,
            { headers: { Authorization: `Bot ${TOKEN}` } }
          );
          if (activeThreads.ok) {
            const data = await activeThreads.json() as any;
            const threads = data?.threads || [];
            // Match by thread name containing the boss/activity name
            for (const t of threads) {
              if (t.name?.toLowerCase().includes(name.toLowerCase())) {
                existingThreadId = t.id;
                threadCache.set(cacheKey, { threadId: t.id, createdAt: Date.now() });
                break;
              }
            }
          }
        } catch { /* ignore - will create new thread */ }
      }

      // Build party list as the first message
      let firstMessage = ".";
      if (targetId) {
        const parties = await fetchPartyList(serverId, targetId, ownerType);
        const formatted = formatPartyListForThread(parties);
        if (formatted) {
          firstMessage = `**Party Setup -- ${name}**\n${formatted}`;
        }
      }

      // ── Guild ownership gate ──
      // Only create thread if: guild owns/assists this boss OR there are parties assigned.
      // If no guild ownership AND no parties → skip entirely.
      const hasParties = firstMessage !== ".";
      const hasGuildOwner = !!guildName;
      if (!hasGuildOwner && !hasParties) continue;

      if (existingThreadId) {
        // Thread already exists -- send party list as a message
        await discordFetch(
          `https://discord.com/api/v10/channels/${existingThreadId}/messages`,
          {
            method: "POST",
            headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ content: firstMessage }),
          }
        ).catch(() => {});
        continue;
      }

      // Create a new thread
      const threadName = `🔔 ${name}${guildName ? ` -- ${guildName}` : ""} -- <t:${spawnUnix}:t>`;
      const res = await discordFetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            content: firstMessage,
            thread_name: threadName,
          }),
        }
      );

      if (res.ok) {
        const msg = await res.json() as any;
        if (msg?.thread?.id) {
          threadCache.set(cacheKey, { threadId: msg.thread.id, createdAt: Date.now() });
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
