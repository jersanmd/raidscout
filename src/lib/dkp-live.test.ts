import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { applyBidEvent, applySyncEvent, mapBidError, type BidEvent, type SyncEvent } from "./dkp-live";
import type { ActiveAuction, DkpBid } from "@/lib/api/dkp";

const SERVER = "srv-1";
const AUCTION = "auc-1";

const auction = (over: Partial<ActiveAuction> = {}): ActiveAuction => ({
  auction_id: AUCTION,
  item_id: "item-1",
  item_name: "Serus Scythe",
  image_url: null,
  rarity: "legendary",
  dkp_cost: 10,
  bid_end_time: "2026-08-23T12:00:00Z",
  highest_bid: 100,
  bid_count: 3,
  top_bidder_member_id: "alice",
  guild_id: null,
  guild_name: null,
  quantity: 1,
  created_at: "2026-08-23T10:00:00Z",
  ...over,
});

const bidRow = (over: Partial<DkpBid> = {}): DkpBid => ({
  id: "bid-old",
  item_id: "item-1",
  item_name: "Serus Scythe",
  auction_id: AUCTION,
  member_id: "alice",
  member_name: "Alice",
  bid_amount: 100,
  status: "active",
  created_at: "2026-08-23T10:30:00Z",
  ...over,
});

const event = (over: Partial<BidEvent> = {}): BidEvent => ({
  auctionId: AUCTION,
  itemId: "item-1",
  itemName: "Serus Scythe",
  bidId: "bid-new",
  bidderId: "bob",
  bidderName: "Bob",
  amount: 120,
  highestBid: 120,
  bidCount: 4,
  previousBidderId: "alice",
  previousBidderRefund: 100,
  bidEndTime: "2026-08-23T12:04:00Z",
  serverId: SERVER,
  ts: "2026-08-23T11:58:00Z",
  ...over,
});

