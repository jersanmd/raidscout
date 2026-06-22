import { supabase } from "./client";

// ── Types ───────────────────────────────────────────────────

export interface DkpBalance {
  balance: number;
  earned_this_week: number;
  spent_this_week: number;
}

export interface DkpTransaction {
  id: string;
  amount: number;
  type: string;
  reason: string | null;
  created_at: string;
}

export interface DkpRanking {
  member_id: string;
  member_name: string;
  balance: number;
  rank: number;
}

export interface DkpBid {
  id: string;
  item_id: string;
  item_name: string;
  member_id: string;
  member_name: string;
  bid_amount: number;
  status: string;
  created_at: string;
}

export interface ItemBid {
  id: string;
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
  return (data?.[0] ?? { balance: 0, earned_this_week: 0, spent_this_week: 0 }) as DkpBalance;
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
  bidEndTime?: string | null,
  durationMinutes?: number
): Promise<void> {
  const { error } = await supabase.rpc("mark_item_for_bid", {
    p_item_id: itemId,
    p_dkp_cost: dkpCost,
    p_bid_end_time: bidEndTime ?? null,
    p_duration_minutes: durationMinutes ?? null,
  });
  if (error) throw error;
}

export async function unmarkItemFromBid(itemId: string): Promise<void> {
  const { error } = await supabase.rpc("unmark_item_from_bid", {
    p_item_id: itemId,
  });
  if (error) throw error;
}

export async function placeBid(itemId: string, amount: number): Promise<string> {
  const { data, error } = await supabase.rpc("place_bid", {
    p_item_id: itemId,
    p_amount: amount,
  });
  if (error) throw error;
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

export async function resolveAuction(itemId: string, winnerBidId?: string | null): Promise<void> {
  const { error } = await supabase.rpc("resolve_auction", {
    p_item_id: itemId,
    p_winner_bid_id: winnerBidId ?? null,
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
  item_id: string;
  item_name: string;
  image_url: string | null;
  rarity: string | null;
  dkp_cost: number;
  bid_end_time: string;
  highest_bid: number;
  bid_count: number;
  top_bidder_member_id: string | null;
}

export async function getActiveAuctions(serverId: string): Promise<ActiveAuction[]> {
  // Get server game slug for cross-server item lookup
  const { data: sv } = await supabase.from("servers").select("game").eq("id", serverId).single();
  const gameSlug = sv?.game ?? undefined;

  // Query items marked for bid (not expired) — include game-catalog items
  const { data: items } = await supabase.from("items")
    .select("id, name, image_url, rarity, dkp_cost, bid_end_time")
    .or(gameSlug ? `game.eq.${gameSlug},server_id.eq.${serverId}` : `server_id.eq.${serverId}`)
    .eq("is_up_for_bid", true)
    .gt("bid_end_time", new Date().toISOString())
    .order("bid_end_time", { ascending: true });

  // Use SECURITY DEFINER RPC to get bid aggregates (bypasses RLS)
  const bids = await getActiveBids(serverId);

  const bidMap: Record<string, { total: number; highest: number; topBidderId: string | null }> = {};
  bids.forEach((b: DkpBid) => {
    const e = bidMap[b.item_id] || { total: 0, highest: 0, topBidderId: null };
    e.total++;
    if (b.bid_amount > e.highest) { e.highest = b.bid_amount; e.topBidderId = b.member_id; }
    bidMap[b.item_id] = e;
  });

  return (items || []).map((i: any) => ({
    item_id: i.id,
    item_name: i.name,
    image_url: i.image_url,
    rarity: i.rarity,
    dkp_cost: i.dkp_cost ?? 0,
    bid_end_time: i.bid_end_time,
    highest_bid: bidMap[i.id]?.highest ?? 0,
    bid_count: bidMap[i.id]?.total ?? 0,
    top_bidder_member_id: bidMap[i.id]?.topBidderId ?? null,
  }));
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
