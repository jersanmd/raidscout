// ── Member Management & Inventory API ──────────────────────

import { supabase, getCurrentServerId } from "./client";
import type {
  CpUpdate,
  CpUpdateStatus,
  MemberNote,
  MemberWithProfile,
  Item,
  ItemRarity,
  Distribution,
  CpGrowthEntry,
  ItemDistributionStat,
  TopRecipient,
} from "@/types";

// ── CP Updates ──────────────────────────────────────────────

export async function fetchCpUpdates(
  serverId?: string | null,
  status?: CpUpdateStatus
): Promise<CpUpdate[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase.from("cp_updates").select("*").eq("server_id", sid).order("submitted_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data as CpUpdate[];
}

export async function fetchMemberCpHistory(memberId: string): Promise<CpUpdate[]> {
  const { data, error } = await supabase
    .from("cp_updates")
    .select("*")
    .eq("member_id", memberId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return data as CpUpdate[];
}

export async function fetchPendingCpUpdates(serverId?: string | null): Promise<CpUpdate[]> {
  return fetchCpUpdates(serverId, "pending");
}

export async function submitCpUpdate(update: {
  server_id: string;
  player_name: string;
  new_cp: number;
  screenshot_url?: string;
  discord_user_id?: string;
  discord_username?: string;
  discord_message_id?: string;
}): Promise<CpUpdate> {
  const sid = update.server_id || getCurrentServerId();
  if (!sid) throw new Error("No server selected");

  // Find or create member
  const { data: member } = await supabase
    .from("members")
    .select("id, combat_power")
    .eq("name", update.player_name.trim())
    .eq("server_id", sid)
    .maybeSingle();

  let memberId: string;
  let oldCp: number | null = null;

  if (member) {
    memberId = member.id;
    oldCp = member.combat_power ?? null;
    // Update member's combat_power and discord_user_id
    await supabase
      .from("members")
      .update({
        combat_power: update.new_cp,
        ...(update.discord_user_id ? { discord_user_id: update.discord_user_id } : {}),
      })
      .eq("id", memberId);
  } else {
    const { data: newMember, error: memberErr } = await supabase
      .from("members")
      .insert({
        name: update.player_name.trim(),
        server_id: sid,
        combat_power: update.new_cp,
        discord_user_id: update.discord_user_id || null,
      })
      .select()
      .single();
    if (memberErr) throw memberErr;
    memberId = newMember.id;
  }

  const { data, error } = await supabase
    .from("cp_updates")
    .insert({
      server_id: sid,
      member_id: memberId,
      player_name: update.player_name.trim(),
      old_cp: oldCp,
      new_cp: update.new_cp,
      screenshot_url: update.screenshot_url || null,
      discord_user_id: update.discord_user_id || null,
      discord_username: update.discord_username || null,
      discord_message_id: update.discord_message_id || null,
      status: "approved", // Auto-approve for now; change to "pending" for review workflow
    })
    .select()
    .single();
  if (error) throw error;
  return data as CpUpdate;
}

export async function updateCpStatus(
  updateId: string,
  status: CpUpdateStatus,
  memberId?: string,
  newCp?: number
): Promise<void> {
  const { error } = await supabase
    .from("cp_updates")
    .update({
      status,
      approved_by: status === "approved" ? (await supabase.auth.getUser()).data.user?.id : null,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      reviewed_by: (await supabase.auth.getUser()).data.user?.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", updateId);
  if (error) throw error;

  // If approved, update member's combat_power
  if (status === "approved" && memberId && newCp) {
    await supabase.from("members").update({ combat_power: newCp }).eq("id", memberId);
  }
}

// ── Member Notes ────────────────────────────────────────────

export async function fetchMemberNotes(memberId: string): Promise<MemberNote[]> {
  const { data, error } = await supabase
    .from("member_notes")
    .select("*")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as MemberNote[];
}

export async function addMemberNote(note: {
  server_id: string;
  member_id: string;
  note: string;
}): Promise<MemberNote> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("member_notes")
    .insert({
      server_id: note.server_id,
      member_id: note.member_id,
      note: note.note,
      created_by: userData.user?.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MemberNote;
}

export async function deleteMemberNote(noteId: string): Promise<void> {
  const { error } = await supabase.from("member_notes").delete().eq("id", noteId);
  if (error) throw error;
}

// ── Member Profile (aggregated) ─────────────────────────────

export async function fetchMemberProfile(memberId: string): Promise<MemberWithProfile> {
  const sid = getCurrentServerId();

  const [{ data: member }, { data: cpUpdates }, { data: notes }, { data: lootCount }] = await Promise.all([
    supabase.from("members").select("*").eq("id", memberId).single(),
    supabase.from("cp_updates").select("*").eq("member_id", memberId).order("submitted_at", { ascending: false }),
    supabase.from("member_notes").select("*").eq("member_id", memberId).order("created_at", { ascending: false }),
    supabase.from("distributions").select("id", { count: "exact", head: true }).eq("member_id", memberId),
  ]);

  if (!member) throw new Error("Member not found");

  const updates = (cpUpdates || []) as CpUpdate[];
  const approvedUpdates = updates.filter(u => u.status === "approved");
  const latestCp = approvedUpdates.length > 0 ? approvedUpdates[0].new_cp : null;

  // 7-day growth
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
  const recent7d = approvedUpdates.filter(u => new Date(u.submitted_at) >= sevenDaysAgo);
  const growth7d = recent7d.length >= 2
    ? Math.max(...recent7d.map(u => u.new_cp)) - Math.min(...recent7d.map(u => u.new_cp))
    : null;

  // 30-day growth
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const recent30d = approvedUpdates.filter(u => new Date(u.submitted_at) >= thirtyDaysAgo);
  const growth30d = recent30d.length >= 2
    ? Math.max(...recent30d.map(u => u.new_cp)) - Math.min(...recent30d.map(u => u.new_cp))
    : null;

  return {
    ...member,
    current_cp: latestCp ?? member.combat_power ?? null,
    cp_growth_7d: growth7d,
    cp_growth_30d: growth30d,
    last_cp_update: approvedUpdates.length > 0 ? approvedUpdates[0].submitted_at : null,
    discord_user_id: member.discord_user_id ?? null,
    notes: (notes || []) as MemberNote[],
    cp_history: updates,
    loot_count: lootCount ?? 0,
  } as unknown as MemberWithProfile;
}

// ── Items (Catalog) ─────────────────────────────────────────

export async function fetchItems(serverId?: string | null): Promise<Item[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("server_id", sid)
    .order("name");
  if (error) throw error;
  return data as Item[];
}

export async function createItem(item: {
  server_id: string;
  name: string;
  image_url?: string;
  description?: string;
  rarity?: ItemRarity;
}): Promise<Item> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("items")
    .insert({
      server_id: item.server_id,
      name: item.name.trim(),
      image_url: item.image_url || null,
      description: item.description || null,
      rarity: item.rarity || "common",
      created_by: userData.user?.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Item;
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) throw error;
}

// ── Distributions ───────────────────────────────────────────

export async function fetchDistributions(
  serverId?: string | null,
  memberId?: string,
  itemId?: string
): Promise<Distribution[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase.from("distributions").select("*").eq("server_id", sid).order("distributed_at", { ascending: false });
  if (memberId) query = query.eq("member_id", memberId);
  if (itemId) query = query.eq("item_id", itemId);
  const { data, error } = await query.limit(100);
  if (error) throw error;
  return data as Distribution[];
}

export async function createDistribution(dist: {
  server_id: string;
  item_id: string;
  member_id: string;
  player_name: string;
  quantity: number;
  reason: string;
}): Promise<Distribution> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("distributions")
    .insert({
      server_id: dist.server_id,
      item_id: dist.item_id,
      member_id: dist.member_id,
      player_name: dist.player_name.trim(),
      quantity: dist.quantity,
      reason: dist.reason,
      distributed_by: userData.user?.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Distribution;
}

export async function deleteDistribution(distId: string): Promise<void> {
  const { error } = await supabase.from("distributions").delete().eq("id", distId);
  if (error) throw error;
}

// ── Analytics ───────────────────────────────────────────────

export async function fetchTopCpGrowth(
  serverId?: string | null,
  days: number = 30,
  limit: number = 10
): Promise<CpGrowthEntry[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase.rpc("get_top_cp_growth", {
    p_server_id: sid,
    p_days: days,
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []) as CpGrowthEntry[];
}

export async function fetchItemDistributionStats(serverId?: string | null): Promise<ItemDistributionStat[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase.rpc("get_item_distribution_stats", {
    p_server_id: sid,
  });
  if (error) throw error;
  return (data || []) as ItemDistributionStat[];
}

export async function fetchTopRecipients(
  serverId?: string | null,
  limit: number = 10
): Promise<TopRecipient[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase.rpc("get_top_recipients", {
    p_server_id: sid,
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []) as TopRecipient[];
}
