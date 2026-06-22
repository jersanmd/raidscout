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
}

export async function getActiveAuctions(serverId: string): Promise<ActiveAuction[]> {
  const { data, error } = await supabase.rpc("get_active_auctions", {
    p_server_id: serverId,
  });
  if (error) throw error;
  return (data as ActiveAuction[]) ?? [];
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
