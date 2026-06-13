// @ts-nocheck
// Command handler -- all Discord chat commands

import { TOKEN, SUPABASE_URL, SUPABASE_KEY, SITE_URL, botUserId } from "./config";
import { discordFetch } from "./discord-api";
import { supabaseQuery, supabaseQuerySafe } from "./supabase";
import { getGuildPrefixes, resolveServerId, resolveServerTimezone, bustPrefixCache } from "./server-cache";
import { addHours, computeOwnerGuild, getScheduleTz, scheduleSlotToUTC, findNextScheduleSlot } from "./spawn-utils";
import { fetchPartyList } from "./party-utils";
import { broadcastNotification } from "./notifications";

export async function handleMessage(msg: any) {
  const content: string = msg.content?.trim() ?? "";
  const channelId: string = msg.channel_id;
  const guildId: string = msg.guild_id;
  const author: string = msg.author?.username ?? "unknown";

  const guildServerNames = new Map<string, string>();
  const resolveServerName = async (gid: string): Promise<string> => {
    const cached = guildServerNames.get(gid);
    if (cached) return cached;
    try {
      const rows = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${gid}&select=raidscout_server_id,servers!inner(name)&limit=1`);
      const name = rows?.[0]?.servers?.name ?? "?";
      guildServerNames.set(gid, name);
      return name;
    } catch (err) { console.error("[bot] resolveServerName failed for guild:", gid, err); guildServerNames.set(gid, "?"); return "?"; }
  };
  const cmdLog = async (cmd: string, result: "ok" | "fail", detail?: string) => {
    const guildTag = guildId ? guildId.slice(0, 8) : "DM";
    const srvName = guildId ? await resolveServerName(guildId) : "";
    const namePart = srvName ? ` [${srvName}]` : "";
    console.log(`[cmd] ${author}@${guildTag}${namePart}:${cmd} -- ${result}${detail ? ` (${detail})` : ""}`);
  };

  // Resolve prefix & command
  let mentionedPrefix = "";
  if (botUserId && content) {
    const mentionPattern = new RegExp(`<@!?${botUserId}>\\s*`);
    const mentionMatch = content.match(mentionPattern);
    if (mentionMatch) mentionedPrefix = mentionMatch[0];
  }

  if (!guildId) return;
  const prefixes = await getGuildPrefixes(guildId);
  const matchedPrefix = prefixes.find(p => content.startsWith(p));
  if (!matchedPrefix && !mentionedPrefix) return;
  const effectivePrefix = matchedPrefix || mentionedPrefix;
  const args = content.slice(effectivePrefix.length).split(/\s+/);
  const rawCmd = args[0]?.toLowerCase();

  let aliases: Record<string, string> = {};
  const aliasPrefix = matchedPrefix || prefixes[0] || "";
  if (aliasPrefix) {
    const aliasRows = await supabaseQuerySafe(
      `discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(aliasPrefix)}&select=command_aliases`
    );
    if (aliasRows?.[0]?.command_aliases) aliases = aliasRows[0].command_aliases;
  }
  const cmd = aliases[rawCmd] || rawCmd;
  const serverId = await resolveServerId(guildId, matchedPrefix || prefixes[0] || "");

  if (serverId && guildId) {
    try {
      const srvRows = await supabaseQuerySafe(`servers?id=eq.${serverId}&select=name`);
      const srvName = srvRows?.[0]?.name;
      if (srvName) guildServerNames.set(guildId, srvName);
    } catch (err) { console.error("[bot] server name lookup failed for guild:", guildId, err); }
  }

  // Maintenance check
  if (serverId) {
    try {
      const maintRows = await supabaseQuerySafe(`app_settings?key=eq.maintenance_mode&server_id=eq.${serverId}&select=value`);
      const globalMaint = await supabaseQuerySafe(`app_settings?key=eq.maintenance_mode&server_id=is.null&select=value`);
      const isMaint = maintRows?.[0]?.value === "true" || globalMaint?.[0]?.value === "true";
      if (isMaint && cmd && cmd !== "help" && cmd !== "commands") {
        let mtMsg = "🔧 RaidScout is currently under maintenance for this server. Please try again later.";
        try {
          const endRows = await supabaseQuerySafe(`app_settings?key=eq.maintenance_end&server_id=eq.${serverId}&select=value`);
          const globalEnd = await supabaseQuerySafe(`app_settings?key=eq.maintenance_end&server_id=is.null&select=value`);
          const endVal = endRows?.[0]?.value || globalEnd?.[0]?.value;
          if (endVal) {
            const endDate = new Date(endVal);
            const tz = await resolveServerTimezone(serverId);
            mtMsg += `\n📅 Expected to be back ${endDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz, timeZoneName: "short" })}.`;
          }
        } catch (err) { console.error("[bot] maintenance end lookup failed:", err); }
        await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ content: mtMsg }),
        });
        return;
      }
    } catch (err) { console.error("[bot] maintenance check failed:", err); }
  }

  // ✅ reaction
  const validCmds = new Set(["list","nextspawn","spawn","killed","kill","editkilltime","forcespawn","forcespawnall","spawnall","commands","help","notifhere","cmdhere","threadhere","progresshere","party","updatestats","ping"]);
  if (validCmds.has(cmd)) {
    discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("✅")}/@me`, {
      method: "PUT", headers: { Authorization: `Bot ${TOKEN}` },
    }).catch(() => {});
  }

  // Command channel restriction
  if (matchedPrefix) {
    const cfgRows = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=command_channel_id`);
    const cmdChannel = cfgRows?.[0]?.command_channel_id;
    if (cmdChannel && channelId !== cmdChannel && cmd !== "cmdhere" && cmd !== "notifhere" && cmd !== "threadhere" && cmd !== "progresshere" && cmd !== "forcespawn" && cmd !== "forcespawnall" && cmd !== "spawnall") {
      // Also allow progress-related commands in the progress channel
      const progressCmds = new Set(["updatestats"]);
      if (progressCmds.has(cmd)) {
        const progRows = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=progress_channel_id`);
        const progChannel = progRows?.[0]?.progress_channel_id;
        if (!progChannel) {
          return reply("⚠️ No progress channel configured. Use `!progresshere` in a channel to set it, then `!updatestats` will work there.");
        }
        if (channelId !== progChannel) {
          // Check if this is a thread inside the progress channel
          const chanRes = await discordFetch(`https://discord.com/api/v10/channels/${channelId}`, {
            headers: { Authorization: `Bot ${TOKEN}` },
          }).catch(() => null);
          if (chanRes?.ok) {
            const chanInfo = await chanRes.json() as any;
            if (chanInfo.parent_id === progChannel) {
              // It's a thread under the progress channel — allow it
            } else {
              return reply(`⚠️ This command only works in the progress channel (<#${progChannel}>) or its threads, or the command channel.`);
            }
          } else {
            return reply(`⚠️ This command only works in the progress channel (<#${progChannel}>) or the command channel.`);
          }
        }
      } else {
        return reply(`⚠️ This command only works in the designated command channel.`);
      }
    }
  }

  async function reply(text: string) {
    await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    await cmdLog(cmd, "ok");
  }

  async function replyEmbed(title: string, desc: string, color: number, fields?: any[]) {
    const res = await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [{ title, description: desc, color, fields, footer: { text: "Powered by RaidScout" } }] }),
    });
    if (!res.ok) console.error(`replyEmbed failed: ${res.status}`, await res.text().catch(() => ""));
    await cmdLog(cmd, "ok");
  }

  // ── list ──
  if (cmd === "list") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ This Discord server is not linked to RaidScout."); }
    const [bosses, activities] = await Promise.all([
      supabaseQuery(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&order=name`),
      supabaseQuery(`activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&order=name`),
    ]);
    const allItems = [
      ...(bosses || []).map((b: any) => ({ name: b.name, type: "boss" })),
      ...(activities || []).map((a: any) => ({ name: `📋 ${a.name}`, type: "activity" })),
    ];
    if (!allItems.length) { await cmdLog(cmd, "fail", "no items"); return reply("No bosses or activities found."); }
    const chunkSize = 25;
    const chunks: string[] = [];
    for (let i = 0; i < allItems.length; i += chunkSize) {
      chunks.push(allItems.slice(i, i + chunkSize).map((item, j) => `${i + j + 1}. ${item.name}`).join("\n"));
    }
    const total = `${bosses?.length || 0} bosses, ${activities?.length || 0} activities`;
    for (let c = 0; c < chunks.length; c++) {
      await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [{ title: c === 0 ? `📋 List (${total})` : undefined, description: chunks[c], color: 0x8b5cf6, footer: c === 0 ? { text: "Powered by RaidScout" } : undefined }] }),
      });
    }
    await cmdLog(cmd, "ok", total);
    return;
  }

  // ── notifhere ──
  if (cmd === "notifhere") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }
    const existing = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=id`);
    if (existing?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/discord_configs?id=eq.${existing[0].id}`, {
        method: "PATCH", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
        body: JSON.stringify({ notification_channel_id: msg.channel_id }),
      });
    }
    return reply("✅ This channel will now receive boss kill, spawn, and activity notifications.");
  }

  // ── cmdhere ──
  if (cmd === "cmdhere") {
    if (!serverId) return reply("⚠️ Not linked to RaidScout.");
    const existing = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=id`);
    if (existing?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/discord_configs?id=eq.${existing[0].id}`, {
        method: "PATCH", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
        body: JSON.stringify({ command_channel_id: msg.channel_id }),
      });
      bustPrefixCache(guildId);
    }
    return reply("✅ Bot commands will now only work in this channel.");
  }

  // ── progresshere ──
  if (cmd === "progresshere") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }
    const existing = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=id`);
    if (existing?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/discord_configs?id=eq.${existing[0].id}`, {
        method: "PATCH", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
        body: JSON.stringify({ progress_channel_id: msg.channel_id }),
      });
    }
    return reply("✅ Progress reports and `!updatestats` commands will now work in this channel. Use the **Demand Update** button on RaidScout to create progress threads here.");
  }

  // ── threadhere ──
  if (cmd === "threadhere") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }
    const existing = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=id`);
    if (existing?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/discord_configs?id=eq.${existing[0].id}`, {
        method: "PATCH", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
        body: JSON.stringify({ thread_channel_id: msg.channel_id }),
      });
    }
    return reply("✅ Auto-threads for spawn events will be created in this channel.");
  }

  // ── party <boss|activity> ──
  if (cmd === "party") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }
    const targetName = args.slice(1).join(" ");
    if (!targetName) { await cmdLog(cmd, "fail", "no name"); return reply("Usage: `!party Boss/Activity Name`"); }

    let targetId: string | null = null, targetLabel = targetName, ownerType: "boss" | "activity" = "boss";
    const bosses = await supabaseQuerySafe(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&name=ilike.${encodeURIComponent("%" + targetName + "%")}&select=id,name`);
    if (bosses?.length) { targetId = bosses[0].id; targetLabel = bosses[0].name; }
    else {
      const activities = await supabaseQuerySafe(`activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&name=ilike.${encodeURIComponent("%" + targetName + "%")}&select=id,name`);
      if (activities?.length) { targetId = activities[0].id; targetLabel = activities[0].name; ownerType = "activity"; }
    }
    if (!targetId) return reply(`**${targetName}** not found.`);

    const parties = await fetchPartyList(serverId, targetId, ownerType);
    if (!parties.length) return reply(`📋 **${targetLabel}** -- No party assigned yet.`);

    const fields = parties.map(p => ({
      name: `🎯 ${p.name} (${p.members.length})`, value: p.members.join("\n") || "_No members_", inline: true
    }));
    await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [{ title: `📋 Party Setup -- ${targetLabel}`, fields, color: 0x8b5cf6, footer: { text: "Powered by RaidScout" } }] }),
    });
    await cmdLog(cmd, "ok", `${targetLabel} → ${parties.length} parties`);
    return;
  }

  // ── forcespawn <boss|activity> ──
  if (cmd === "forcespawn") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to Raidscout."); }
    const name = args.slice(1).join(" ");
    if (!name) { await cmdLog(cmd, "fail", "no name"); return reply("Usage: `!forcespawn Boss/Activity Name`"); }
    // Try bosses first
    const bosses = await supabaseQuery(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&name=ilike.${encodeURIComponent("%" + name + "%")}&select=id,name,respawn_hours`);
    if (bosses?.length) {
      const boss = bosses[0];
      const now = new Date();
      const deathTime = new Date(now.getTime() - (boss.respawn_hours || 24) * 3600000).toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides?boss_id=eq.${boss.id}&server_id=eq.${serverId}`, {
        method: "DELETE", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
      }).catch(() => {});
      await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides`, {
        method: "POST", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: serverId, boss_id: boss.id, death_time: deathTime }),
      });
      return reply(`✅ **${boss.name}** has been force-spawned.`);
    }
    // Activity fallback — start it now
    const activities = await supabaseQuery(`activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&name=ilike.${encodeURIComponent("%" + name + "%")}&select=id,name`);
    if (!activities?.length) { await cmdLog(cmd, "fail", `"${name}" not found`); return reply(`**${name}** not found.`); }
    const act = activities[0];
    const now = new Date();
    await fetch(`${SUPABASE_URL}/rest/v1/activity_instances`, {
      method: "POST", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
      body: JSON.stringify({ activity_id: act.id, start_time: now.toISOString() }),
    });
    return reply(`✅ **${act.name}** activity started now.`);
  }

  // ── forcespawnall ──
  if (cmd === "forcespawnall" || cmd === "spawnall") {
    const allFlag = args[1] === "--all";
    if (allFlag) {
      const allServers = await supabaseQuery(`servers?deleted_at=is.null&select=id,name`);
      if (!allServers?.length) return reply("No servers found.");
      let totalCount = 0; const results: string[] = []; const now = Date.now();
      for (const srv of allServers) {
        const bosses = await supabaseQuery(`bosses?server_id=eq.${srv.id}&is_enabled=not.is.false&deleted_at=is.null&spawn_type=eq.fixed_hours&select=id,respawn_hours`);
        if (!bosses?.length) continue;
        let count = 0;
        for (const b of bosses) {
          try {
            const dt = new Date(now - (b.respawn_hours || 24) * 3600000).toISOString();
            await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides?boss_id=eq.${b.id}&server_id=eq.${srv.id}`, { method: "DELETE", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` } });
            await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides`, { method: "POST", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" }, body: JSON.stringify({ server_id: srv.id, boss_id: b.id, death_time: dt }) });
            count++;
          } catch (err) { console.error("[bot] forcespawnall delete override failed:", b.id, err); }
        }
        if (count > 0) { totalCount += count; results.push(`**${srv.name}**: ${count} bosses`); }
      }
      if (results.length === 0) return reply("No fixed-timer bosses found.");
      return reply(`✅ **forcespawnall --all** complete!\n${results.join("\n")}\n\n**Total: ${totalCount}** bosses across **${results.length}** servers.`);
    }
    if (!serverId) return reply("⚠️ Not linked to RaidScout.");
    const bosses = await supabaseQuery(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&spawn_type=eq.fixed_hours&select=id,respawn_hours`);
    if (!bosses?.length) return reply("No fixed-timer bosses found.");
    const now = Date.now(); let count = 0;
    for (const b of bosses) {
      try {
        const dt = new Date(now - (b.respawn_hours || 24) * 3600000).toISOString();
        await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides?boss_id=eq.${b.id}&server_id=eq.${serverId}`, { method: "DELETE", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` } });
        await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides`, { method: "POST", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" }, body: JSON.stringify({ server_id: serverId, boss_id: b.id, death_time: dt }) });
        count++;
      } catch (err) { console.error("[bot] forcespawnall create override failed:", b.id, err); }
    }
    return reply(`✅ **${count}** fixed-timer bosses force-spawned.`);
  }

  // ── commands / help ──
  if (cmd === "commands" || cmd === "help") {
    const p = matchedPrefix;
    const guildConfigs = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&select=command_prefix,label,command_aliases`);
    const multiServer = (guildConfigs?.length ?? 0) > 1;
    const prefixNote = multiServer ? `\n💡 Multiple servers linked:\n${guildConfigs.map((c: any) => `\`${c.command_prefix}\` -- ${c.label || "Unnamed"}`).join("\n")}` : "";
    const serverConfig = guildConfigs?.find((c: any) => c.command_prefix === matchedPrefix);
    const aliasesMap: Record<string, string> = serverConfig?.command_aliases || {};
    const reverseAliases: Record<string, string> = {};
    for (const [canon, alias] of Object.entries(aliasesMap)) { if (alias) reverseAliases[canon] = alias; }
    const aliasNote = (alias: string) => reverseAliases[alias] ? ` (alias: \`${p}${reverseAliases[alias]}\`)` : "";
    return replyEmbed("📋 RaidScout Bot Commands", `Prefix: \`${p}\`${prefixNote}`, 0x8b5cf6, [
      { name: `${p}nextspawn${aliasNote("nextspawn")}`, value: "List boss spawns in the next 24 hours", inline: false },
      { name: `${p}nextspawn <boss>`, value: "Check spawn for a specific boss", inline: false },
      { name: `${p}nextspawn <guild>`, value: "List spawns for a specific guild", inline: false },
      { name: `${p}killed <boss>${aliasNote("killed")}`, value: "Record a boss kill right now", inline: false },
      { name: `${p}killed <boss> HH:MM`, value: "Record a kill at a custom time", inline: false },
      { name: `${p}editkilltime <boss> HH:MM [YYYY-MM-DD]`, value: "Fix a kill time (AM/PM correction)", inline: false },
      { name: `${p}commands${aliasNote("commands")}`, value: "Show this help", inline: false },
      { name: `${p}notifhere${aliasNote("notifhere")}`, value: "Set notification channel", inline: false },
      { name: `${p}cmdhere${aliasNote("cmdhere")}`, value: "Restrict commands to this channel", inline: false },
      { name: `${p}progresshere${aliasNote("progresshere")}`, value: "Set progress report & !updatestats channel", inline: false },
      { name: `${p}threadhere${aliasNote("threadhere")}`, value: "Set auto-thread channel", inline: false },
      { name: `${p}forcespawn <boss>`, value: "Force a boss to spawn", inline: false },
      { name: `${p}party <boss/activity>`, value: "Show party members for a boss/activity", inline: false },
    ]);
  }

  // ── nextspawn [boss|guild] ──
  if (cmd === "nextspawn" || cmd === "spawn") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }
    const filter = args[1];
    const tz = await resolveServerTimezone(serverId);
    const [bosses, deaths, guilds, overrides] = await Promise.all([
      supabaseQuery(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&order=name`),
      supabaseQuery(`death_records?server_id=eq.${serverId}&order=death_time.desc&limit=200`),
      supabaseQuery(`guilds?server_id=eq.${serverId}`),
      supabaseQuery(`boss_spawn_overrides?server_id=eq.${serverId}&select=boss_id,death_time`),
    ]);
    const overrideMap = new Map((overrides || []).map((o: any) => [o.boss_id, o.death_time]));
    const filterGuild = filter ? guilds.find((g: any) => g.name.toLowerCase() === filter.toLowerCase()) : null;
    const now = new Date();
    const cutoff = addHours(now, 24);
    const upcoming: { name: string; time: string; unix: number; guild: string }[] = [];
    const bossGuilds = await supabaseQuery(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode`);
    const serverGuildIds = new Set(guilds.map((g: any) => g.id));
    const serverBossGuilds = bossGuilds.filter((bg: any) => serverGuildIds.has(bg.guild_id));

    for (const boss of bosses) {
      if (filter && !boss.name.toLowerCase().includes(filter.toLowerCase())) {
        if (!filterGuild) continue;
        const lastDeath = deaths.filter((d: any) => d.boss_id === boss.id && !d.is_initial_spawn).sort((a: any, b: any) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];
        const gName = computeOwnerGuild(boss, serverBossGuilds, guilds, lastDeath, now, tz) || "";
        if (gName.toLowerCase() !== filterGuild.name.toLowerCase()) continue;
      }
      const lastDeath = deaths.filter((d: any) => d.boss_id === boss.id && !d.is_initial_spawn).sort((a: any, b: any) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];
      let spawn: Date;
      if (boss.spawn_type === "fixed_hours") {
        const overrideDeathTime = overrideMap.get(boss.id);
        const effectiveDeathTime = overrideDeathTime ?? lastDeath?.death_time ?? null;
        spawn = effectiveDeathTime ? addHours(new Date(effectiveDeathTime), boss.respawn_hours ?? 0) : now;
        if (spawn <= now) spawn = now;
      } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
        const schedTz = getScheduleTz(boss, tz);
        // Only check alive window if there's a death record (boss actually spawned before)
        if (lastDeath) {
          let recentTime: Date | null = null;
          for (let d = 0; d <= 7; d++) { const check = new Date(now); check.setDate(check.getDate() - d);
            for (const slot of boss.schedule) { const c = scheduleSlotToUTC(schedTz, check, slot.day, slot.time); if (c <= now && (!recentTime || c > recentTime)) recentTime = c; }
          }
          if (recentTime) {
            const nextSlotTime = findNextScheduleSlot(boss.schedule, new Date(recentTime.getTime() + 60_000), schedTz);
            const aliveUntil = new Date(Math.min(nextSlotTime.getTime() - 3600_000, recentTime.getTime() + 4 * 3600_000));
            const wasKilled = new Date(lastDeath.death_time) >= recentTime;
            spawn = (!wasKilled && now >= recentTime && now < aliveUntil) ? now : findNextScheduleSlot(boss.schedule, now, schedTz);
          } else {
            spawn = findNextScheduleSlot(boss.schedule, now, schedTz);
          }
        } else {
          spawn = findNextScheduleSlot(boss.schedule, now, schedTz);
        }
      } else continue;
      if (spawn.getTime() <= cutoff.getTime()) {
        const gName = computeOwnerGuild(boss, serverBossGuilds, guilds, lastDeath, spawn, tz) || "";
        const unix = Math.floor(spawn.getTime() / 1000);
        upcoming.push({ name: boss.name, time: spawn <= now ? "**ALIVE NOW**" : `<t:${unix}:t>`, unix, guild: gName });
      }
    }
    // ── Activities (within 24h cutoff, merged and sorted with bosses) ──
    const activities = await supabaseQuery(`activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null`);
    let activityInstances: any[] = [];
    if (activities?.length) {
      const actIds = activities.map((a: any) => a.id);
      // Fetch instances for these activities in batches (PostgREST in-filter limit ~100)
      const batchSize = 100;
      for (let i = 0; i < actIds.length; i += batchSize) {
        const batch = actIds.slice(i, i + batchSize).map((id: string) => `"${id}"`).join(",");
        const batchData = await supabaseQuery(`activity_instances?activity_id=in.(${batch})&order=start_time.desc&limit=${batchSize}`);
        if (batchData) activityInstances.push(...batchData);
      }
    }
    const lastActivityMap = new Map<string, any>();
    for (const ai of activityInstances) {
      if (!lastActivityMap.has(ai.activity_id)) lastActivityMap.set(ai.activity_id, ai);
    }
    for (const act of (activities || [])) {
      if (filter && !act.name.toLowerCase().includes(filter.toLowerCase())) continue;
      const lastInst = lastActivityMap.get(act.id);
      let startTime: Date | null = null;
      const raw = act.schedule;
      if (act.schedule_type === "fixed_schedule" && Array.isArray(raw)) {
        // Custom items store schedule in UTC, seed/template items in Asia/Manila
        const actTz = (act.is_custom || act.template_id) ? "UTC" : "Asia/Manila";
        // Only check active window if there's an instance (activity was actually started before)
        if (lastInst) {
          let recentSlot: Date | null = null;
          for (let d = 0; d <= 7; d++) { const check = new Date(now); check.setDate(check.getDate() - d);
            for (const slot of raw) { const c = scheduleSlotToUTC(actTz, check, slot.day, slot.time); if (c <= now && (!recentSlot || c > recentSlot)) recentSlot = c; }
          }
          if (recentSlot) {
            const nextSlotAfterRecent = findNextScheduleSlot(raw, new Date(recentSlot.getTime() + 60_000), actTz);
            const maxActiveWindow = Math.min(nextSlotAfterRecent.getTime() - recentSlot.getTime() - 3600_000, 4 * 3600_000);
            const activeUntil = new Date(recentSlot.getTime() + maxActiveWindow);
            const wasFinished = lastInst?.end_time && new Date(lastInst.end_time) >= recentSlot;
            if (!wasFinished && now >= recentSlot && now < activeUntil) {
              startTime = now;
            } else {
              startTime = findNextScheduleSlot(raw, now, actTz);
            }
          } else {
            startTime = findNextScheduleSlot(raw, now, actTz);
          }
        } else {
          // No instance yet — countdown to next slot
          startTime = findNextScheduleSlot(raw, now, actTz);
        }
      } else {
        const schedObj = (typeof raw === "object" && raw !== null && !Array.isArray(raw)) ? raw as { time: string; start_date?: string; utc_start?: string } : null;
        const timeStr = schedObj?.time ?? (typeof raw === "string" ? raw : null);
        const utcStart = schedObj?.utc_start ?? null;
        const recurMs = (act.duration_minutes ?? 0) * 60_000;
        if (utcStart) {
          // Activity has explicit UTC start time
          startTime = new Date(utcStart);
        } else if (timeStr) {
          const [h, m] = timeStr.split(":").map(Number);
          // Convert server-local HH:MM to UTC using timezone offset detection
          const localDate = now.toLocaleDateString("en-CA", { timeZone: tz });
          const [y, mo, d] = localDate.split("-").map(Number);
          const testUtc = Date.UTC(y, mo - 1, d, h, m);
          const testLocal = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(testUtc));
          const [tlH, tlM] = testLocal.split(":").map(Number);
          const offsetMs = ((tlH - h) * 60 + (tlM - m)) * 60_000;
          startTime = new Date(testUtc - offsetMs);
        }
        if (startTime) {
          if (startTime <= now && !utcStart) startTime.setUTCDate(startTime.getUTCDate() + 1);
          if (lastInst?.end_time && recurMs > 0 && act.schedule_type === "fixed_hours") {
            const baseTime = new Date(lastInst.end_time);
            const elapsed = now.getTime() - baseTime.getTime();
            const intervals = Math.ceil(elapsed / recurMs);
            startTime = new Date(baseTime.getTime() + intervals * recurMs);
            if (startTime.getTime() <= now.getTime()) startTime = new Date(startTime.getTime() + recurMs);
          }
          if (!lastInst?.end_time && lastInst?.start_time && recurMs > 0) {
            startTime = new Date(lastInst.start_time);
          }
        }
      }
      if (startTime && startTime.getTime() <= cutoff.getTime()) {
        const unix = Math.floor(startTime.getTime() / 1000);
        upcoming.push({
          name: `📋 ${act.name}`,
          time: startTime <= now ? "**ACTIVE NOW**" : `<t:${unix}:t>`,
          unix,
          guild: "",
        });
      }
    }

    if (upcoming.length === 0) {
      if (filter) await cmdLog(cmd, "fail", `no spawns for "${filter}"`); else await cmdLog(cmd, "fail", "no spawns in 24h");
      return reply(filter ? `No spawn data for **${filter}** in 24h.` : "No bosses spawning in 24h.");
    }
    upcoming.sort((a, b) => {
      if (a.time === "**ALIVE NOW**" && b.time !== "**ALIVE NOW**") return -1;
      if (b.time === "**ALIVE NOW**" && a.time !== "**ALIVE NOW**") return 1;
      return a.unix - b.unix;
    });
    const lines = upcoming.map((b, i) => {
      const prefix = b.time === "**ALIVE NOW**" ? "🟢 " : "";
      const guild = b.guild ? ` -- ${b.guild}` : "";
      const countdown = b.time !== "**ALIVE NOW**" ? ` (<t:${b.unix}:R>)` : "";
      return `${i + 1}. ${prefix}${b.name}${guild} ${b.time}${countdown}`;
    });
    await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [{ title: filterGuild ? `📋 ${filterGuild.name} Spawns (24h)` : filter ? `${filter} Spawn` : "📋 Upcoming Boss Spawns (24h)", description: lines.join("\n"), color: 0x8b5cf6, footer: { text: "Powered by RaidScout" } }] }),
    });
    await cmdLog(cmd, "ok", `${upcoming.length} spawns`);
    return;
  }

  // ── killed <boss> [HH:MM] [yesterday|today] ──
  if (cmd === "killed" || cmd === "kill") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }
    let timeStr: string | undefined, bossName: string, explicitDay: "yesterday" | "today" | null = null;
    const remaining = args.slice(1);
    const lastWord = remaining[remaining.length - 1]?.toLowerCase();
    if (lastWord === "yesterday" || lastWord === "today") { explicitDay = lastWord; remaining.pop(); }
    const maybeTime = remaining[remaining.length - 1];
    if (maybeTime && /^\d{1,2}:\d{2}$/.test(maybeTime)) { timeStr = maybeTime; remaining.pop(); }
    bossName = remaining.join(" ");
    if (!bossName) { await cmdLog(cmd, "fail", "no boss name"); return reply("Usage: `!kill Boss/Activity Name [HH:MM] [yesterday|today]`"); }

    const bosses = await supabaseQuery(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&name=ilike.${encodeURIComponent("%" + bossName + "%")}`);
    // Activity fallback
    if (!bosses?.length) {
      const activities = await supabaseQuerySafe(`activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&name=ilike.${encodeURIComponent("%" + bossName + "%")}`);
      if (!activities?.length) return reply(`**${bossName}** not found.`);
      const activity = activities[0];

      // Check if activity has a running instance
      const actInstances = await supabaseQuerySafe(`activity_instances?activity_id=eq.${activity.id}&order=start_time.desc&limit=1`);
      const latestInst = actInstances?.[0] ?? null;
      let isRunning = latestInst && latestInst.start_time && !latestInst.end_time;
      const alreadyCompleted = latestInst && latestInst.end_time;

      // For fixed_schedule activities with an existing instance, check if we're in the active window.
      // Without an instance, a newly created activity should NOT be considered "running" from a past slot.
      if (!isRunning && !alreadyCompleted && latestInst && activity.schedule_type === "fixed_schedule" && Array.isArray(activity.schedule)) {
        const actTz = (activity.is_custom || activity.template_id) ? "UTC" : "Asia/Manila";
        const schedule = activity.schedule;
        const now2 = new Date();
        let recentSlot: Date | null = null;
        for (let d = 0; d <= 7; d++) { const check = new Date(now2); check.setDate(check.getDate() - d);
          for (const slot of schedule) { const c = scheduleSlotToUTC(actTz, check, slot.day, slot.time); if (c <= now2 && (!recentSlot || c > recentSlot)) recentSlot = c; }
        }
        if (recentSlot) {
          const nextSlotAfterRecent = findNextScheduleSlot(schedule, new Date(recentSlot.getTime() + 60_000), actTz);
          const maxActiveWindow = Math.min(nextSlotAfterRecent.getTime() - recentSlot.getTime() - 3600_000, 4 * 3600_000);
          const activeUntil = new Date(recentSlot.getTime() + maxActiveWindow);
          isRunning = now2 >= recentSlot && now2 < activeUntil;
        }
      }

      if (!isRunning) {
        await cmdLog(cmd, "fail", `${activity.name} not active`);
        discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("❌")}/@me`, { method: "PUT", headers: { Authorization: `Bot ${TOKEN}` } }).catch(() => {});
        if (alreadyCompleted) {
          return reply(`❌ **${activity.name}** was already completed.${timeStr ? `\n-# Wrong time? Use \`${matchedPrefix}editkilltime ${activity.name} HH:MM\` to fix the start time instead.` : ""}`);
        }
        return reply(`❌ **${activity.name}** is not currently active.${timeStr ? `\n-# Wrong start time? Use \`${matchedPrefix}editkilltime ${activity.name} HH:MM\` to adjust it.` : ""}`);
      }

      let activityTime = new Date();
      if (timeStr) {
        const [h, m] = timeStr.split(":").map(Number);
        if (h > 23 || m > 59) return reply("Invalid time.");
        const tz = await resolveServerTimezone(serverId);
        const now = new Date();
        const localDate = now.toLocaleDateString("en-CA", { timeZone: tz });
        const [y, mo, d] = localDate.split("-").map(Number);
        const testUtc = Date.UTC(y, mo - 1, d, h, m);
        const testLocal = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(testUtc));
        const [tlH, tlM] = testLocal.split(":").map(Number);
        const offsetMs = ((tlH - h) * 60 + (tlM - m)) * 60_000;
        activityTime = new Date(testUtc - offsetMs);
        if (explicitDay === "yesterday") activityTime.setUTCDate(activityTime.getUTCDate() - 1);
        else if (!explicitDay && activityTime > now) activityTime.setUTCDate(activityTime.getUTCDate() - 1);
      }
      if (latestInst) {
        await fetch(`${SUPABASE_URL}/rest/v1/activity_instances?id=eq.${latestInst.id}`, {
          method: "PATCH", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
          body: JSON.stringify({ end_time: activityTime.toISOString() }),
        });
      } else {
        // No instance yet (e.g., fixed_schedule in active window) — create one with start_time too
        // Use the activityTime as both start and end (default: now)
        const startTime = activityTime; // Use same time for both start and end
        await fetch(`${SUPABASE_URL}/rest/v1/activity_instances`, {
          method: "POST", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
          body: JSON.stringify({ activity_id: activity.id, start_time: startTime.toISOString(), end_time: activityTime.toISOString() }),
        });
      }
      if (activity.schedule_type === "one_time") {
        await fetch(`${SUPABASE_URL}/rest/v1/activities?id=eq.${activity.id}`, { method: "PATCH", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" }, body: JSON.stringify({ is_enabled: false }) }).catch((err) => console.error("[bot] Failed to disable one_time activity:", activity.id, err));
      }
      const timeLabel = timeStr ? ` at ${timeStr}` : "";
      // Send notification to notifhere channel
      const activityTimeStr = activityTime.toLocaleString("en-US", { timeZone: (await resolveServerTimezone(serverId)) || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
      const activityKillText = `📋 **${activity.name}** finished by **${author}** ${activityTimeStr}`;
      broadcastNotification(serverId, {}, channelId, activityKillText);
      await reply(`✅ **${activity.name}** completed${timeLabel}`);
      await cmdLog(cmd, "ok", `activity:${activity.name}`);
      return;
    }

    const boss = bosses[0];
    const recentDeaths = await supabaseQuery(`death_records?server_id=eq.${serverId}&boss_id=eq.${boss.id}&order=death_time.desc&limit=1`);
    const overrides2 = await supabaseQuery(`boss_spawn_overrides?server_id=eq.${serverId}&boss_id=eq.${boss.id}&select=death_time&limit=1`);
    const overrideDeathTime = overrides2?.[0]?.death_time ?? null;
    let isAlive = false;
    const tz = await resolveServerTimezone(serverId);
    const aliveNow = new Date();

    if (boss.spawn_type === "fixed_hours") {
      const lastDeathForAlive = recentDeaths?.[0];
      const effectiveDt = overrideDeathTime ?? lastDeathForAlive?.death_time ?? null;
      if (effectiveDt) { const st = new Date(new Date(effectiveDt).getTime() + (boss.respawn_hours ?? 0) * 3600000); isAlive = st <= aliveNow; }
      else isAlive = true;
    } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
      const schedTz = getScheduleTz(boss, tz);
      let recentSlot: Date | null = null;
      for (let d = 0; d <= 7; d++) { const check = new Date(aliveNow); check.setDate(check.getDate() - d);
        for (const slot of boss.schedule) { const c = scheduleSlotToUTC(schedTz, check, slot.day, slot.time); if (c <= aliveNow && (!recentSlot || c > recentSlot)) recentSlot = c; }
      }
      if (recentSlot) {
        const nextSlot = findNextScheduleSlot(boss.schedule, new Date(recentSlot.getTime() + 60_000), schedTz);
        const aliveUntil = new Date(Math.min(nextSlot.getTime() - 3600_000, recentSlot.getTime() + 4 * 3600_000));
        const wasKilled = recentDeaths?.[0] && new Date(recentDeaths[0].death_time) >= recentSlot;
        isAlive = !wasKilled && aliveNow >= recentSlot && aliveNow < aliveUntil;
      }
    }
    if (!isAlive) {
      await cmdLog(cmd, "fail", `${boss.name} not alive`);
      discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("❌")}/@me`, { method: "PUT", headers: { Authorization: `Bot ${TOKEN}` } }).catch(() => {});
      return reply(`❌ **${boss.name}** is not currently alive.${timeStr ? `\n-# Wrong time? Use \`${matchedPrefix}editkilltime ${boss.name} HH:MM\` to fix the previous kill instead.` : ""}`);
    }
    if (recentDeaths?.length && !overrideDeathTime) {
      const lastKill = new Date(recentDeaths[0].death_time);
      const cooldownEnd = new Date(lastKill.getTime() + 2 * 3600_000);
      if (new Date() < cooldownEnd) {
        discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("❌")}/@me`, { method: "PUT", headers: { Authorization: `Bot ${TOKEN}` } }).catch(() => {});
        const killedAt = Math.floor(lastKill.getTime() / 1000);
        return reply(`⏳ **${boss.name}** already declared dead at <t:${killedAt}:t>.${timeStr ? `\n-# Wrong time? Use \`${matchedPrefix}editkilltime ${boss.name} HH:MM\` to fix it.` : ""}`);
      }
    }

    let deathTime = new Date();
    if (timeStr) {
      const [h, m] = timeStr.split(":").map(Number);
      if (h > 23 || m > 59) return reply("Invalid time.");
      const now2 = new Date();
      const localDate = now2.toLocaleDateString("en-CA", { timeZone: tz });
      const [y, mo, d] = localDate.split("-").map(Number);
      const testUtc = Date.UTC(y, mo - 1, d, h, m);
      const testLocal = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(testUtc));
      const [tlH, tlM] = testLocal.split(":").map(Number);
      const offsetMs = ((tlH - h) * 60 + (tlM - m)) * 60_000;
      deathTime = new Date(testUtc - offsetMs);
      if (explicitDay === "yesterday") deathTime.setUTCDate(deathTime.getUTCDate() - 1);
      else if (!explicitDay && deathTime > now2) deathTime.setUTCDate(deathTime.getUTCDate() - 1);
    }

    const serverGuilds = await supabaseQuery(`guilds?server_id=eq.${serverId}`);
    const allBossGuilds = await supabaseQuery(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode`);
    const sgIds = new Set(serverGuilds.map((g: any) => g.id));
    const serverBossGuilds2 = allBossGuilds.filter((bg: any) => sgIds.has(bg.guild_id));
    const prevDeaths = await supabaseQuery(`death_records?server_id=eq.${serverId}&boss_id=eq.${boss.id}&order=death_time.desc&limit=1`);
    const lastDeath2 = prevDeaths?.[0] ?? null;
    const gName = computeOwnerGuild(boss, serverBossGuilds2, serverGuilds, lastDeath2, deathTime, tz);
    const ownerGuildId = gName ? serverGuilds.find((g: any) => g.name === gName)?.id ?? null : null;

    await fetch(`${SUPABASE_URL}/rest/v1/death_records`, {
      method: "POST", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ boss_id: boss.id, server_id: serverId, death_time: deathTime.toISOString(), owner_guild_id: ownerGuildId }),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides?boss_id=eq.${boss.id}&server_id=eq.${serverId}`, { method: "DELETE", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` } }).catch((err) => console.error("[bot] Failed to delete spawn override after kill:", boss.id, serverId, err));
    if (serverBossGuilds2.some((bg: any) => bg.boss_id === boss.id && bg.mode === "rotation")) {
      await fetch(`${SUPABASE_URL}/rest/v1/bosses?id=eq.${boss.id}`, { method: "PATCH", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" }, body: JSON.stringify({ rotation_counter: (boss.rotation_counter ?? 0) + 1 }) });
    }

    const guildName = ownerGuildId ? serverGuilds.find((g: any) => g.id === ownerGuildId)?.name ?? "" : "";
    let nextSpawnUnix = 0;
    if (boss.spawn_type === "fixed_hours") nextSpawnUnix = Math.floor((deathTime.getTime() + (boss.respawn_hours ?? 0) * 3600_000) / 1000);
    else if (boss.spawn_type === "fixed_schedule" && boss.schedule) { const schedTz3 = getScheduleTz(boss, tz); const ns = findNextScheduleSlot(boss.schedule, deathTime, schedTz3); nextSpawnUnix = Math.floor(ns.getTime() / 1000); }
    const nextSpawnField = nextSpawnUnix > 0 ? { name: "Next Spawn", value: `<t:${nextSpawnUnix}:f>`, inline: true } : null;
    const deathTimeStr = deathTime.toLocaleString("en-US", { timeZone: tz || "Asia/Manila", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    const killText = `💀 **${boss.name}** killed by **${guildName || author}** ${deathTimeStr}`;
    broadcastNotification(serverId, {}, channelId, killText);
    const unix = Math.floor(deathTime.getTime() / 1000);
    const replyFields: any[] = [{ name: "Death Time", value: `<t:${unix}:f>`, inline: true }, { name: "Recorded By", value: author, inline: true }];
    if (nextSpawnField) replyFields.push(nextSpawnField);
    await cmdLog(cmd, "ok", `${boss.name} → ${guildName || "unknown"}`);
    return replyEmbed(`☠️ ${boss.name} Killed by ${guildName || author}`, timeStr ? `Wrong time? Use \`${matchedPrefix}editkilltime ${boss.name} HH:MM\` to fix it.` : "", 0xef4444, replyFields);
  }

  // ── editkilltime <boss|activity> HH:MM [YYYY-MM-DD] ──
  if (cmd === "editkilltime") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }
    const remaining = args.slice(1);
    const timeStr = remaining[remaining.length - 1];
    if (!timeStr || !/^\d{1,2}:\d{2}$/.test(timeStr)) { await cmdLog(cmd, "fail", "no HH:MM"); return reply("Usage: `!editkilltime Boss/Activity HH:MM [YYYY-MM-DD]`"); }
    remaining.pop();

    let explicitDate: string | null = null;
    const maybeDate = remaining[remaining.length - 1];
    if (maybeDate && /^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) {
      explicitDate = maybeDate;
      remaining.pop();
    }

    const targetName = remaining.join(" ");
    if (!targetName) { await cmdLog(cmd, "fail", "no name"); return reply("Usage: `!editkilltime Boss/Activity HH:MM [YYYY-MM-DD]`"); }

    const [h, m] = timeStr.split(":").map(Number);
    const tz = await resolveServerTimezone(serverId);
    const now = new Date();
    const localDate = explicitDate || now.toLocaleDateString("en-CA", { timeZone: tz });
    const [y, mo, d] = localDate.split("-").map(Number);
    const testUtc = Date.UTC(y, mo - 1, d, h, m);
    const testLocal = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(testUtc));
    const [tlH, tlM] = testLocal.split(":").map(Number);
    const offsetMs = ((tlH - h) * 60 + (tlM - m)) * 60_000;
    const newDeathTime = new Date(testUtc - offsetMs);
    if (!explicitDate && newDeathTime > now) newDeathTime.setUTCDate(newDeathTime.getUTCDate() - 1);

    // Try bosses first
    const bosses = await supabaseQuery(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&name=ilike.${encodeURIComponent("%" + targetName + "%")}`);
    if (bosses?.length) {
      const boss = bosses[0];

    // Find the most recent death record for this boss
    const recentDeaths = await supabaseQuery(`death_records?server_id=eq.${serverId}&boss_id=eq.${boss.id}&order=death_time.desc&limit=1`);
    if (!recentDeaths?.length) { await cmdLog(cmd, "fail", `no death record for ${boss.name}`); return reply(`No death record found for **${boss.name}**.`); }
    const deathRecord = recentDeaths[0];

    // Recalculate owner guild with the new time (using top-level newDeathTime from lines 628-638)
    const serverGuilds = await supabaseQuery(`guilds?server_id=eq.${serverId}`);
    const allBossGuilds = await supabaseQuery(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode`);
    const sgIds = new Set(serverGuilds.map((g: any) => g.id));
    const serverBossGuilds = allBossGuilds.filter((bg: any) => sgIds.has(bg.guild_id));
    const prevDeaths = await supabaseQuery(`death_records?server_id=eq.${serverId}&boss_id=eq.${boss.id}&order=death_time.desc&limit=2`);
    const lastDeath = prevDeaths?.length > 1 ? prevDeaths[1] : null;
    const gName = computeOwnerGuild(boss, serverBossGuilds, serverGuilds, lastDeath, newDeathTime, tz);
    const ownerGuildId = gName ? serverGuilds.find((g: any) => g.name === gName)?.id ?? null : null;

    // Update the death record
    await fetch(`${SUPABASE_URL}/rest/v1/death_records?id=eq.${deathRecord.id}`, {
      method: "PATCH", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
      body: JSON.stringify({ death_time: newDeathTime.toISOString(), owner_guild_id: ownerGuildId }),
    });

    // Also update spawn override if one exists
    const overrides = await supabaseQuery(`boss_spawn_overrides?server_id=eq.${serverId}&boss_id=eq.${boss.id}&select=id`);
    if (overrides?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/boss_spawn_overrides?id=eq.${overrides[0].id}`, {
        method: "PATCH", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
        body: JSON.stringify({ death_time: newDeathTime.toISOString() }),
      });
    }

    // Recalculate next spawn
    let nextSpawnUnix = 0;
    if (boss.spawn_type === "fixed_hours") nextSpawnUnix = Math.floor((newDeathTime.getTime() + (boss.respawn_hours ?? 0) * 3600_000) / 1000);
    else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
      const schedTz = getScheduleTz(boss, tz);
      const ns = findNextScheduleSlot(boss.schedule, newDeathTime, schedTz);
      nextSpawnUnix = Math.floor(ns.getTime() / 1000);
    }

    const guildName = ownerGuildId ? serverGuilds.find((g: any) => g.id === ownerGuildId)?.name ?? "" : "";
    const unix = Math.floor(newDeathTime.getTime() / 1000);
    const replyFields: any[] = [
      { name: "Updated Death Time", value: `<t:${unix}:f>`, inline: true },
      { name: "Killed By", value: guildName || "Unknown", inline: true },
    ];
    if (nextSpawnUnix > 0) replyFields.push({ name: "Next Spawn", value: `<t:${nextSpawnUnix}:f>`, inline: true });
    await cmdLog(cmd, "ok", `${boss.name} → ${timeStr}`);
    return replyEmbed(`✏️ ${boss.name} Kill Time Updated`, `Time changed to **${timeStr}**`, 0x3b82f6, replyFields);
  }

    // Activity fallback — update the latest instance
    const activities = await supabaseQuery(`activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&name=ilike.${encodeURIComponent("%" + targetName + "%")}`);
    if (!activities?.length) { await cmdLog(cmd, "fail", `"${targetName}" not found`); return reply(`**${targetName}** not found.`); }
    const act = activities[0];
    const instances = await supabaseQuery(`activity_instances?activity_id=eq.${act.id}&order=start_time.desc&limit=1`);
    if (!instances?.length) { await cmdLog(cmd, "fail", `no instance for ${act.name}`); return reply(`No activity instance found for **${act.name}**.`); }
    const inst = instances[0];
    const instId = inst.id;

    await fetch(`${SUPABASE_URL}/rest/v1/activity_instances?id=eq.${instId}`, {
      method: "PATCH", headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
      body: JSON.stringify({ start_time: newDeathTime.toISOString(), end_time: newDeathTime.toISOString() }),
    });
    await cmdLog(cmd, "ok", `${act.name} → ${timeStr}`);
    return replyEmbed(`✏️ ${act.name} Time Updated`, `Time changed to **${timeStr}**`, 0x3b82f6, []);
  }

  // ── ping (debug) ──
  if (cmd === "ping") {
    return reply(`🏓 Pong! Server: ${serverId || "not linked"}, Guild: ${guildId}, Prefix: ${matchedPrefix}, Channel: ${channelId}, Bot v0.14.2-debug`);
  }

  // ── updatestats <PlayerName> <CP> ──
  if (cmd === "updatestats") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }
    const remaining = args.slice(1);
    // Last arg should be a number (CP value) — strip commas and support k suffix
    const maybeCp = remaining[remaining.length - 1];
    const rawCp = maybeCp.replace(/,/g, "").trim();
    let cpValue: number;
    if (/^\d+k$/i.test(rawCp)) {
      cpValue = parseInt(rawCp.replace(/k/i, ""), 10) * 1000;
    } else {
      cpValue = parseInt(rawCp, 10);
    }
    if (isNaN(cpValue) || cpValue <= 0) {
      await cmdLog(cmd, "fail", "invalid CP");
      return reply("Usage: `!updatestats PlayerName CP`\nExample: `!updatestats PressX 113021`\nAttach a screenshot as proof.");
    }
    remaining.pop();
    const playerName = remaining.join(" ").trim();
    if (!playerName) {
      await cmdLog(cmd, "fail", "no player name");
      return reply("Usage: `!updatestats PlayerName CP`\nExample: `!updatestats PressX 113021`");
    }

    // Get screenshot URL from attachments
    const screenshotUrl = msg.attachments?.length > 0 ? msg.attachments[0].url : null;

    try {
      // Find or create member first to get member_id
      let memberId: string | null = null;
      let oldCp: number | null = null;
      let resolvedName = playerName;
      let memberSlug: string | undefined;
      let viewerKey: string | null = null;

      // Fetch viewer key for the server (for public profile links)
      try {
        const vkRes = await supabaseQuerySafe(`servers?id=eq.${serverId}&select=viewer_key`);
        if (vkRes?.[0]?.viewer_key) viewerKey = vkRes[0].viewer_key;
      } catch { /* ignore */ }

      // Try exact match first (case-insensitive)
      let memberRows = await supabaseQuerySafe(
        `members?server_id=eq.${serverId}&name=ilike.${encodeURIComponent(playerName)}&select=id,name,combat_power,public_slug`
      );
      console.log(`[bot] updatestats exact lookup: serverId=${serverId}, name=${playerName}, found=${memberRows?.length || 0}`);

      // If no exact match, try partial match
      if (!memberRows?.length) {
        memberRows = await supabaseQuerySafe(
          `members?server_id=eq.${serverId}&name=ilike.${encodeURIComponent("%" + playerName + "%")}&select=id,name,combat_power,public_slug&order=name&limit=26`
        );
        console.log(`[bot] updatestats partial lookup: serverId=${serverId}, name=${playerName}, found=${memberRows?.length || 0}`);
      }

      if (memberRows?.length === 1) {
        memberId = memberRows[0].id;
        oldCp = memberRows[0].combat_power ?? null;
        resolvedName = memberRows[0].name;
        const memberSlug = memberRows[0].public_slug as string | undefined;
        // Update member's combat_power
        await fetch(`${SUPABASE_URL}/rest/v1/members?id=eq.${memberId}`, {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_KEY!,
            Authorization: `Bearer ${SUPABASE_KEY!}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            combat_power: cpValue,
            discord_user_id: msg.author?.id || null,
          }),
        });
      } else if (memberRows && memberRows.length > 1 && memberRows.length <= 25) {
        // Multiple matches — ask user to clarify
        const names = memberRows.map((r: any) => `• **${r.name}** (${r.combat_power != null ? r.combat_power.toLocaleString() + " CP" : "no CP"})`).join("\n");
        await cmdLog(cmd, "fail", "ambiguous name");
        return reply(`⚠️ Multiple members match **"${playerName}"**:\n${names}\n\nPlease be more specific, e.g. \`!updatestats ${memberRows[0].name} ${cpValue.toLocaleString()}\``);
      } else if (memberRows && memberRows.length > 25) {
        await cmdLog(cmd, "fail", "too many matches");
        return reply(`⚠️ Too many members match **"${playerName}"** (${memberRows.length} found). Please be more specific.`);
      } else {
        // No match — auto-create member with the given name
        const createRes = await fetch(`${SUPABASE_URL}/rest/v1/members`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY!,
            Authorization: `Bearer ${SUPABASE_KEY!}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            name: playerName,
            server_id: serverId,
            combat_power: cpValue,
            discord_user_id: msg.author?.id || null,
          }),
        });
        if (createRes.ok) {
          const created = await createRes.json() as any[];
          if (created?.length) { memberId = created[0].id; resolvedName = created[0].name; memberSlug = created[0].public_slug; }
        } else {
          console.error("[bot] updatestats auto-create failed:", createRes.status, await createRes.text().catch(() => ""));
        }
      }

      if (!memberId) {
        await cmdLog(cmd, "fail", "could not find/create member");
        return reply(`❌ Could not find or create member **${playerName}**.`);
      }

      // Submit CP update via REST API (service_role) with member_id
      const body: any = {
        server_id: serverId,
        member_id: memberId,
        player_name: resolvedName,
        old_cp: oldCp,
        new_cp: cpValue,
        discord_user_id: msg.author?.id || null,
        discord_username: msg.author?.username || author,
        discord_message_id: msg.id,
        submitted_at: msg.timestamp || new Date().toISOString(), // Discord timestamp is UTC
        status: "approved",
      };
      if (screenshotUrl) body.screenshot_url = screenshotUrl;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/cp_updates`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY!,
          Authorization: `Bearer ${SUPABASE_KEY!}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(body),
      });
      console.log(`[bot] updatestats cp_updates insert: memberId=${memberId}, cp=${cpValue}, status=${res.status}`);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("[bot] updatestats insert failed:", res.status, errText);
        await cmdLog(cmd, "fail", `DB error ${res.status}`);
        discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("❌")}/@me`, {
          method: "PUT", headers: { Authorization: `Bot ${TOKEN}` },
        }).catch(() => {});
        return reply(`❌ Failed to update stats for **${resolvedName}**. Please try again.`);
      }

      const screenshotNote = screenshotUrl ? " 📸 Screenshot saved." : "";
      const memberPath = memberSlug ? `/m/${memberSlug}` : `/members/${memberId}`;
      const profileUrl = viewerKey
        ? `${SITE_URL}/view/${viewerKey}?redirect=${encodeURIComponent(memberPath)}`
        : `${SITE_URL}${memberPath}`;
      const profileLink = `🔗 Click here to check your member page on RaidScout: <${profileUrl}>`;
      await cmdLog(cmd, "ok", `${resolvedName} → ${cpValue.toLocaleString()} CP`);
      return reply(`✅ **${resolvedName}** CP updated to **${cpValue.toLocaleString()}**.${screenshotNote}\n${profileLink}`);
    } catch (err: any) {
      console.error("[bot] updatestats error:", err);
      await cmdLog(cmd, "fail", err.message);
      return reply(`❌ Error updating **${playerName}**: ${err.message}`);
    }
  }
}
