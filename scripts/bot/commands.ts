// @ts-nocheck
// Command handler -- all Discord chat commands

import { TOKEN, SUPABASE_URL, SUPABASE_KEY, SITE_URL, botUserId } from "./config";
import { discordFetch } from "./discord-api";
import { supabaseQuery, supabaseQuerySafe, supabaseRpc, logError } from "./supabase";
import { writeBotAudit } from "./supabase";
import { getGuildPrefixes, resolveServerId, resolveServerTimezone, bustPrefixCache } from "./server-cache";
import { addHours, computeOwnerGuild, getScheduleTz, scheduleSlotToUTC, findNextScheduleSlot } from "./spawn-utils";
import { fetchPartyList } from "./party-utils";
import { broadcastNotification } from "./notifications";

export async function handleMessage(msg: any) {
  const content: string = msg.content?.trim() ?? "";
  const channelId: string = msg.channel_id;
  const guildId: string = msg.guild_id;
  const author: string = msg.author?.username ?? "unknown";

  try {

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

  // Subscription expiry check — block commands if trial + subscription both expired
  if (serverId) {
    try {
      const srvRows = await supabaseQuerySafe(`servers?id=eq.${serverId}&select=trial_ends_at,subscription_ends_at`);
      const srv = srvRows?.[0];
      if (srv) {
        const now = new Date();
        const trialEnd = srv.trial_ends_at ? new Date(srv.trial_ends_at) : null;
        const subEnd = srv.subscription_ends_at ? new Date(srv.subscription_ends_at) : null;
        // Active subscription overrides trial. Both expired = locked.
        const isExpired = !(subEnd && subEnd > now) && !(trialEnd && trialEnd > now);
        if (isExpired && cmd && !["help","commands","notifhere","cmdhere","threadhere","progresshere"].includes(cmd)) {
          await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ content: "⏰ This server's RaidScout access has expired. The owner needs to extend access to restore bot commands.\n🔗 https://www.raidscout.com" }),
          });
          return;
        }
      }
    } catch (err) { console.error("[bot] subscription check failed:", err); }
  }

  // ✅ reaction
  const validCmds = new Set(["list","nextspawn","spawn","killed","kill","editkilltime","forcespawn","forcespawnall","spawnall","commands","help","notifhere","cmdhere","threadhere","progresshere","party","updatestats","editstats","ping"]);
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
      // Check if this is a thread inside the command channel
      let isCmdThread = false;
      try {
        const chanRes = await discordFetch(`https://discord.com/api/v10/channels/${channelId}`, {
          headers: { Authorization: `Bot ${TOKEN}` },
        });
        if (chanRes?.ok) {
          const chanInfo = await chanRes.json() as any;
          if (chanInfo.parent_id === cmdChannel) isCmdThread = true;
        }
      } catch {}
      if (!isCmdThread) {
      // Also allow progress-related commands in the progress channel
      const progressCmds = new Set(["updatestats", "editstats"]);
      if (progressCmds.has(cmd)) {
        const progRows = await supabaseQuerySafe(`discord_configs?discord_guild_id=eq.${guildId}&command_prefix=eq.${encodeURIComponent(matchedPrefix)}&select=progress_channel_id`);
        const progChannel = progRows?.[0]?.progress_channel_id;
        if (!progChannel) {
          return reply("⚠️ No progress channel configured. Use `!progresshere` in a channel to set it, then `!updatestats` and `!editstats` will work there.");
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
      } // close if (!isCmdThread)
    }
  }

  async function reply(text: string) {
    try {
      await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
    } catch (err: any) {
      logError("cmd", "reply failed", err, { channelId: channelId?.slice(0, 8), text: text?.slice(0, 50) });
    }
    await cmdLog(cmd, "ok").catch(() => {});
  }

  async function replyEmbed(title: string, desc: string, color: number, fields?: any[]) {
    try {
      const res = await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [{ title, description: desc, color, fields, footer: { text: "Powered by RaidScout" } }] }),
      });
      if (!res.ok) logError("cmd", `replyEmbed HTTP ${res.status}`, await res.text().catch(() => ""));
    } catch (err: any) {
      logError("cmd", "replyEmbed failed", err, { channelId: channelId?.slice(0, 8), title });
    }
    await cmdLog(cmd, "ok").catch(() => {});
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
    writeBotAudit({ action: "settings_update", server_id: serverId, discord_user: author, details: { setting: "notification_channel" } });
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
    writeBotAudit({ action: "settings_update", server_id: serverId, discord_user: author, details: { setting: "command_channel" } });
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
    writeBotAudit({ action: "settings_update", server_id: serverId, discord_user: author, details: { setting: "progress_channel" } });
      return reply("✅ Progress reports, `!updatestats` and `!editstats` commands will now work in this channel. Use the **Demand Update** button on RaidScout to create progress threads here.");
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
    writeBotAudit({ action: "settings_update", server_id: serverId, discord_user: author, details: { setting: "thread_channel" } });
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
      name: `${p.name} (${p.members.length})`, value: p.members.join("\n") || "_No members_", inline: true
    }));

    // Split fields across multiple embeds if they exceed Discord limits (25 fields or 6000 chars)
    const embeds: any[] = [];
    let currentFields: any[] = [];
    let totalChars = 0;
    for (const f of fields) {
      const fieldChars = f.name.length + f.value.length;
      if (currentFields.length >= 25 || totalChars + fieldChars > 6000) {
        embeds.push({ title: `📋 Party Setup -- ${targetLabel}${embeds.length > 0 ? ` (cont.)` : ""}`, fields: currentFields, color: 0x8b5cf6, footer: embeds.length === 0 ? { text: "Powered by RaidScout" } : undefined });
        currentFields = [];
        totalChars = 0;
      }
      currentFields.push(f);
      totalChars += fieldChars;
    }
    if (currentFields.length > 0) {
      embeds.push({ title: `📋 Party Setup -- ${targetLabel}${embeds.length > 0 ? ` (cont.)` : ""}`, fields: currentFields, color: 0x8b5cf6, footer: embeds.length === 0 ? { text: "Powered by RaidScout" } : undefined });
    }

    await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds }),
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
      writeBotAudit({ action: "force_spawn", server_id: serverId, discord_user: author, target_id: boss.id, details: { boss_name: boss.name } });
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
    writeBotAudit({ action: "force_spawn", server_id: serverId, discord_user: author, target_id: act.id, details: { activity_name: act.name } }).catch(() => {});
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
    writeBotAudit({ action: "force_spawn", server_id: serverId, discord_user: author, details: { boss_count: count } });
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
      { name: `${p}progresshere${aliasNote("progresshere")}`, value: "Set progress report, !updatestats & !editstats channel", inline: false },
      { name: `${p}updatestats <Player> <CP>`, value: "Submit a CP update with screenshot", inline: false },
      { name: `${p}editstats <Player> <CP>`, value: "Edit your last CP entry (requires new screenshot)", inline: false },
      { name: `${p}threadhere${aliasNote("threadhere")}`, value: "Set auto-thread channel", inline: false },
      { name: `${p}forcespawn <boss>`, value: "Force a boss to spawn", inline: false },
      { name: `${p}party <boss/activity>`, value: "Show party members for a boss/activity", inline: false },
    ]);
  }

  // ── nextspawn [boss|guild] ──
  if (cmd === "nextspawn" || cmd === "spawn") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }
    const filter = args[1];

    // Use bulk RPC — replaces 6+ REST queries
    let snap: any;
    try {
      snap = await supabaseRpc("bot_server_snapshot", { p_server_id: serverId });
    } catch { snap = null; }

    let tz: string, bosses: any[], guilds: any[], serverBossGuilds: any[], activities: any[], activityGuilds: any[];
    if (snap) {
      tz = snap.timezone || "Asia/Manila";
      bosses = snap.bosses || [];
      guilds = snap.guilds || [];
      serverBossGuilds = snap.boss_guilds || [];
      activities = snap.activities || [];
      activityGuilds = snap.activity_guilds || [];
    } else {
      // REST fallback
      tz = await resolveServerTimezone(serverId);
      bosses = await supabaseQuerySafe(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&order=name`);
      guilds = await supabaseQuerySafe(`guilds?server_id=eq.${serverId}`);
      const allBossGuilds = await supabaseQuerySafe(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode`);
      const serverGuildIds = new Set((guilds || []).map((g: any) => g.id));
      serverBossGuilds = (allBossGuilds || []).filter((bg: any) => serverGuildIds.has(bg.guild_id));
      activities = await supabaseQuerySafe(`activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null`);
      const allActivityGuilds = await supabaseQuerySafe(`activity_guilds?select=activity_id,guild_id,sort_order,day_of_week,mode`);
      activityGuilds = (allActivityGuilds || []).filter((ag: any) => serverGuildIds.has(ag.guild_id));
    }

    const filterGuild = filter ? guilds.find((g: any) => g.name.toLowerCase() === filter.toLowerCase()) : null;
    const now = new Date();
    const cutoff = addHours(now, 24);
    const upcoming: { name: string; time: string; unix: number; guild: string; isActivity?: boolean }[] = [];

    // ── Boss spawns via RPC (fast, pre-computed in SQL) ──
    const bossMap = new Map((bosses || []).map((b: any) => [b.id, b]));
    let spawnRows: any[] = [];
    try { spawnRows = await supabaseRpc("bot_next_spawns", { p_server_id: serverId, p_tz: tz }) || []; } catch { /* fallback below */ }

    if (spawnRows.length > 0) {
      // Fetch death records for accurate guild computation (rotation/daily modes need lastDeath)
      const deaths = await supabaseQuerySafe(`death_records?server_id=eq.${serverId}&is_initial_spawn=is.false&order=death_time.desc&limit=200`);
      const lastDeathMap = new Map<string, any>();
      for (const d of (deaths || [])) {
        if (!lastDeathMap.has(d.boss_id)) lastDeathMap.set(d.boss_id, d);
      }

      for (const row of spawnRows) {
        const boss = bossMap.get(row.boss_id);
        if (!boss) continue;
        const spawnTime = new Date(row.spawn_time);
        const unix = Math.floor(spawnTime.getTime() / 1000);
        const lastDeath = lastDeathMap.get(row.boss_id) ?? null;
        const gName = computeOwnerGuild(boss, serverBossGuilds, guilds, lastDeath, spawnTime, tz) || "";

        if (filter) {
          const nameMatch = row.boss_name.toLowerCase().includes(filter.toLowerCase());
          const guildMatch = filterGuild && gName.toLowerCase() === filterGuild.name.toLowerCase();
          if (!nameMatch && !guildMatch) continue;
        }

        upcoming.push({
          name: row.boss_name,
          time: row.is_alive ? "**ALIVE NOW**" : `<t:${unix}:t>`,
          unix,
          guild: gName,
        });
      }
    } else {
      // JS fallback — fetch deaths + overrides and compute spawns the old way
      const deaths = await supabaseQuerySafe(`death_records?server_id=eq.${serverId}&is_initial_spawn=is.false&order=death_time.desc&limit=200`);
      const overrides = await supabaseQuerySafe(`boss_spawn_overrides?server_id=eq.${serverId}&select=boss_id,death_time`);
      const overrideMap = new Map((overrides || []).map((o: any) => [o.boss_id, o.death_time]));

      for (const boss of bosses) {
        if (filter && !boss.name.toLowerCase().includes(filter.toLowerCase())) {
          if (!filterGuild) continue;
          const lastDeath = (deaths || []).filter((d: any) => d.boss_id === boss.id && !d.is_initial_spawn).sort((a: any, b: any) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];
          const gName = computeOwnerGuild(boss, serverBossGuilds, guilds, lastDeath, now, tz) || "";
          if (gName.toLowerCase() !== filterGuild.name.toLowerCase()) continue;
        }
        const lastDeath = (deaths || []).filter((d: any) => d.boss_id === boss.id && !d.is_initial_spawn).sort((a: any, b: any) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];
        let spawn: Date;
        if (boss.spawn_type === "fixed_hours") {
          const overrideDeathTime = overrideMap.get(boss.id);
          const effectiveDeathTime = overrideDeathTime ?? lastDeath?.death_time ?? null;
          if (effectiveDeathTime) {
            spawn = addHours(new Date(effectiveDeathTime), boss.respawn_hours ?? 0);
            if (spawn <= now) spawn = now;
          } else {
            const utcStart = (boss.schedule && typeof boss.schedule === "object" && !Array.isArray(boss.schedule) && boss.schedule.utc_start)
              ? boss.schedule.utc_start : null;
            spawn = utcStart ? new Date(utcStart) : now;
            if (spawn <= now) spawn = now;
          }
        } else if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
          const schedTz = getScheduleTz(boss, tz);
          if (lastDeath) {
            let recentTime: Date | null = null;
            for (let d = 0; d <= 7; d++) { const check = new Date(now); check.setDate(check.getDate() - d);
              for (const slot of boss.schedule) { const c = scheduleSlotToUTC(schedTz, check, slot.day, slot.time); if (c <= now && (!recentTime || c > recentTime)) recentTime = c; }
            }
            if (recentTime) {
              const nextSlotTime = findNextScheduleSlot(boss.schedule, new Date(recentTime.getTime() + 60_000), schedTz);
              const aliveUntil = new Date(Math.min(nextSlotTime.getTime() - 3600_000, recentTime.getTime() + 24 * 3600_000));
              const wasKilled = new Date(lastDeath.death_time) >= recentTime;
              spawn = (!wasKilled && now >= recentTime && now < aliveUntil) ? now : findNextScheduleSlot(boss.schedule, now, schedTz);
            } else { spawn = findNextScheduleSlot(boss.schedule, now, schedTz); }
          } else { spawn = findNextScheduleSlot(boss.schedule, now, schedTz); }
        } else continue;
        if (spawn.getTime() <= cutoff.getTime() || filter) {
          const gName = computeOwnerGuild(boss, serverBossGuilds, guilds, lastDeath, spawn, tz) || "";
          const unix = Math.floor(spawn.getTime() / 1000);
          upcoming.push({ name: boss.name, time: spawn <= now ? "**ALIVE NOW**" : `<t:${unix}:t>`, unix, guild: gName });
        }
      }
    }
    // ── Activities (within 24h cutoff, merged and sorted with bosses) ──
    let activityInstances: any[] = [];
    if (activities?.length) {
      const actIds = activities.map((a: any) => a.id);
      const batchSize = 100;
      for (let i = 0; i < actIds.length; i += batchSize) {
        const batch = actIds.slice(i, i + batchSize).map((id: string) => `"${id}"`).join(",");
        const batchData = await supabaseQuerySafe(`activity_instances?activity_id=in.(${batch})&order=start_time.desc&limit=500`);
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
        const actTz = "UTC";
        // Only check active window if there's an instance (activity was actually started before)
        if (lastInst) {
          let recentSlot: Date | null = null;
          for (let d = 0; d <= 7; d++) { const check = new Date(now); check.setDate(check.getDate() - d);
            for (const slot of raw) { const c = scheduleSlotToUTC(actTz, check, slot.day, slot.time); if (c <= now && (!recentSlot || c > recentSlot)) recentSlot = c; }
          }
          if (recentSlot) {
            const nextSlotAfterRecent = findNextScheduleSlot(raw, new Date(recentSlot.getTime() + 60_000), actTz);
            const maxActiveWindow = Math.min(nextSlotAfterRecent.getTime() - recentSlot.getTime() - 3600_000, 24 * 3600_000);
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
          // Match website logic (activityCalculator.ts):
          // - Started but not finished → stay on current occurrence
          // - Finished → advance from end_time by recurrence
          // - Never started → use original start time (don't auto-advance)
          if (!lastInst?.end_time && lastInst?.start_time && recurMs > 0) {
            // Started but never finished — stay on the current occurrence
            startTime = new Date(lastInst.start_time);
          } else if (lastInst?.end_time && recurMs > 0 && act.schedule_type === "fixed_hours") {
            // Finished — advance from end_time by recurrence
            const baseTime = new Date(lastInst.end_time);
            const elapsed = now.getTime() - baseTime.getTime();
            const intervals = Math.max(1, Math.ceil(elapsed / recurMs));
            startTime = new Date(baseTime.getTime() + intervals * recurMs);
            if (startTime.getTime() <= now.getTime()) startTime = new Date(startTime.getTime() + recurMs);
          }
          // Otherwise: use original start time as-is (may be in past = ACTIVE NOW, or future = countdown)
        }
      }
      if (startTime && (startTime.getTime() <= cutoff.getTime() || filter)) {
        const unix = Math.floor(startTime.getTime() / 1000);
        // Compute guild for activity based on rotation mode (match website)
        const actGuilds = activityGuilds
          .filter((ag: any) => ag.activity_id === act.id)
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        let actGuildName = "";
        if (actGuilds.length > 0) {
          const mode = actGuilds[0].mode;
          if (mode === "all") {
            actGuildName = "All Guilds";
          } else if (mode === "schedule") {
            const dow = new Date().getDay();
            const match = actGuilds.find((ag: any) => ag.day_of_week === dow);
            actGuildName = match ? (guilds.find((g: any) => g.id === match.guild_id)?.name || "") : "";
          } else if (mode === "daily") {
            const dayIndex = Math.floor(Date.now() / 86400000);
            const idx = ((dayIndex % actGuilds.length) + actGuilds.length) % actGuilds.length;
            actGuildName = guilds.find((g: any) => g.id === actGuilds[idx].guild_id)?.name || "";
          } else {
            // rotation mode: current guild based on instance count
            const instanceCount = activityInstances.filter((ai: any) => ai.activity_id === act.id && ai.end_time).length;
            const idx = ((instanceCount % actGuilds.length) + actGuilds.length) % actGuilds.length;
            actGuildName = guilds.find((g: any) => g.id === actGuilds[idx].guild_id)?.name || "";
          }
        }
        upcoming.push({
          name: act.name,
          time: startTime <= now ? "**ACTIVE NOW**" : `<t:${unix}:t>`,
          unix,
          guild: actGuildName,
          isActivity: true,
        });
      }
    }

    if (upcoming.length === 0) {
      if (filter) await cmdLog(cmd, "fail", `no spawns for "${filter}"`); else await cmdLog(cmd, "fail", "no spawns in 24h");
      return reply(filter ? `No spawn data for **${filter}**.` : "No bosses spawning in 24h.");
    }
    upcoming.sort((a, b) => {
      const aNow = a.time === "**ALIVE NOW**" || a.time === "**ACTIVE NOW**";
      const bNow = b.time === "**ALIVE NOW**" || b.time === "**ACTIVE NOW**";
      if (aNow && !bNow) return -1;
      if (bNow && !aNow) return 1;
      return a.unix - b.unix;
    });

    // ── Group by day with relative labels (in server timezone) ──
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    function dayLabel(unix: number): string {
      const toServerDate = (ts: number) =>
        new Date(ts).toLocaleDateString("en-CA", { timeZone: tz }); // "YYYY-MM-DD"
      const nowDate = toServerDate(Date.now());
      const spawnDate = toServerDate(unix * 1000);
      const [sy, sm, sd] = spawnDate.split("-").map(Number);
      const [ny, nm, nd] = nowDate.split("-").map(Number);
      const spawnMidnight = Date.UTC(sy, sm - 1, sd);
      const nowMidnight = Date.UTC(ny, nm - 1, nd);
      const tomorrowMidnight = Date.UTC(ny, nm - 1, nd + 1);
      const dow = new Date(unix * 1000).toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
      if (spawnMidnight === nowMidnight) return `📅 Today (${monthNames[sm - 1]} ${sd})`;
      if (spawnMidnight === tomorrowMidnight) return `📅 Tomorrow (${monthNames[sm - 1]} ${sd})`;
      return `📅 ${dow} ${monthNames[sm - 1]} ${sd}`;
    }

    const groups: { label: string; items: typeof upcoming }[] = [];
    for (const b of upcoming) {
      const label = dayLabel(b.unix);
      let group = groups.find(g => g.label === label);
      if (!group) { group = { label, items: [] }; groups.push(group); }
      group.items.push(b);
    }

    let globalIdx = 1;
    const lines: string[] = [];
    for (const group of groups) {
      lines.push("");
      lines.push(group.label);
      for (const b of group.items) {
        const timeDisplay = b.time === "**ALIVE NOW**" || b.time === "**ACTIVE NOW**" ? (b.time === "**ACTIVE NOW**" ? "Active now" : "Alive now") : `<t:${b.unix}:t>`;
        const relative = b.time === "**ALIVE NOW**" || b.time === "**ACTIVE NOW**" ? "" : ` (<t:${b.unix}:R>)`;
        const guild = b.guild ? ` -- ${b.guild}` : "";
        const prefix = b.time === "**ALIVE NOW**" ? "🟢 " : "";
        lines.push(`${globalIdx}. ${prefix}**${b.name}**${guild} -- ${timeDisplay}${relative}`);
        globalIdx++;
      }
    }
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
      let alreadyCompleted = false;

      // For fixed_schedule activities: check if we're within a new active window.
      if (activity.schedule_type === "fixed_schedule" && Array.isArray(activity.schedule)) {
        const actTz = "UTC";
        const schedule = activity.schedule;
        const now2 = new Date();
        let recentSlot: Date | null = null;
        for (let d = 0; d <= 7; d++) { const check = new Date(now2); check.setDate(check.getDate() - d);
          for (const slot of schedule) { const c = scheduleSlotToUTC(actTz, check, slot.day, slot.time); if (c <= now2 && (!recentSlot || c > recentSlot)) recentSlot = c; }
        }
        if (recentSlot) {
          const nextSlotAfterRecent = findNextScheduleSlot(schedule, new Date(recentSlot.getTime() + 60_000), actTz);
          const maxActiveWindow = Math.min(nextSlotAfterRecent.getTime() - recentSlot.getTime() - 3600_000, 24 * 3600_000);
          const activeUntil = new Date(recentSlot.getTime() + maxActiveWindow);
          const inWindow = now2 >= recentSlot && now2 < activeUntil;

          // Recurring activities: if a new schedule window has opened since the last completion,
          // the activity is active again (not "already completed").
          if (activity.schedule_type !== "one_time" && latestInst?.end_time && new Date(latestInst.end_time) < recentSlot) {
            // New window opened after last completion — activity is running again
            isRunning = inWindow;
            alreadyCompleted = false;
          } else if (!isRunning) {
            isRunning = inWindow;
            alreadyCompleted = !!(latestInst?.end_time);
          }
        }
      } else {
        // Non-schedule activities (one_time, fixed_hours): check schedule-based active window
        alreadyCompleted = !!(latestInst?.end_time);
        if (!isRunning) {
          // Compute start time from schedule to check if activity should be active
          const raw = activity.schedule;
          const schedObj = (typeof raw === "object" && raw !== null && !Array.isArray(raw)) ? raw as { time: string; start_date?: string; utc_start?: string } : null;
          const utcStart = schedObj?.utc_start ?? null;
          const timeStr2 = schedObj?.time ?? (typeof raw === "string" ? raw : null);
          let computedStart: Date | null = null;
          const tz = await resolveServerTimezone(serverId);
          const now2 = new Date();
          if (utcStart) {
            computedStart = new Date(utcStart);
          } else if (timeStr2) {
            const [h, m] = timeStr2.split(":").map(Number);
            const localDate = now2.toLocaleDateString("en-CA", { timeZone: tz });
            const [y, mo, d] = localDate.split("-").map(Number);
            const testUtc = Date.UTC(y, mo - 1, d, h, m);
            const testLocal = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(testUtc));
            const [tlH, tlM] = testLocal.split(":").map(Number);
            const offsetMs = ((tlH - h) * 60 + (tlM - m)) * 60_000;
            computedStart = new Date(testUtc - offsetMs);
          }
          if (computedStart && now2 >= computedStart) {
            // Check if this occurrence was already completed
            if (!latestInst?.end_time || new Date(latestInst.end_time) < computedStart) {
              isRunning = true;
              alreadyCompleted = false;
            }
          }
        }
      }

      if (!isRunning && !timeStr) {
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
      writeBotAudit({ action: "activity_finalize", server_id: serverId, discord_user: author, target_id: activity.id, details: { activity_name: activity.name } });
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
        const aliveUntil = new Date(Math.min(nextSlot.getTime() - 3600_000, recentSlot.getTime() + 24 * 3600_000));
        const wasKilled = recentDeaths?.[0] && new Date(recentDeaths[0].death_time) >= recentSlot;
        isAlive = !wasKilled && aliveNow >= recentSlot && aliveNow < aliveUntil;
        // Track the slot start for the cooldown check below
        (aliveNow as any)._recentSlot = recentSlot;
      }
    }
    if (!isAlive) {
      await cmdLog(cmd, "fail", `${boss.name} not alive`);
      discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("❌")}/@me`, { method: "PUT", headers: { Authorization: `Bot ${TOKEN}` } }).catch(() => {});
      return reply(`❌ **${boss.name}** is not currently alive.${timeStr ? `\n-# Wrong time? Use \`${matchedPrefix}editkilltime ${boss.name} HH:MM\` to fix the previous kill instead.` : ""}`);
    }
    if (recentDeaths?.length && !overrideDeathTime) {
      const lastKill = new Date(recentDeaths[0].death_time);
      // Only block if the last death was in the CURRENT spawn window
      const killsInThisWindow = (() => {
        if (boss.spawn_type === "fixed_schedule" && (aliveNow as any)._recentSlot) {
          return lastKill >= (aliveNow as any)._recentSlot;
        }
        if (boss.spawn_type === "fixed_hours") {
          const respawnSecs = (boss.respawn_hours ?? 0) * 3600;
          // If the boss has already respawned (respawn time elapsed), this is a new window
          return (lastKill.getTime() + respawnSecs * 1000) > Date.now();
        }
        // daily / other: fall back to 2h cooldown
        return true;
      })();
      if (!killsInThisWindow) {
        // Death is from a previous spawn window — allow the kill
      } else {
        const cooldownEnd = new Date(lastKill.getTime() + 2 * 3600_000);
        if (new Date() < cooldownEnd) {
          discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent("❌")}/@me`, { method: "PUT", headers: { Authorization: `Bot ${TOKEN}` } }).catch(() => {});
          const killedAt = Math.floor(lastKill.getTime() / 1000);
          return reply(`⏳ **${boss.name}** already declared dead at <t:${killedAt}:t>.${timeStr ? `\n-# Wrong time? Use \`${matchedPrefix}editkilltime ${boss.name} HH:MM\` to fix it.` : ""}`);
        }
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

    const [serverGuilds, allBossGuilds, prevDeaths] = await Promise.all([
      supabaseQuery(`guilds?server_id=eq.${serverId}`),
      supabaseQuery(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode&boss_id=eq.${boss.id}`),
      supabaseQuery(`death_records?server_id=eq.${serverId}&boss_id=eq.${boss.id}&order=death_time.desc&limit=1`),
    ]);
    const sgIds = new Set(serverGuilds.map((g: any) => g.id));
    const serverBossGuilds2 = allBossGuilds.filter((bg: any) => sgIds.has(bg.guild_id));
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
    broadcastNotification(serverId, {}, channelId, killText).catch(() => {});
    const unix = Math.floor(deathTime.getTime() / 1000);
    const replyFields: any[] = [{ name: "Death Time", value: `<t:${unix}:f>`, inline: true }, { name: "Recorded By", value: author, inline: true }];
    if (nextSpawnField) replyFields.push(nextSpawnField);
    await cmdLog(cmd, "ok", `${boss.name} → ${guildName || "unknown"}`);
    writeBotAudit({ action: "boss_kill", server_id: serverId, discord_user: author, target_id: boss.id, details: { boss_name: boss.name, guild: guildName || "unknown" } });
    return replyEmbed(`☠️ ${boss.name} Killed by ${guildName || author}`, timeStr ? `Wrong time? Use \`${matchedPrefix}editkilltime ${boss.name} HH:MM\` to fix it.` : "", 0xef4444, replyFields);
  }

  // ── editkilltime <boss|activity> HH:MM [YYYY-MM-DD] ──
  if (cmd === "editkilltime") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }
    const remaining = args.slice(1);
    // Find HH:MM anywhere in the remaining args (date may follow it)
    let timeStr = "";
    let timeIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      if (/^\d{1,2}:\d{2}$/.test(remaining[i])) { timeStr = remaining[i]; timeIdx = i; break; }
    }
    if (!timeStr) { await cmdLog(cmd, "fail", "no HH:MM"); return reply("Usage: `!editkilltime Boss/Activity HH:MM [YYYY-MM-DD]`"); }
    remaining.splice(timeIdx, 1);

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

    // Compute the timezone offset by comparing local noon to UTC noon
    const noonUtc = Date.UTC(y, mo - 1, d, 12, 0, 0);
    const noonLocal = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(noonUtc));
    const [noonH] = noonLocal.split(":").map(Number);
    let tzOffsetH = noonH - 12;
    if (tzOffsetH > 12) tzOffsetH -= 24;
    if (tzOffsetH < -12) tzOffsetH += 24;

    // Convert local HH:MM to UTC: UTC hour = local hour - offset
    const newDeathTime = new Date(Date.UTC(y, mo - 1, d, h - tzOffsetH, m));
    if (!explicitDate && newDeathTime > now) newDeathTime.setUTCDate(newDeathTime.getUTCDate() - 1);

    // Try bosses first
    const bosses = await supabaseQuery(`bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&name=ilike.${encodeURIComponent("%" + targetName + "%")}`);
    if (bosses?.length) {
      const boss = bosses[0];

    // Find the most recent death record for this boss
    const recentDeaths = await supabaseQuery(`death_records?server_id=eq.${serverId}&boss_id=eq.${boss.id}&order=death_time.desc&limit=1`);
    if (!recentDeaths?.length) { await cmdLog(cmd, "fail", `no death record for ${boss.name}`); return reply(`No death record found for **${boss.name}**.`); }
    const deathRecord = recentDeaths[0];

    // Recalculate owner guild: find the death just before the NEW time (not today's)
    const serverGuilds = await supabaseQuery(`guilds?server_id=eq.${serverId}`);
    const allBossGuilds = await supabaseQuery(`boss_guilds?select=boss_id,guild_id,sort_order,day_of_week,mode&boss_id=eq.${boss.id}`);
    const sgIds = new Set(serverGuilds.map((g: any) => g.id));
    const serverBossGuilds = allBossGuilds.filter((bg: any) => sgIds.has(bg.guild_id));
    // Look up the death that occurred just before the new time (excluding the record being edited)
    const prevDeaths = await supabaseQuery(`death_records?server_id=eq.${serverId}&boss_id=eq.${boss.id}&death_time=lt.${newDeathTime.toISOString()}&id=neq.${deathRecord.id}&order=death_time.desc&limit=1`);
    const lastDeath = prevDeaths?.[0] ?? null;
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
    const oldTimeStr = new Date(deathRecord.death_time).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    const newTimeStr = newDeathTime.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    writeBotAudit({ action: "boss_time_edit", server_id: serverId, discord_user: author, target_id: boss.id, details: { boss_name: boss.name, old_time: oldTimeStr, new_time: newTimeStr } });
    return replyEmbed(`✏️ ${boss.name} Kill Time Updated`, `Time changed from **${oldTimeStr}** to **${newTimeStr}**`, 0x3b82f6, replyFields);
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
    const oldTimeStr2 = new Date(inst.start_time).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    const newTimeStr2 = newDeathTime.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    writeBotAudit({ action: "boss_time_edit", server_id: serverId, discord_user: author, target_id: act.id, details: { activity_name: act.name, old_time: oldTimeStr2, new_time: newTimeStr2 } });
    return replyEmbed(`✏️ ${act.name} Time Updated`, `Time changed from **${oldTimeStr2}** to **${newTimeStr2}**`, 0x3b82f6, []);
  }

  // ── ping (debug) ──
  if (cmd === "ping") {
    return reply(`🏓 Pong! Server: ${serverId || "not linked"}, Guild: ${guildId}, Prefix: ${matchedPrefix}, Channel: ${channelId}, Bot v0.14.3-debug`);
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
    let screenshotUrl = msg.attachments?.length > 0 ? msg.attachments[0].url : null;

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
        // No match — tell user the member doesn't exist
        await cmdLog(cmd, "fail", "user not found");
        return reply(`⚠️ **${playerName}** does not exist. Make sure to enter the correct name or contact your guild officers.`);
      }

      if (!memberId) {
        await cmdLog(cmd, "fail", "could not find/create member");
        return reply(`❌ Could not find or create member **${playerName}**.`);
      }

      // Submit CP update via REST API (service_role) with member_id
      // Persist screenshot to Supabase Storage (Discord CDN URLs expire)
      if (screenshotUrl && memberId) {
        try {
          const persistRes = await fetch(`${SUPABASE_URL}/functions/v1/persist-screenshot`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_KEY!,
              Authorization: `Bearer ${SUPABASE_KEY!}`,
            },
            body: JSON.stringify({
              attachment_url: screenshotUrl,
              guild_id: guildId,
              member_id: memberId,
            }),
          });
          if (persistRes.ok) {
            const persisted = await persistRes.json();
            if (persisted.url) {
              screenshotUrl = persisted.url;
              console.log(`[bot] updatestats screenshot persisted: ${persisted.path}`);
            }
          } else {
            console.warn(`[bot] persist-screenshot failed: ${persistRes.status}, using Discord URL`);
          }
        } catch (e) {
          console.warn("[bot] persist-screenshot error, using Discord URL:", e);
        }
      }

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
      writeBotAudit({ action: "member_cp_update", server_id: serverId, discord_user: author, target_id: memberId, details: { player_name: resolvedName, new_cp: cpValue } });
      return reply(`✅ **${resolvedName}** CP updated to **${cpValue.toLocaleString()}**.${screenshotNote}\n${profileLink}`);
    } catch (err: any) {
      console.error("[bot] updatestats error:", err);
      await cmdLog(cmd, "fail", err.message);
      return reply(`❌ Error updating **${playerName}**: ${err.message}`);
    }
  }

  // ── editstats <PlayerName> <CP> ──
  if (cmd === "editstats") {
    if (!serverId) { await cmdLog(cmd, "fail", "not linked"); return reply("⚠️ Not linked to RaidScout."); }
    const remaining = args.slice(1);
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
      return reply("Usage: `!editstats PlayerName CP`\nExample: `!editstats PressX 120000`\n⚠️ You must attach a new screenshot as proof.");
    }
    remaining.pop();
    const playerName = remaining.join(" ").trim();
    if (!playerName) {
      await cmdLog(cmd, "fail", "no player name");
      return reply("Usage: `!editstats PlayerName CP`\nExample: `!editstats PressX 120000`");
    }

    // Require screenshot attachment
    const editScreenshotUrl = msg.attachments?.length > 0 ? msg.attachments[0].url : null;
    if (!editScreenshotUrl) {
      await cmdLog(cmd, "fail", "no screenshot");
      return reply("⚠️ You must attach a screenshot as proof when editing stats.\nUsage: `!editstats PlayerName CP` + attach image");
    }

    try {
      let memberId: string | null = null;
      let resolvedName = playerName;

      // Fuzzy find member (same as updatestats)
      let memberRows = await supabaseQuerySafe(
        `members?server_id=eq.${serverId}&name=ilike.${encodeURIComponent(playerName)}&select=id,name,combat_power`
      );
      if (!memberRows?.length) {
        memberRows = await supabaseQuerySafe(
          `members?server_id=eq.${serverId}&name=ilike.${encodeURIComponent("%" + playerName + "%")}&select=id,name,combat_power&order=name&limit=26`
        );
      }

      if (memberRows?.length === 1) {
        memberId = memberRows[0].id;
        resolvedName = memberRows[0].name;
      } else if (memberRows && memberRows.length > 1 && memberRows.length <= 25) {
        const names = memberRows.map((r: any) => `• **${r.name}**`).join("\n");
        await cmdLog(cmd, "fail", "ambiguous name");
        return reply(`⚠️ Multiple members match **"${playerName}"**:\n${names}\n\nPlease be more specific.`);
      } else if (memberRows && memberRows.length > 25) {
        await cmdLog(cmd, "fail", "too many matches");
        return reply(`⚠️ Too many members match **"${playerName}"** (${memberRows.length} found). Please be more specific.`);
      } else {
        await cmdLog(cmd, "fail", "member not found");
        return reply(`❌ Member **${playerName}** not found. Make sure to enter the correct name or contact your guild officers.`);
      }

      if (!memberId) {
        await cmdLog(cmd, "fail", "could not find member");
        return reply(`❌ Could not find member **${playerName}**.`);
      }

      // Find the most recent CP update for this member
      const lastUpdate = await supabaseQuerySafe(
        `cp_updates?member_id=eq.${memberId}&status=eq.approved&order=submitted_at.desc&limit=1&select=id,new_cp,submitted_at`
      );

      if (!lastUpdate?.length) {
        await cmdLog(cmd, "fail", "no previous update");
        return reply(`❌ No previous CP update found for **${resolvedName}**. Use \`!updatestats\` to submit a new one.`);
      }

      const updateId = lastUpdate[0].id;
      const oldCpValue = lastUpdate[0].new_cp;

      // Update the last CP entry with new value and screenshot
      const patchBody: any = {
        new_cp: cpValue,
        old_cp: oldCpValue,
        screenshot_url: editScreenshotUrl,
        submitted_at: msg.timestamp || new Date().toISOString(),
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/cp_updates?id=eq.${updateId}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY!,
          Authorization: `Bearer ${SUPABASE_KEY!}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(patchBody),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("[bot] editstats patch failed:", res.status, errText);
        await cmdLog(cmd, "fail", `DB error ${res.status}`);
        return reply(`❌ Failed to edit stats for **${resolvedName}**. Please try again.`);
      }

      // Also update member's combat_power
      await fetch(`${SUPABASE_URL}/rest/v1/members?id=eq.${memberId}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY!,
          Authorization: `Bearer ${SUPABASE_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ combat_power: cpValue }),
      });

      const diff = cpValue - oldCpValue;
      const diffStr = diff >= 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString();
      await cmdLog(cmd, "ok", `${resolvedName}: ${oldCpValue.toLocaleString()} → ${cpValue.toLocaleString()} (${diffStr})`);
      return reply(`✅ **${resolvedName}** last CP entry edited: **${oldCpValue.toLocaleString()}** → **${cpValue.toLocaleString()}** (${diffStr})\n📸 New screenshot saved.`);
    } catch (err: any) {
      console.error("[bot] editstats error:", err);
      await cmdLog(cmd, "fail", err.message);
      return reply(`❌ Error editing **${playerName}**: ${err.message}`);
    }
  }

  // ── DKP Commands ──
  if ((cmd === "dkp" || cmd === "points") && serverId) {
    const args = content.slice(matchedPrefix.length + rawCmd.length).trim();
    try {
      if (!args || args === "") {
        // !dkp — show balance
        const rows = await supabaseRpc("get_member_dkp_by_discord", { p_discord_user_id: msg.author?.id, p_server_id: serverId });
        if (!rows || rows.length === 0) return reply("❌ Link your Discord account first. Claim your profile on the RaidScout website.");
        const r = rows[0];
        return reply(`💰 **DKP Balance**: **${r.balance?.toLocaleString() ?? "0"}** DKP\n📈 Earned (7d): +${r.earned_this_week?.toLocaleString() ?? "0"} · Spent: -${r.spent_this_week?.toLocaleString() ?? "0"}`);
      } else if (args === "top") {
        // !dkp top — rankings
        const rows = await supabaseRpc("get_server_dkp_rankings", { p_server_id: serverId });
        if (!rows || rows.length === 0) return reply("No DKP rankings yet. Record boss kills to start earning.");
        const top = rows.slice(0, 10).map((r: any, i: number) => `**${i + 1}.** ${r.member_name} — ${r.balance?.toLocaleString()} DKP`).join("\n");
        return reply(`🏆 **DKP Rankings** (Top ${Math.min(10, rows.length)}):\n${top}`);
      } else {
        return reply("Usage: `!dkp` (balance) or `!dkp top` (rankings)");
      }
    } catch (err: any) {
      console.error("[bot] dkp error:", err);
      return reply(`❌ ${err.message}`);
    }
  }

  if (cmd === "mybids" && serverId) {
    try {
      const rows = await supabaseRpc("get_member_bids_by_discord", { p_discord_user_id: msg.author?.id, p_server_id: serverId });
      if (!rows || rows.length === 0) return reply("You have no active bids.");
      const list = rows.map((r: any) => `• **${r.item_name}** — ${r.bid_amount} DKP (${r.status})`).join("\n");
      return reply(`🎯 **Your Bids**:\n${list}`);
    } catch (err: any) {
      console.error("[bot] mybids error:", err);
      return reply(`❌ ${err.message}`);
    }
  }

  if (cmd === "bidstatus" && serverId) {
    const itemName = content.slice(matchedPrefix.length + rawCmd.length).trim();
    if (!itemName) return reply("Usage: `!bidstatus Item Name`");
    try {
      // Query active auctions with matching item name
      const auctions = await supabaseQuerySafe(`dkp_auctions?select=id,item_id,dkp_cost,bid_end_time,quantity,items:item_id(name)&status=eq.active&server_id=eq.${serverId}&items.name=ilike.*${encodeURIComponent(itemName)}*&limit=10`);
      if (!auctions || auctions.length === 0) return reply(`No active auction matching "${itemName}" found.`);

      const item = (auctions[0].items as any) ?? {};
      const bids = await supabaseRpc("get_item_bids", { p_item_id: auctions[0].item_id });
      const activeCount = (bids || []).filter((b: any) => b.status === "active").length;

      if (auctions.length === 1) {
        const a = auctions[0];
        const endTime = a.bid_end_time ? new Date(a.bid_end_time) : null;
        const timeLeft = endTime && endTime > new Date() ? Math.ceil((endTime.getTime() - Date.now()) / 60000) : 0;
        const qty = a.quantity && a.quantity > 1 ? ` (x${a.quantity})` : "";
        return reply(`🔨 **${item?.name ?? "Item"}**${qty} is up for bid!\n💰 DKP Cost: ${a.dkp_cost ?? "?"} DKP\n👥 Active Bids: ${activeCount}${timeLeft > 0 ? ` · ${timeLeft}min remaining` : " · Ended"}\n🔗 Bid on the website: https://www.raidscout.com`);
      }

      // Multiple concurrent auctions — show a compact list
      const fmtTime = (end: string | null) => {
        if (!end) return "?";
        const ms = new Date(end).getTime() - Date.now();
        if (ms <= 0) return "Ended";
        const m = Math.ceil(ms / 60000);
        return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
      };
      const lines = auctions.map((a: any) => {
        const qty = a.quantity && a.quantity > 1 ? `x${a.quantity}` : "x1";
        return `• ${qty} · ${a.dkp_cost ?? "?"} DKP · ${fmtTime(a.bid_end_time)} left`;
      });
      return reply(`🔨 **${item?.name ?? "Item"}** — ${auctions.length} active auctions\n👥 Total Active Bids: ${activeCount}\n${lines.join("\n")}\n🔗 Bid on the website: https://www.raidscout.com`);
    } catch (err: any) {
      console.error("[bot] bidstatus error:", err);
      return reply(`❌ ${err.message}`);
    }
  }

  } catch (err: any) {
    logError("cmd", `handleMessage crash [${author}]`, err, {
      guildId: guildId?.slice(0, 8),
      channelId: channelId?.slice(0, 8),
      content: content?.slice(0, 100),
    });
    // Best-effort error reply to user
    discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "❌ An internal error occurred. The bot team has been notified." }),
    }).catch(() => {});
  }
}
