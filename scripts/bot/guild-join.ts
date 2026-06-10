// @ts-nocheck
// Guild join handler -- welcome message

import { TOKEN } from "./config";
import { discordFetch } from "./discord-api";

export async function handleGuildJoin(guild: any) {
  const guildId = guild.id;
  const guildName = guild.name;

  let targetChannel: string | null = null;
  for (const ch of guild.channels || []) {
    if (ch.type === 0) {
      const perms = ch.permissions ? BigInt(ch.permissions) : 0n;
      if ((perms & 0x800n) && (perms & 0x400n)) {
        targetChannel = ch.id;
        break;
      }
    }
  }

  if (!targetChannel) return;

  await discordFetch(`https://discord.com/api/v10/channels/${targetChannel}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: "👋 RaidScout Bot is here!",
        description: `Thanks for adding me to **${guildName}**! Here's how to get started:`,
        color: 0x8b5cf6,
        fields: [
          {
            name: "1️⃣ Link this Discord server to RaidScout",
            value: "Go to **Server Settings → Integrations** on the [RaidScout web app](https://raidscout.vercel.app), enter your Discord Server ID, and choose a command prefix (default: `!`).",
          },
          {
            name: "2️⃣ Set up notifications",
            value: "Type `!notifhere` in a channel to receive boss kill/spawn alerts there. Type `!cmdhere` to restrict commands to a specific channel.\n\nAdmins can set a custom ping prefix per linked server (e.g. `@Raiders`) in **Server Settings → Integrations**. The bot also supports auto-creating threads for spawn events -- configure in the same tab.",
          },
          {
            name: "3️⃣ Try a command",
            value: "`!list` -- See all bosses\n`!nextspawn` -- Upcoming spawns in 24h\n`!nextspawn <boss>` -- Check a specific boss\n`!nextspawn <guild>` -- Spawns for a guild\n`!killed <boss>` -- Record a kill (only on alive bosses)\n`!editkilltime <boss> HH:MM [YYYY-MM-DD]` -- Fix a kill time (AM/PM correction)\n`!party <boss>` -- Show party members for a boss\n`!forcespawn <boss>` -- Force a boss to spawn\n`!forcespawnall` -- Spawn all fixed-timer bosses\n`!forcespawnall --all` -- Spawn all fixed-timer bosses across ALL servers\n`!commands` -- Full command list",
          },
          {
            name: "💡 Multiple RaidScout servers?",
            value: "If this Discord server tracks bosses for multiple games, each RaidScout server can use a different command prefix (e.g. `!` for Lineage II, `$` for WoW). Each linked server can have its own notification ping and thread channels.",
          },
        ],
        footer: { text: "Powered by RaidScout" },
      }],
    }),
  }).catch(() => {});
}
