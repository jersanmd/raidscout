import { supabase } from "./client";
import { AuditAction, writeAuditEntry } from "./audit";

// ── Types ───────────────────────────────────────────────────

export interface DkpBalance {
  balance: number;
  earned_total: number;
  spent_total: number;
}

export interface DkpTransaction {
  id: string;
  amount: number;
  type: string;
  reason: string | null;
  created_at: string;
  boss_name?: string | null;
  death_time?: string | null;
  guild_name?: string | null;
  item_name?: string | null;
  item_rarity?: string | null;
  item_guild_name?: string | null;
  bidder_name?: string | null;
}

export interface DkpRanking {
  member_id: string;
  member_name: string;
  balance: number;
  rank: number;
  guild_name: string | null;
}

export interface DkpBid {
  id: string;
  item_id: string;
  item_name: string;
  auction_id: string | null;
  member_id: string;
  member_name: string;
  bid_amount: number;
  status: string;
  created_at: string;
}

export interface ItemBid {
  id: string;
  auction_id: string | null;
  member_name: string;
  bid_amount: number;
  status: string;
  created_at: string;
}

export interface DkpConfig {
  server_id: string;
  enabled: boolean;
  dkp_multiplier: number;
  bid_mode_default: string;
  bid_duration_minutes: number;
  hide_from_players: boolean;
}

// ── DKP Earning ─────────────────────────────────────────────

export async function awardDkpOnKill(deathRecordId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("award_dkp_on_kill", {
    p_death_record_id: deathRecordId,
  });
  if (error) throw error;
  return (data as string[]) ?? [];
}

