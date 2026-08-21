// ── Member Management & Inventory API ──────────────────────

import { supabase, getCurrentServerId } from "./client";
import { writeAuditEntry, AuditAction } from "./audit";
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
  writeAuditEntry({ action: AuditAction.MEMBER_CP_ADD, server_id: sid, target_id: memberId, details: { player_name: update.player_name.trim(), old_cp: oldCp, new_cp: update.new_cp, discord_user_id: update.discord_user_id || undefined, discord_username: update.discord_username || undefined } });
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

// ── Backdated CP Update (moderator only) ────────────────────

export async function addBackdatedCpUpdate(update: {
  server_id: string;
  member_id: string;
  player_name: string;
  new_cp: number;
  submitted_at: string; // ISO date
}): Promise<CpUpdate> {
  const sid = update.server_id || getCurrentServerId();
  if (!sid) throw new Error("No server selected");

  // Get old_cp from member's current combat_power
  const { data: member } = await supabase
    .from("members")
    .select("combat_power")
    .eq("id", update.member_id)
    .single();

  const oldCp = member?.combat_power ?? null;

  const user = (await supabase.auth.getUser()).data.user;

  const { data, error } = await supabase
    .from("cp_updates")
    .insert({
      server_id: sid,
      member_id: update.member_id,
      player_name: update.player_name,
      old_cp: oldCp,
      new_cp: update.new_cp,
      status: "approved",
      submitted_at: update.submitted_at,
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  // Update member's combat_power to the latest approved CP by submitted_at date
  const { data: latestEntry } = await supabase
    .from("cp_updates")
    .select("new_cp")
    .eq("member_id", update.member_id)
    .eq("status", "approved")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("members")
    .update({ combat_power: latestEntry?.new_cp ?? update.new_cp })
    .eq("id", update.member_id);

  writeAuditEntry({ action: AuditAction.MEMBER_CP_UPDATE, server_id: sid, target_id: update.member_id, details: { player_name: update.player_name, old_cp: oldCp, new_cp: update.new_cp, date: update.submitted_at } });
  return data as CpUpdate;
}

// ── Edit CP Update Entry ────────────────────────────────────

export async function editCpUpdate(
  updateId: string,
  newCp: number,
  memberId: string
): Promise<void> {
  // Get the current cp_update to find old_cp
  const { data: existing } = await supabase
    .from("cp_updates")
    .select("old_cp")
    .eq("id", updateId)
    .single();

  const { error } = await supabase
    .from("cp_updates")
    .update({
      new_cp: newCp,
      old_cp: existing?.old_cp, // keep original old_cp
      reviewed_by: (await supabase.auth.getUser()).data.user?.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", updateId);
  if (error) throw error;

  // Also update the member's current combat_power if this was their latest
  const { data: latest } = await supabase
    .from("cp_updates")
    .select("id")
    .eq("member_id", memberId)
    .eq("status", "approved")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .single();

  if (latest?.id === updateId) {
    await supabase.from("members").update({ combat_power: newCp }).eq("id", memberId);
  }
  writeAuditEntry({ action: AuditAction.MEMBER_CP_UPDATE, server_id: getCurrentServerId() || "", target_id: memberId, details: { cp_update_id: updateId, new_cp: newCp } });
}

// ── Delete CP Update Entry ──────────────────────────────────

export async function deleteCpUpdate(updateId: string, memberId: string, serverId?: string): Promise<void> {
  const { error } = await supabase
    .from("cp_updates")
    .delete()
    .eq("id", updateId);
  if (error) throw error;
  if (serverId) {
    writeAuditEntry({ action: AuditAction.MEMBER_CP_DELETE, server_id: serverId, target_id: memberId, details: { cp_update_id: updateId } });
  }

  // Recalculate member's combat_power from the latest remaining entry
  const { data: latest } = await supabase
    .from("cp_updates")
    .select("new_cp")
    .eq("member_id", memberId)
    .eq("status", "approved")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("members")
    .update({ combat_power: latest?.new_cp ?? null })
    .eq("id", memberId);
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
  writeAuditEntry({ action: AuditAction.MEMBER_NOTE_ADD, server_id: note.server_id, target_id: note.member_id, details: { note_preview: note.note.substring(0, 50) } });
  return data as MemberNote;
}

export async function deleteMemberNote(noteId: string, serverId?: string): Promise<void> {
  const { error } = await supabase.from("member_notes").delete().eq("id", noteId);
  if (error) throw error;
  if (serverId) {
    writeAuditEntry({ action: AuditAction.MEMBER_NOTE_DELETE, server_id: serverId, target_id: noteId });
  }
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

  // 7-day growth (latest - oldest in period)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
  const recent7d = approvedUpdates.filter(u => new Date(u.submitted_at) >= sevenDaysAgo);
  const growth7d = recent7d.length >= 2
    ? recent7d[0].new_cp - recent7d[recent7d.length - 1].new_cp
    : null;

  // 30-day growth (latest - oldest in period)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const recent30d = approvedUpdates.filter(u => new Date(u.submitted_at) >= thirtyDaysAgo);
  const growth30d = recent30d.length >= 2
    ? recent30d[0].new_cp - recent30d[recent30d.length - 1].new_cp
    : null;

  // Fetch attendance history with boss names (uses RPC to bypass RLS for viewers)
  const { data: attendance } = await supabase.rpc("get_member_attendance_history", {
    p_member_id: memberId,
  });

  // Fetch activity attendance (uses RPC to bypass RLS for viewers)
  const { data: activityAttendance } = await supabase.rpc("get_member_activity_attendance", {
    p_member_id: memberId,
  });

  // Fetch loot history (uses RPC to bypass RLS for viewers)
  const { data: lootHistory } = await supabase.rpc("get_member_loot_history", {
    p_member_id: memberId,
  });

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
    attendance_count: (attendance?.length ?? 0) + (activityAttendance?.length ?? 0),
    loot_history: (lootHistory || []) as any[],
    attendance_history: (attendance || []) as any[],
    activity_attendance: (activityAttendance || []) as any[],
  } as unknown as MemberWithProfile;
}

// ── Items (Catalog) ─────────────────────────────────────────

// PostgREST returns at most 1000 rows per request; page through anything unbounded.
const PAGE_SIZE = 1000;

export async function fetchItems(serverId?: string | null, limit?: number): Promise<Item[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];

  // Get the server's game slug (or resolve from game_id)
  const { data: server } = await supabase
    .from("servers")
    .select("game, game_id")
    .eq("id", sid)
    .single();

  let gameSlug: string | undefined = server?.game ?? undefined;

  // Fallback: resolve game_id UUID → slug if game column is null
  if (!gameSlug && server?.game_id) {
    const { data: gameData } = await supabase
      .from("games")
      .select("slug")
      .eq("id", server.game_id)
      .single();
    gameSlug = gameData?.slug ?? undefined;
  }

  const filter = gameSlug
    ? `server_id.eq.${sid},and(game.eq.${gameSlug},server_id.is.null)`
    : `server_id.eq.${sid}`;
  // Secondary sort on id keeps paging stable when two items share a name.
  const build = () =>
    supabase.from("items").select("*").or(filter).neq("status", "rejected").order("name").order("id");

  if (limit) {
    const { data, error } = await build().limit(limit);
    if (error) throw error;
    return (data || []) as Item[];
  }

  // Paginated: a shared game catalog runs well past PostgREST's 1000-row cap, and
  // every truncated item renders as "Unknown Item" wherever history is displayed.
  const all: Item[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await build().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as Item[]));
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

export async function fetchItemsPaginated(
  serverId: string | undefined | null,
  limit: number,
  offset: number,
  search?: string,
  pendingOnly?: boolean,
  rarity?: string | null,
): Promise<{ items: Item[]; total: number }> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return { items: [], total: 0 };

  const { data: server } = await supabase
    .from("servers")
    .select("game, game_id")
    .eq("id", sid)
    .single();

  let gameSlug: string | undefined = server?.game ?? undefined;
  if (!gameSlug && server?.game_id) {
    const { data: gameData } = await supabase
      .from("games")
      .select("slug")
      .eq("id", server.game_id)
      .single();
    gameSlug = gameData?.slug ?? undefined;
  }

  // Pending items are server-scoped; the normal catalog is this server's items plus
  // the shared game catalog, minus other servers' pending submissions.
  const applyScope = (q: any) =>
    pendingOnly
      ? q.eq("server_id", sid).eq("status", "pending")
      : gameSlug
        ? q.or(`server_id.eq.${sid},and(game.eq.${gameSlug},status.neq.pending)`).neq("status", "rejected")
        : q.eq("server_id", sid).neq("status", "rejected");

  let dataQuery = applyScope(supabase.from("items").select("*")).order("name").order("id");
  let countQuery = applyScope(supabase.from("items").select("*", { count: "exact", head: true }));

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    dataQuery = dataQuery.ilike("name", term);
    countQuery = countQuery.ilike("name", term);
  }

  // Filtered server-side so the rarity chips page and count correctly instead of
  // thinning out whichever 50 rows happen to be loaded.
  if (rarity) {
    dataQuery = dataQuery.ilike("rarity", rarity);
    countQuery = countQuery.ilike("rarity", rarity);
  }

  const [{ data, error }, { count }] = await Promise.all([
    dataQuery.range(offset, offset + limit - 1),
    countQuery,
  ]);
  if (error) throw error;
  return { items: (data || []) as Item[], total: count || 0 };
}

