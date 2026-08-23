// ── Live bidding events ──────────────────────────────────────
//
// place_bid returns — and broadcasts on the server's private `dkp:<serverId>`
// topic — one compact event describing the complete post-bid auction state.
// This module applies that event directly to the React Query caches, replacing
// the old flow where every bid invalidated four query keys and every connected
// client fired ~5 HTTP refetches.
//
// The reducer is deliberately a pure cache transform: no fetching. The only
// invalidations it issues are for the (at most two) members whose balance the
// bid actually moved, and for the transient per-auction bids modal if open.

import type { QueryClient } from "@tanstack/react-query";
import type { ActiveAuction, DkpBid } from "@/lib/api/dkp";

/** Payload of a `bid` broadcast, also the return value of place_bid. */
export interface BidEvent {
  auctionId: string;
  itemId: string;
  itemName: string;
  bidId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  highestBid: number;
  bidCount: number;
  previousBidderId?: string | null;
  previousBidderRefund?: number | null;
  bidEndTime: string;
  serverId: string;
  ts: string;
}

/** Payload of a `sync` broadcast — rare lifecycle beats. Since the hardening
 *  pass these carry enough state to patch caches instead of forcing refetches;
 *  the optional fields are absent only on events from the pre-hardening RPCs. */
export interface SyncEvent {
  kind: "auction_created" | "auction_resolved" | "bid_cancelled";
  auctionId: string;
  /** auction_resolved: true when the auction was cancelled rather than won. */
  cancelled?: boolean;
  winnerId?: string | null;
  winnerName?: string | null;
  winningBid?: number | null;
  bidCount?: number | null;
  /** Members whose escrowed DKP was returned by this resolution. */
  refundedMemberIds?: string[] | null;
  /** bid_cancelled: the recomputed ladder top after the cancellation. */
  highestBid?: number | null;
  highestBidderId?: string | null;
  cancelledMemberId?: string | null;
  ts?: string;
}