export async function adjustMemberDkp(
  memberId: string,
  serverId: string,
  amount: number,
  reason?: string
): Promise<string> {
  const { data, error } = await supabase.rpc("adjust_member_dkp", {
    p_member_id: memberId,
    p_server_id: serverId,
    p_amount: amount,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ── DKP Queries ─────────────────────────────────────────────

export async function getMemberDkp(memberId: string, serverId: string): Promise<DkpBalance> {
  const { data, error } = await supabase.rpc("get_member_dkp", {
    p_member_id: memberId,
    p_server_id: serverId,
  });
  if (error) throw error;
  return (data?.[0] ?? { balance: 0, earned_total: 0, spent_total: 0 }) as DkpBalance;
}

export async function getServerDkpRankings(serverId: string): Promise<DkpRanking[]> {
  const { data, error } = await supabase.rpc("get_server_dkp_rankings", {
    p_server_id: serverId,
  });
  if (error) throw error;
  return (data as DkpRanking[]) ?? [];
}

export async function getMemberDkpHistory(
  memberId: string,
  serverId: string,
  limit = 50,
  cursor?: string
): Promise<DkpTransaction[]> {
  const { data, error } = await supabase.rpc("get_member_dkp_history", {
    p_member_id: memberId,
    p_server_id: serverId,
    p_limit: limit,
    p_cursor: cursor ?? null,
  });
  if (error) throw error;
  return (data as DkpTransaction[]) ?? [];
}

// ── DKP Bidding ─────────────────────────────────────────────

export async function markItemForBid(
  itemId: string,
  dkpCost: number,
  serverId: string,
  itemName?: string,
  bidEndTime?: string,
  durationMinutes?: number,
  guildId?: string | null,
  quantity?: number,
): Promise<string> {
  const { data, error } = await supabase.rpc("mark_item_for_bid", {
    p_item_id: itemId,
    p_dkp_cost: dkpCost,
    p_bid_end_time: bidEndTime ?? null,
    p_duration_minutes: durationMinutes ?? null,
    p_guild_id: guildId ?? null,
    p_quantity: quantity ?? 1,
    p_server_id: serverId,
  });
  if (error) throw error;
  writeAuditEntry({
    action: AuditAction.DKP_ITEM_MARKED,
    server_id: serverId,
    target_type: "item",
    target_id: itemId,
    details: { item_name: itemName, dkp_cost: dkpCost, duration_minutes: durationMinutes ?? 30 },
  }).catch(() => {});
  return data as string;
}

export async function unmarkItemFromBid(itemId: string): Promise<void> {
  const { error } = await supabase.rpc("unmark_item_from_bid", {
    p_item_id: itemId,
  });
  if (error) throw error;
}

export async function placeBid(auctionId: string, amount: number, serverId: string, itemName?: string): Promise<string> {
  const { data, error } = await supabase.rpc("place_bid", {
    p_auction_id: auctionId,
    p_amount: amount,
  });
  if (error) throw error;
  writeAuditEntry({
    action: AuditAction.DKP_BID_PLACED,
    server_id: serverId,
    target_type: "auction",
    target_id: auctionId,
    details: { item_name: itemName, bid_amount: amount },
  }).catch(() => {});
  return data as string;
}

export async function cancelBid(bidId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_bid", {
    p_bid_id: bidId,
  });
  if (error) throw error;
}

export async function getItemBids(itemId: string): Promise<ItemBid[]> {
  const { data, error } = await supabase.rpc("get_item_bids", {
    p_item_id: itemId,
  });
  if (error) throw error;
  return (data as ItemBid[]) ?? [];
}

export async function resolveAuction(auctionId: string, winnerBidId: string | null | undefined, serverId: string, itemName?: string): Promise<void> {
  const { error } = await supabase.rpc("resolve_auction", {
    p_auction_id: auctionId,
    p_winner_bid_id: winnerBidId ?? null,
  });
  if (error) throw error;
  writeAuditEntry({
    action: winnerBidId ? AuditAction.DKP_BID_WON : AuditAction.DKP_BID_CANCELLED,
    server_id: serverId,
    target_type: "auction",
    target_id: auctionId,
    details: { item_name: itemName, winner_bid_id: winnerBidId ?? null },
  }).catch(() => {});
}

export async function autoResolveAuction(itemId: string): Promise<void> {
  const { error } = await supabase.rpc("auto_resolve_auction", {
    p_item_id: itemId,
  });
  if (error) throw error;
}

export async function getActiveBids(serverId: string): Promise<DkpBid[]> {
  const { data, error } = await supabase.rpc("get_active_bids", {
    p_server_id: serverId,
  });
  if (error) throw error;
  return (data as DkpBid[]) ?? [];
}

export interface ActiveAuction {
  auction_id: string;
  item_id: string;
  item_name: string;
  image_url: string | null;
  rarity: string | null;
  dkp_cost: number;
  bid_end_time: string;
  highest_bid: number;
  bid_count: number;
  top_bidder_member_id: string | null;
  guild_id: string | null;
  guild_name: string | null;
  quantity: number;
}

export interface PastAuction {
  auction_id: string;
  item_id: string;
  item_name: string;
  image_url: string | null;
  rarity: string | null;
  dkp_cost: number;
  winner_name: string | null;
  winning_bid: number;
  bid_count: number;
  started_at: string;
  resolved_at: string;
  auction_round: number;
  distributed: boolean;
  guild_name: string | null;
}

export async function getActiveAuctions(serverId: string): Promise<ActiveAuction[]> {
  const { data: auctions } = await supabase.from("dkp_auctions")
    .select("id, item_id, dkp_cost, bid_end_time, guild_id, quantity, items:item_id(name, image_url, rarity), guilds:guild_id(name)")
    .eq("server_id", serverId)
    .eq("status", "active")
    .order("bid_end_time", { ascending: true });

  if (!auctions?.length) return [];

  const activeGuildIds = [...new Set(auctions.map(a => a.guild_id).filter(Boolean))] as string[];
  const activeGuildMap = new Map<string, string>();
  if (activeGuildIds.length > 0) {
    const { data: guilds } = await supabase.from("guilds").select("id, name").in("id", activeGuildIds);
    (guilds || []).forEach((g: any) => activeGuildMap.set(g.id, g.name));
  }

  const bids = await getActiveBids(serverId);
  const bidMap: Record<string, { total: number; highest: number; topBidderId: string | null }> = {};
  bids.forEach((b: DkpBid) => {
    const key = b.auction_id || b.item_id; // fallback for old bids
    const e = bidMap[key] || { total: 0, highest: 0, topBidderId: null };
    e.total++;
    if (b.status === 'active' && b.bid_amount > e.highest) { e.highest = b.bid_amount; e.topBidderId = b.member_id; }
    bidMap[key] = e;
  });

  return auctions.map((a: any) => ({
    auction_id: a.id,
    item_id: a.item_id,
    item_name: a.items?.name ?? "Unknown",
    image_url: a.items?.image_url,
    rarity: a.items?.rarity,
    dkp_cost: a.dkp_cost ?? 0,
    bid_end_time: a.bid_end_time,
    highest_bid: bidMap[a.id]?.highest ?? 0,
    bid_count: bidMap[a.id]?.total ?? 0,
    top_bidder_member_id: bidMap[a.id]?.topBidderId ?? null,
    guild_id: a.guild_id ?? null,
    guild_name: a.guild_id ? (activeGuildMap.get(a.guild_id) ?? null) : null,
    quantity: a.quantity ?? 1,
  }));
}

export async function getPastAuctions(serverId: string): Promise<PastAuction[]> {
  // Query resolved/cancelled auctions directly (not items) so each auction is separate
  const { data: auctions } = await supabase.from("dkp_auctions")
    .select("id, item_id, dkp_cost, guild_id, quantity, created_at, items:item_id(name, image_url, rarity), guilds:guild_id(name)")
    .eq("server_id", serverId)
    .in("status", ["resolved", "cancelled"])
    .order("created_at", { ascending: false });

  if (!auctions?.length) return [];

  // Build guild name lookup
  const guildIds = [...new Set(auctions.map(a => a.guild_id).filter(Boolean))] as string[];
  const guildMap = new Map<string, string>();
  if (guildIds.length > 0) {
    const { data: guilds } = await supabase.from("guilds").select("id, name").in("id", guildIds);
    (guilds || []).forEach((g: any) => guildMap.set(g.id, g.name));
  }

  const auctionIds = auctions.map(a => a.id);

  // Get resolved bids for all past auctions
  const { data: bids, error: bidsErr } = await supabase.rpc("get_resolved_bids", { p_server_id: serverId });
  if (bidsErr) { console.error("get_resolved_bids RPC error:", bidsErr); return []; }

  const bidsForAuctions = ((bids as any[]) || []).filter((b: any) => b.auction_id && auctionIds.includes(b.auction_id));
  if (!bidsForAuctions.length && auctions.length === 0) return [];

  // Group bids by auction_id
  const auctionBidMap = new Map<string, { bids: any[]; winner: { name: string; amount: number } | null }>();
  for (const b of bidsForAuctions) {
    const e = auctionBidMap.get(b.auction_id) || { bids: [], winner: null };
    e.bids.push(b);
    if (b.status === "won" && (!e.winner || b.bid_amount > e.winner.amount)) {
      e.winner = { name: b.member_name ?? "Unknown", amount: b.bid_amount };
    }
    auctionBidMap.set(b.auction_id, e);
  }

  return auctions.map((a: any) => {
    const item = a.items as any;
    const round = auctionBidMap.get(a.id);
    const roundBids = round?.bids ?? [];
    const winner = round?.winner ?? null;
    const highestBid = roundBids.reduce((max: number, b: any) => b.bid_amount > max ? b.bid_amount : max, 0);
    return {
      auction_id: a.id,
      item_id: a.item_id,
      item_name: item?.name ?? "Unknown",
      image_url: item?.image_url,
      rarity: item?.rarity,
      dkp_cost: a.dkp_cost ?? 0,
      winner_name: winner?.name ?? null,
      winning_bid: winner?.amount ?? highestBid,
      bid_count: roundBids.length,
      started_at: roundBids.length > 0
        ? roundBids.reduce((min: string, b: any) => b.created_at < min ? b.created_at : min, roundBids[0].created_at)
        : a.created_at,
      resolved_at: roundBids.length > 0
        ? roundBids.reduce((max: string, b: any) => b.resolved_at > max ? b.resolved_at : max, roundBids[0].resolved_at)
        : a.created_at,
      auction_round: 1,
      distributed: false,
      guild_name: a.guild_id ? (guildMap.get(a.guild_id) ?? null) : null,
    };
  }).sort((a, b) => new Date(b.resolved_at).getTime() - new Date(a.resolved_at).getTime());
}

export async function deletePastAuction(itemId: string, auctionRound: number): Promise<void> {
  const { error } = await supabase.rpc("delete_auction_round", {
    p_item_id: itemId,
    p_auction_round: auctionRound,
  });
  if (error) throw error;
}

export async function toggleItemDistributed(itemId: string, auctionRound: number, distributed: boolean): Promise<void> {
  const { error } = await supabase.rpc("toggle_item_distributed", {
    p_item_id: itemId,
    p_auction_round: auctionRound,
    p_distributed: distributed,
  });
  if (error) throw error;
}

// ── DKP Config ──────────────────────────────────────────────

export async function getDkpConfig(serverId: string): Promise<DkpConfig | null> {
  const { data, error } = await supabase
    .from("dkp_config")
    .select("*")
    .eq("server_id", serverId)
    .maybeSingle();
  if (error) throw error;
  return data as DkpConfig | null;
}

export async function saveDkpConfig(serverId: string, updates: Partial<DkpConfig>): Promise<void> {
  const { error } = await supabase
    .from("dkp_config")
    .upsert({ server_id: serverId, ...updates, updated_at: new Date().toISOString() });
  if (error) throw error;
}
