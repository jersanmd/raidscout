// Party lookup -- shared between ;party command and thread creation

import { supabaseQuerySafe } from "./supabase";

export interface PartyListEntry { name: string; guildName: string | null; members: string[]; }

/** Fetch parties assigned to a boss or activity, with guild info */
export async function fetchPartyList(
  serverId: string, targetId: string, ownerType: "boss" | "activity"
): Promise<PartyListEntry[]> {
  const idCol = ownerType === "boss" ? "boss_id" : "activity_id";
  const partyRows = await supabaseQuerySafe(
    `static_parties?server_id=eq.${serverId}&${idCol}=eq.${targetId}&select=id,name,guild_id`
  );
  if (!partyRows?.length) return [];

  const partyIds = partyRows.map((p: any) => p.id).join(",");
  const memberRows = await supabaseQuerySafe(
    `static_party_members?party_id=in.(${partyIds})&select=party_id,member_id`
  );
  const memberIds = [...new Set(memberRows.map((m: any) => m.member_id))];
  let memberMap = new Map<string, string>();
  let memberGuildMap = new Map<string, string>();
  if (memberIds.length > 0) {
    const members = await supabaseQuerySafe(
      `members?server_id=eq.${serverId}&select=id,name,guild_id&id=in.(${memberIds.join(",")})`
    );
    memberMap = new Map((members || []).map((m: any) => [m.id, m.name]));
    // Get guild names
    const guildIds = [...new Set((members || []).map((m: any) => m.guild_id).filter(Boolean))];
    if (guildIds.length > 0) {
      const guilds = await supabaseQuerySafe(
        `guilds?select=id,name&id=in.(${guildIds.join(",")})`
      );
      const guildNameMap = new Map<string, string>((guilds || []).map((g: any) => [String(g.id), String(g.name)]));
      for (const m of (members || [])) {
        if (m.guild_id && guildNameMap.has(m.guild_id)) {
          memberGuildMap.set(m.id, guildNameMap.get(m.guild_id));
        }
      }
    }
  }

  // Get guild names for each party
  const partyGuildIds = [...new Set(partyRows.map((p: any) => p.guild_id).filter(Boolean))];
  let partyGuildMap = new Map<string, string>();
  if (partyGuildIds.length > 0) {
    const guilds = await supabaseQuerySafe(
      `guilds?select=id,name&id=in.(${partyGuildIds.join(",")})`
    );
    partyGuildMap = new Map((guilds || []).map((g: any) => [g.id, g.name]));
  }

  return partyRows.map((p: any) => {
    const pMembers = memberRows
      .filter((m: any) => m.party_id === p.id)
      .map((m: any) => {
        const name = memberMap.get(m.member_id) || m.member_id.slice(0, 8);
        const gName = memberGuildMap.get(m.member_id);
        return gName ? `${name} 🛡${gName}` : name;
      });
    return {
      name: p.name,
      guildName: partyGuildMap.get(p.guild_id) || null,
      members: pMembers,
    };
  });
}

/** Format party list as a string for thread first message */
export function formatPartyListForThread(parties: PartyListEntry[]): string | null {
  if (!parties.length) return null;
  const lines: string[] = [];
  for (const p of parties) {
    const guildTag = p.guildName ? ` [${p.guildName}]` : "";
    lines.push(`**${p.name}**${guildTag} (${p.members.length})`);
    if (p.members.length > 0) lines.push(p.members.join(", "));
    else lines.push("_No members_");
    lines.push(""); // blank line between parties
  }
  lines.push("─".repeat(20));
  return lines.join("\n");
}