export async function searchItemsByGame(game: string, query?: string): Promise<Item[]> {
  const { data, error } = await supabase.rpc("search_items_by_game", {
    p_game: game,
    p_query: query || null,
  });
  if (error) throw error;
  return (data || []) as Item[];
}

export async function createItem(item: {
  server_id: string;
  name: string;
  image_url?: string;
  description?: string;
  rarity?: ItemRarity;
  category_id?: string;
  category_label?: string | null;
}): Promise<Item> {
  const { data: userData } = await supabase.auth.getUser();
  const username = userData.user?.email?.split("@")[0] || userData.user?.id?.slice(0, 8) || "unknown";

  // Check if user is admin (admins create pre-approved items)
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user?.id)
    .maybeSingle();
  const isAdmin = roleData?.role === "admin";

  // Get server's game
  const { data: server } = await supabase
    .from("servers")
    .select("game")
    .eq("id", item.server_id)
    .single();

  const game = server?.game || null;

  const { data, error } = await supabase
    .from("items")
    .insert({
      server_id: item.server_id,
      game,
      name: item.name.trim(),
      image_url: item.image_url || null,
      description: item.description || null,
      rarity: item.rarity || "common",
      category_id: item.category_id || null,
      created_by: userData.user?.id,
      created_by_username: username,
      status: isAdmin ? "approved" : "pending",
    })
    .select()
    .single();
  if (error) throw error;
  writeAuditEntry({ action: AuditAction.ITEM_CREATE, server_id: item.server_id, target_id: data.id, details: { item_name: item.name.trim(), rarity: item.rarity || "common", category: item.category_label, description: item.description, has_image: !!item.image_url } });
  return data as Item;
}