describe("applyBidEvent", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData<ActiveAuction[]>(["dkp_active_auctions", SERVER], [auction()]);
    qc.setQueryData<ActiveAuction | null>(["dkp_theater_auction", SERVER, AUCTION], auction());
    qc.setQueryData<DkpBid[]>(["dkp_theater_bids", SERVER, AUCTION], [bidRow()]);
  });

  it("updates the auction list in place: highest bid, count, leader, deadline", () => {
    applyBidEvent(qc, SERVER, null, event());
    const [a] = qc.getQueryData<ActiveAuction[]>(["dkp_active_auctions", SERVER])!;
    expect(a.highest_bid).toBe(120);
    expect(a.bid_count).toBe(4);
    expect(a.top_bidder_member_id).toBe("bob");
    expect(a.bid_end_time).toBe("2026-08-23T12:04:00Z"); // soft-close extension propagates
  });

  it("marks the dethroned leader's feed row lost and prepends the new bid", () => {
    applyBidEvent(qc, SERVER, null, event());
    const feed = qc.getQueryData<DkpBid[]>(["dkp_theater_bids", SERVER, AUCTION])!;
    expect(feed[0]).toMatchObject({ id: "bid-new", member_id: "bob", bid_amount: 120, status: "active" });
    expect(feed.find((b) => b.member_id === "alice")!.status).toBe("lost");
  });

  it("drops the bidder's own replaced bid from the feed (it was cancelled)", () => {
    qc.setQueryData<DkpBid[]>(["dkp_theater_bids", SERVER, AUCTION], [
      bidRow({ id: "bid-bob-old", member_id: "bob", member_name: "Bob", bid_amount: 90 }),
      bidRow(),
    ]);
    applyBidEvent(qc, SERVER, null, event());
    const feed = qc.getQueryData<DkpBid[]>(["dkp_theater_bids", SERVER, AUCTION])!;
    expect(feed.some((b) => b.id === "bid-bob-old")).toBe(false);
    expect(feed[0].id).toBe("bid-new");
  });

  it("is idempotent: the broadcast echo after the RPC return is a no-op", () => {
    const first = applyBidEvent(qc, SERVER, null, event());
    const echo = applyBidEvent(qc, SERVER, null, event());
    expect(first.stale).toBe(false);
    expect(echo.stale).toBe(true);
    const feed = qc.getQueryData<DkpBid[]>(["dkp_theater_bids", SERVER, AUCTION])!;
    expect(feed.filter((b) => b.id === "bid-new")).toHaveLength(1);
  });

  it("applies a re-bid whose bidCount is unchanged (dedup keys on highestBid, not count)", () => {
    // A self-replacement swaps a ladder row, so bidCount stays flat while the
    // (strictly monotonic) highest bid rises. Keying staleness on bidCount
    // would wrongly drop this real event.
    applyBidEvent(qc, SERVER, null, event());
    const rebid = applyBidEvent(qc, SERVER, null,
      event({ bidId: "bid-rebid", amount: 150, highestBid: 150, bidCount: 4 }));
    expect(rebid.stale).toBe(false);
    const [a] = qc.getQueryData<ActiveAuction[]>(["dkp_active_auctions", SERVER])!;
    expect(a.highest_bid).toBe(150);
    expect(a.bid_count).toBe(4);
  });

  it("ignores events for auctions not in the cache without corrupting others", () => {
    applyBidEvent(qc, SERVER, null, event({ auctionId: "other", bidCount: 99 }));
    const [a] = qc.getQueryData<ActiveAuction[]>(["dkp_active_auctions", SERVER])!;
    expect(a.highest_bid).toBe(100);
  });

  it("flags outbidMe only for the dethroned member", () => {
    expect(applyBidEvent(qc, SERVER, "alice", event()).outbidMe).toBe(true);
    qc.setQueryData<ActiveAuction[]>(["dkp_active_auctions", SERVER], [auction()]);
    expect(applyBidEvent(qc, SERVER, "carol", event()).outbidMe).toBe(false);
  });

  it("invalidates balance only for involved members", () => {
    qc.setQueryData(["dkp_balance", "carol", SERVER], { balance: 50 });
    applyBidEvent(qc, SERVER, "carol", event());
    // Carol is a spectator: her balance query must not be marked stale.
    expect(qc.getQueryState(["dkp_balance", "carol", SERVER])!.isInvalidated).toBe(false);

    qc.setQueryData<ActiveAuction[]>(["dkp_active_auctions", SERVER], [auction()]);
    qc.setQueryData(["dkp_balance", "bob", SERVER], { balance: 500 });
    applyBidEvent(qc, SERVER, "bob", event({ bidCount: 5 }));
    expect(qc.getQueryState(["dkp_balance", "bob", SERVER])!.isInvalidated).toBe(true);
  });
});

