// @ts-nocheck
// Notifications -- broadcast to linked Discord servers

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

export async function broadcastNotification(
  serverId: string,
  _config: any,
  _sourceChannelId: string,
  message: string,
) {
  try {
    const configs = await supabaseQuerySafe(
      `discord_configs?raidscout_server_id=eq.${serverId}&select=notification_channel_id`
    );
    if (!configs?.length) return;
    for (const cfg of configs) {
      const chId = cfg.notification_channel_id;
      if (!chId) continue;
      await discordFetch(`https://discord.com/api/v10/channels/${chId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      });
    }
  } catch (err: any) {
    console.error("[notif] broadcastNotification failed:", err.message);
  }
}