export async function deleteItem(itemId: string, serverId?: string, itemName?: string): Promise<void> {
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.ITEM_DELETE, server_id: serverId, target_id: itemId, details: { item_name: itemName || itemId } });
}

export async function updateItem(itemId: string, updates: {
  name?: string;
  description?: string;
  rarity?: ItemRarity;
  image_url?: string;
}, serverId?: string): Promise<void> {
  const { error } = await supabase
    .from("items")
    .update(updates)
    .eq("id", itemId);
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.ITEM_UPDATE, server_id: serverId, target_id: itemId, details: updates });
}

// ── Distributions ───────────────────────────────────────────

export async function fetchDistributions(
  serverId?: string | null,
  memberId?: string,
  itemId?: string,
  limit?: number,
  cursor?: string | null
): Promise<Distribution[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const build = () => {
    // Secondary sort on id keeps paging stable across rows sharing a timestamp.
    let q = supabase.from("distributions").select("*").eq("server_id", sid)
      .order("distributed_at", { ascending: false }).order("id");
    if (cursor) q = q.lt("distributed_at", cursor);
    if (memberId) q = q.eq("member_id", memberId);
    if (itemId) q = q.eq("item_id", itemId);
    return q;
  };

  if (limit) {
    const { data, error } = await build().limit(limit);
    if (error) throw error;
    return (data || []) as Distribution[];
  }

  // Paginated: an unbounded fetch stops at PostgREST's 1000-row cap, which silently
  // undercounts the recipients and analytics tabs on any long-running server.
  const all: Distribution[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await build().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as Distribution[]));
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

