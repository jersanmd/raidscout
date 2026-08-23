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

/** Payload of a `sync` broadcast — rare lifecycle beats where a refetch is fine. */
export interface SyncEvent {
  kind: "auction_created" | "auction_resolved" | "bid_cancelled";
  auctionId: string;
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
 * once as the broadcast echo), so a bid_count that has already caught up is
 * treated as stale and skipped.
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
      if (a.bid_count >= evt.bidCount) { stale = true; return a; }
      return updateAuction(a, evt);
    });
  });

  if (!stale) {
    // Theater header (single-auction view).
    queryClient.setQueryData<ActiveAuction | null>(
      ["dkp_theater_auction", serverId, evt.auctionId],
      (old) => (old ? updateAuction(old, evt) : old),
    );

    // Theater bid feed (active + lost bids, newest first). Mirror what the
    // database just did: the bidder's replaced bid is cancelled (drops out of
    // the feed), the dethroned leader's bid goes to 'lost', the new bid leads.
    queryClient.setQueryData<DkpBid[]>(["dkp_theater_bids", serverId], (old) => {
      if (!old) return old;
      if (old.some((b) => b.id === evt.bidId)) return old;
      const next: DkpBid[] = old
        .filter((b) => !(b.auction_id === evt.auctionId && b.member_id === evt.bidderId && b.status === "active"))
        .map((b) =>
          b.auction_id === evt.auctionId && b.member_id === evt.previousBidderId && b.status === "active"
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