describe("applySyncEvent", () => {
  let qc: QueryClient;

  const resolved = (over: Partial<SyncEvent> = {}): SyncEvent => ({
    kind: "auction_resolved",
    auctionId: AUCTION,
    cancelled: false,
    winnerId: "bob",
    winnerName: "Bob",
    winningBid: 120,
    bidCount: 4,
    refundedMemberIds: [],
    ts: "2026-08-23T12:05:00Z",
    ...over,
  });

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData<ActiveAuction[]>(["dkp_active_auctions", SERVER], [auction()]);
    qc.setQueryData(["dkp_past_auctions", SERVER], []);
  });

  it("resolution removes the auction from the live list and prepends a past row — no refetch", () => {
    applySyncEvent(qc, SERVER, null, resolved());
    expect(qc.getQueryData<ActiveAuction[]>(["dkp_active_auctions", SERVER])).toHaveLength(0);
    const past = qc.getQueryData<any[]>(["dkp_past_auctions", SERVER])!;
    expect(past[0]).toMatchObject({
      auction_id: AUCTION, item_name: "Serus Scythe",
      winner_name: "Bob", winning_bid: 120, bid_count: 4, distributed: false,
    });
    expect(qc.getQueryState(["dkp_active_auctions", SERVER])!.isInvalidated).toBe(false);
    expect(qc.getQueryState(["dkp_past_auctions", SERVER])!.isInvalidated).toBe(false);
  });

  it("cancellation records no winner", () => {
    applySyncEvent(qc, SERVER, null, resolved({ cancelled: true, refundedMemberIds: ["alice"] }));
    const past = qc.getQueryData<any[]>(["dkp_past_auctions", SERVER])!;
    expect(past[0].winner_name).toBeNull();
    expect(past[0].winning_bid).toBe(0);
  });

  it("refreshes balance only for refunded members", () => {
    qc.setQueryData(["dkp_balance", "alice", SERVER], { balance: 0 });
    qc.setQueryData(["dkp_balance", "carol", SERVER], { balance: 5 });
    applySyncEvent(qc, SERVER, "carol", resolved({ cancelled: true, refundedMemberIds: ["alice"] }));
    expect(qc.getQueryState(["dkp_balance", "carol", SERVER])!.isInvalidated).toBe(false);

    qc.setQueryData<ActiveAuction[]>(["dkp_active_auctions", SERVER], [auction()]);
    applySyncEvent(qc, SERVER, "alice", resolved({ cancelled: true, refundedMemberIds: ["alice"] }));
    expect(qc.getQueryState(["dkp_balance", "alice", SERVER])!.isInvalidated).toBe(true);
  });

  it("falls back to targeted refetch when the auction is unknown locally", () => {
    applySyncEvent(qc, SERVER, null, resolved({ auctionId: "unknown" }));
    expect(qc.getQueryState(["dkp_active_auctions", SERVER])!.isInvalidated).toBe(true);
    expect(qc.getQueryData<any[]>(["dkp_past_auctions", SERVER])).toHaveLength(0);
  });

  it("bid_cancelled patches the recomputed ladder top in place", () => {
    applySyncEvent(qc, SERVER, null, {
      kind: "bid_cancelled", auctionId: AUCTION,
      highestBid: 0, highestBidderId: null, bidCount: 2, cancelledMemberId: "alice",
    });
    const [a] = qc.getQueryData<ActiveAuction[]>(["dkp_active_auctions", SERVER])!;
    expect(a.highest_bid).toBe(0);
    expect(a.top_bidder_member_id).toBeNull();
    expect(a.bid_count).toBe(2);
    expect(qc.getQueryState(["dkp_active_auctions", SERVER])!.isInvalidated).toBe(false);
  });
});

describe("mapBidError", () => {
  it("maps coded server errors and keeps their detail", () => {
    const e = mapBidError({ message: "BID_TOO_LOW: current highest is 120 — bid at least 121" });
    expect(e.code).toBe("BID_TOO_LOW");
    expect(e.message).toContain("121");
    expect(e.refreshAuctions).toBe(true);
  });

  it("maps insufficient funds without forcing a refetch", () => {
    const e = mapBidError({ message: "INSUFFICIENT_DKP: you have 40 DKP available" });
    expect(e.code).toBe("INSUFFICIENT_DKP");
    expect(e.refreshAuctions).toBe(false);
  });

  it("maps closed auctions to a friendly message", () => {
    expect(mapBidError({ message: "AUCTION_CLOSED: bidding has ended" }).message)
      .toBe("Bidding has ended for this item.");
  });

  it("treats serialization failures and deadlocks as retryable races", () => {
    expect(mapBidError({ message: "x", code: "40001" }).code).toBe("CONCURRENT_CONFLICT");
    expect(mapBidError({ message: "deadlock detected", code: "40P01" }).code).toBe("CONCURRENT_CONFLICT");
  });

  it("distinguishes network failures", () => {
    expect(mapBidError(new TypeError("Failed to fetch")).code).toBe("NETWORK");
  });

  it("falls back to the raw message for unknown errors", () => {
    const e = mapBidError({ message: "something odd" });
    expect(e.code).toBe("UNKNOWN");
    expect(e.message).toBe("something odd");
  });
});