export async function fetchDistributionsByDay(
  serverId: string,
  dateStr: string, // YYYY-MM-DD, read as a day in the viewer's local timezone
): Promise<Distribution[]> {
  // Local day bounds, not UTC: the history list groups rows by local date, so UTC
  // bounds would split one displayed day across two fetches for any offset timezone.
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  const end = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
  const { data, error } = await supabase
    .from("distributions")
    .select("*")
    .eq("server_id", serverId)
    .gte("distributed_at", start)
    .lte("distributed_at", end)
    .order("distributed_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Distribution[];
}

/** Search a server's whole distribution history rather than the days already loaded.
 *  Item names are matched by resolving ids on the caller's side (distributions carry
 *  no item name), player names are matched server-side. */
export async function searchDistributions(
  serverId: string,
  opts: { itemIds?: string[]; playerQuery?: string; limit?: number },
): Promise<Distribution[]> {
  const limit = opts.limit ?? 500;
  const byId = new Map<string, Distribution>();

  // Chunked to keep the `in` list inside PostgREST's URL length budget.
  const CHUNK = 150;
  const itemIds = opts.itemIds ?? [];
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("distributions")
      .select("*")
      .eq("server_id", serverId)
      .in("item_id", itemIds.slice(i, i + CHUNK))
      .order("distributed_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    (data || []).forEach((row: any) => byId.set(row.id, row as Distribution));
  }

  const playerQuery = opts.playerQuery?.trim();
  if (playerQuery) {
    const { data, error } = await supabase
      .from("distributions")
      .select("*")
      .eq("server_id", serverId)
      .ilike("player_name", `%${playerQuery}%`)
      .order("distributed_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    (data || []).forEach((row: any) => byId.set(row.id, row as Distribution));
  }

  return [...byId.values()]
    .sort((a, b) => new Date(b.distributed_at).getTime() - new Date(a.distributed_at).getTime())
    .slice(0, limit);
}


export async function createDistribution(dist: {
  server_id: string;
  item_id: string;
  member_id: string;
  player_name: string;
  quantity: number;
  reason: string;
  distributed_by?: string;
  /** Auction this distribution came from, when distributing a DKP auction win.
   *  Lets deleting the record clear only that auction's "Distributed" marker
   *  instead of every auction for the same item. */
  auction_id?: string | null;
}, itemName?: string): Promise<Distribution> {
  const { data, error } = await supabase
    .from("distributions")
    .insert({
      server_id: dist.server_id,
      item_id: dist.item_id,
      member_id: dist.member_id,
      player_name: dist.player_name.trim(),
      quantity: dist.quantity,
      reason: dist.reason,
      distributed_by: dist.distributed_by || null,
      auction_id: dist.auction_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  writeAuditEntry({ action: AuditAction.ITEM_DISTRIBUTE, server_id: dist.server_id, target_id: dist.member_id, details: { item_name: itemName || dist.item_id, player_name: dist.player_name.trim(), quantity: dist.quantity, reason: dist.reason } });
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
  limit: number = 200
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