/** Shape of the rows in the past-auctions cache (mirrors dkp.ts PastAuction). */
interface PastAuctionRow {
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

export interface ApplyResult {
  /** True when this event dethroned the local member — caller may toast. */
  outbidMe: boolean;
  /** True when the event was stale (already applied) and nothing changed. */
  stale: boolean;
}

const updateAuction = (a: ActiveAuction, evt: BidEvent): ActiveAuction => ({
  ...a,
  highest_bid: evt.highestBid,
  bid_count: evt.bidCount,
  top_bidder_member_id: evt.bidderId,
  bid_end_time: evt.bidEndTime,
});

/**
 * Apply one bid event to every cache that renders auction state.
 *
 * Idempotent: the bidder receives the event twice (once as the RPC return,
 * once as the broadcast echo). Staleness is judged by highest_bid, which the
 * strict greater-than rule makes strictly monotonic per auction — bid_count is
 * NOT monotonic (a re-bid replaces the member's own bid and leaves it flat).
 */
export function applyBidEvent(
  queryClient: QueryClient,
  serverId: string,
  myMemberId: string | null,
  evt: BidEvent,
): ApplyResult {
  let stale = false;

  // Live auction list.
  queryClient.setQueryData<ActiveAuction[]>(["dkp_active_auctions", serverId], (old) => {
    if (!old) return old;
    return old.map((a) => {
      if (a.auction_id !== evt.auctionId) return a;
      if (a.highest_bid >= evt.highestBid) { stale = true; return a; }
      return updateAuction(a, evt);
    });
  });

  if (!stale) {
    // Theater header (single-auction view).
    queryClient.setQueryData<ActiveAuction | null>(
      ["dkp_theater_auction", serverId, evt.auctionId],
      (old) => (old ? updateAuction(old, evt) : old),
    );

    // Theater bid feed — per-auction since the get_auction_bids change. Mirror
    // what the database just did: the bidder's replaced bid is cancelled
    // (drops out of the feed), the dethroned leader's goes to 'lost', the new
    // bid leads.
    queryClient.setQueryData<DkpBid[]>(["dkp_theater_bids", serverId, evt.auctionId], (old) => {
      if (!old) return old;
      if (old.some((b) => b.id === evt.bidId)) return old;
      const next: DkpBid[] = old
        .filter((b) => !(b.member_id === evt.bidderId && b.status === "active"))
        .map((b) =>
          b.member_id === evt.previousBidderId && b.status === "active"
            ? { ...b, status: "lost" }
            : b,
        );
      next.unshift({
        id: evt.bidId,
        item_id: evt.itemId,
        item_name: evt.itemName,
        auction_id: evt.auctionId,
        member_id: evt.bidderId,
        member_name: evt.bidderName,
        bid_amount: evt.amount,
        status: "active",
        created_at: evt.ts,
      });
      return next;
    });

    // Per-auction bids modal: transient, unbounded statuses — a targeted
    // refetch of one small indexed query beats replicating its shape here.
    queryClient.invalidateQueries({ queryKey: ["auction_bids", evt.auctionId] });
  }

  // Balances and ledgers move for at most two members. Everyone else's caches
  // are untouched — this is the line that makes load O(1) per bid instead of
  // O(players).
  const involved =
    myMemberId != null && (myMemberId === evt.bidderId || myMemberId === evt.previousBidderId);
  if (involved && !stale) {
    queryClient.invalidateQueries({ queryKey: ["dkp_balance"] });
    queryClient.invalidateQueries({ queryKey: ["dkp_history"] });
  }

  return {
    outbidMe: !stale && myMemberId != null && myMemberId === evt.previousBidderId,
    stale,
  };
}

/**
 * Apply one sync (lifecycle) event. Resolution and cancellation patch the
 * caches directly — removing the auction from the live list and prepending a
 * constructed row to past auctions — so mass expiry of same-deadline auctions
 * no longer makes every client refetch four query keys. Refetch remains only
 * where state genuinely cannot be derived: auction_created (a new row this
 * client has never seen), or a resolved auction missing from the local cache.
 */
export function applySyncEvent(
  queryClient: QueryClient,
  serverId: string,
  myMemberId: string | null,
  evt: SyncEvent,
): void {
  if (evt.kind === "auction_created") {
    queryClient.invalidateQueries({ queryKey: ["dkp_active_auctions", serverId] });
    return;
  }

  if (evt.kind === "bid_cancelled") {
    if (evt.highestBid != null) {
      const patch = (a: ActiveAuction): ActiveAuction =>
        a.auction_id !== evt.auctionId ? a : {
          ...a,
          highest_bid: evt.highestBid ?? 0,
          top_bidder_member_id: evt.highestBidderId ?? null,
          bid_count: evt.bidCount ?? a.bid_count,
        };
      queryClient.setQueryData<ActiveAuction[]>(["dkp_active_auctions", serverId],
        (old) => old?.map(patch));
      queryClient.setQueryData<ActiveAuction | null>(["dkp_theater_auction", serverId, evt.auctionId],
        (old) => (old ? patch(old) : old));
      queryClient.invalidateQueries({ queryKey: ["dkp_theater_bids", serverId, evt.auctionId] });
    } else {
      // Pre-hardening event without state: targeted refetch.
      queryClient.invalidateQueries({ queryKey: ["dkp_active_auctions", serverId] });
    }
    if (myMemberId != null && myMemberId === evt.cancelledMemberId) {
      queryClient.invalidateQueries({ queryKey: ["dkp_balance"] });
      queryClient.invalidateQueries({ queryKey: ["dkp_history"] });
    }
    return;
  }

  // auction_resolved (won or cancelled).
  let source: ActiveAuction | undefined;
  queryClient.setQueryData<ActiveAuction[]>(["dkp_active_auctions", serverId], (old) => {
    if (!old) return old;
    source = old.find((a) => a.auction_id === evt.auctionId);
    return source ? old.filter((a) => a.auction_id !== evt.auctionId) : old;
  });

  const past = queryClient.getQueryData<PastAuctionRow[]>(["dkp_past_auctions", serverId]);
  if (source && past && !past.some((p) => p.auction_id === evt.auctionId)) {
    const row: PastAuctionRow = {
      auction_id: evt.auctionId,
      item_id: source.item_id,
      item_name: source.item_name,
      image_url: source.image_url,
      rarity: source.rarity,
      dkp_cost: source.dkp_cost,
      winner_name: evt.cancelled ? null : evt.winnerName ?? null,
      winning_bid: evt.cancelled ? 0 : evt.winningBid ?? source.highest_bid,
      bid_count: evt.bidCount ?? source.bid_count,
      started_at: source.created_at,
      resolved_at: evt.ts ?? new Date().toISOString(),
      auction_round: 1,
      distributed: false,
      guild_name: source.guild_name,
    };
    queryClient.setQueryData<PastAuctionRow[]>(["dkp_past_auctions", serverId], [row, ...past]);
  } else if (!source) {
    // Auction unknown locally (older event, or list never loaded): fall back
    // to targeted refetches of the two affected lists.
    queryClient.invalidateQueries({ queryKey: ["dkp_active_auctions", serverId] });
    queryClient.invalidateQueries({ queryKey: ["dkp_past_auctions", serverId] });
  }

  // Balance moved only for members this resolution refunded.
  if (myMemberId != null && (evt.refundedMemberIds ?? []).includes(myMemberId)) {
    queryClient.invalidateQueries({ queryKey: ["dkp_balance"] });
    queryClient.invalidateQueries({ queryKey: ["dkp_history"] });
  }
}

// ── Bid error mapping ────────────────────────────────────────
//
// place_bid raises machine-readable prefixes ("BID_TOO_LOW: ..."). Concurrency
// aborts surface as Postgres error codes. Everything the user can act on gets
// its own message instead of a generic "failed to bid".

export type BidErrorCode =
  | "BID_TOO_LOW"
  | "INSUFFICIENT_DKP"
  | "AUCTION_CLOSED"
  | "AUCTION_NOT_FOUND"
  | "NOT_CLAIMED"
  | "GUILD_RESTRICTED"
  | "INVALID_AMOUNT"
  | "CONCURRENT_CONFLICT"
  | "NETWORK"
  | "UNKNOWN";

export interface BidError {
  code: BidErrorCode;
  message: string;
  /** The auction state is known-stale for these — caller should refetch it. */
  refreshAuctions: boolean;
}

const PREFIXES: BidErrorCode[] = [
  "BID_TOO_LOW", "INSUFFICIENT_DKP", "AUCTION_CLOSED", "AUCTION_NOT_FOUND",
  "NOT_CLAIMED", "GUILD_RESTRICTED", "INVALID_AMOUNT",
];

export function mapBidError(err: unknown): BidError {
  const e = err as { message?: string; code?: string } | null;
  const raw = e?.message ?? "";

  for (const code of PREFIXES) {
    if (raw.startsWith(code)) {
      const detail = raw.slice(code.length).replace(/^:\s*/, "");
      return {
        code,
        message:
          code === "AUCTION_CLOSED" ? "Bidding has ended for this item." :
          code === "AUCTION_NOT_FOUND" ? "This auction no longer exists." :
          detail || raw,
        // A too-low bid means our local highest is behind reality.
        refreshAuctions: code === "BID_TOO_LOW" || code === "AUCTION_CLOSED" || code === "AUCTION_NOT_FOUND",
      };
    }
  }

  // Serialization failure / deadlock: the transaction lost a concurrency race.
  if (e?.code === "40001" || e?.code === "40P01" || /deadlock detected/i.test(raw)) {
    return {
      code: "CONCURRENT_CONFLICT",
      message: "Another bid landed at the same moment — check the new highest bid and try again.",
      refreshAuctions: true,
    };
  }

  if (/Failed to fetch|NetworkError|network|fetch failed/i.test(raw)) {
    return {
      code: "NETWORK",
      message: "Network problem — the bid may not have been sent. Check your connection and retry.",
      refreshAuctions: true,
    };
  }

  return { code: "UNKNOWN", message: raw || "Failed to place bid.", refreshAuctions: false };
}
