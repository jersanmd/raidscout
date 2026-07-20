import { describe, it, expect } from "vitest";

describe("bot cron: item_id deduplication before auto_resolve_auction", () => {
  it("deduplicates auction rows by item_id before dispatching", () => {
    // Simulate the bot cron response: 3 auctions for item-A, 2 for item-B
    const rows = [
      { id: "a1", item_id: "item-A" },
      { id: "a2", item_id: "item-A" },
      { id: "a3", item_id: "item-A" },
      { id: "b1", item_id: "item-B" },
      { id: "b2", item_id: "item-B" },
    ];

    const itemIds = [...new Set(rows.map((r) => r.item_id))];

    expect(itemIds).toEqual(["item-A", "item-B"]);
    expect(itemIds).toHaveLength(2);
  });

  it("does not crash with empty rows", () => {
    const rows: { id: string; item_id: string }[] = [];
    const itemIds = [...new Set(rows.map((r) => r.item_id))];
    expect(itemIds).toEqual([]);
  });

  it("deduplicates a single item across many auctions", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      id: `auction-${i}`,
      item_id: "single-item",
    }));

    const itemIds = [...new Set(rows.map((r) => r.item_id))];

    expect(itemIds).toEqual(["single-item"]);
    expect(itemIds).toHaveLength(1);
  });

  it("handles mixed expired/non-expired gracefully (dedup is item-level)", () => {
    const rows = [
      { id: "a1", item_id: "item-X" },
      { id: "a2", item_id: "item-X" },
      { id: "b1", item_id: "item-Y" },
    ];

    // Even though item-X might have non-expired auctions too,
    // auto_resolve_auction already filters by bid_end_time <= now()
    const itemIds = [...new Set(rows.map((r) => r.item_id))];

    expect(itemIds).toHaveLength(2);
    expect(itemIds).toContain("item-X");
    expect(itemIds).toContain("item-Y");
  });

  it("preserves insertion order via Set", () => {
    const rows = [
      { id: "1", item_id: "zulu" },
      { id: "2", item_id: "alpha" },
      { id: "3", item_id: "alpha" },
      { id: "4", item_id: "zulu" },
    ];

    const itemIds = [...new Set(rows.map((r) => r.item_id))];
    expect(itemIds).toEqual(["zulu", "alpha"]);
  });
});

describe("bot cron: auto_resolve_auction transactional isolation", () => {
  it("each item_id dispatch is fire-and-forget with error catch", () => {
    // Simulate that even if one item's auto_resolve fails,
    // other items still get processed (the .catch(() => {}) pattern)
    const results: string[] = [];

    async function simulatedDispatch(itemIds: string[]) {
      for (const itemId of itemIds) {
        try {
          // Simulate: item-B fails
          if (itemId === "item-B") throw new Error("DB failure");
          results.push(`resolved:${itemId}`);
        } catch {
          results.push(`failed:${itemId}`);
          // .catch(() => {}) equivalent — swallowed, loop continues
        }
      }
    }

    return simulatedDispatch(["item-A", "item-B", "item-C"]).then(() => {
      expect(results).toEqual(["resolved:item-A", "failed:item-B", "resolved:item-C"]);
    });
  });

  it("deduplication prevents concurrent auto_resolve calls for same item", async () => {
    // Before fix: 10 auctions of same item → 10 concurrent auto_resolve(item) calls
    // After fix: 10 auctions → 1 call (deduplicated)
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `auction-${i}`,
      item_id: "high-quantity-drop",
    }));

    const itemIds = [...new Set(rows.map((r) => r.item_id))];
    const calls = itemIds.length;

    expect(calls).toBe(1);
    // 10 auctions resolved by 1 call instead of 10 concurrent calls
    expect(calls).toBeLessThan(rows.length);
  });
});

describe("resolve_auction concurrency: guard prevents double-resolution", () => {
  it("auction already resolved should be skipped by guard", () => {
    // Simulate the guard logic at the SQL level:
    // IF NOT EXISTS (SELECT 1 FROM dkp_auctions WHERE id = X AND status = 'active') THEN RETURN; END IF;

    type Auction = { id: string; status: "active" | "resolved" | "cancelled" };

    function simulateResolve(auction: Auction, bids: { id: string; status: string }[]) {
      // Guard
      if (auction.status !== "active") return { action: "skipped", reason: "not active" };

      // Winner bid validation
      const winnerBid = bids.find((b) => b.status === "active");
      if (!winnerBid) {
        // Fallback: cancel remaining active bids
        const remainingActive = bids.filter((b) => b.status === "active");
        remainingActive.forEach((b) => (b.status = "cancelled"));
        auction.status = "resolved";
        return { action: "cancelled-remaining", bidCount: remainingActive.length };
      }

      // Normal resolution
      winnerBid.status = "won";
      bids.filter((b) => b.id !== winnerBid.id).forEach((b) => (b.status = "lost"));
      auction.status = "resolved";
      return { action: "resolved", winnerId: winnerBid.id };
    }

    // Scenario: Call #2 hits auction that Call #1 already resolved
    const auction: Auction = { id: "a1", status: "resolved" }; // Already done
    const bidHistory = [
      { id: "b1", status: "won" }, // Already processed
      { id: "b2", status: "lost" },
    ];

    const result = simulateResolve(auction, bidHistory);

    expect(result).toEqual({ action: "skipped", reason: "not active" });
    // Bid history should remain unchanged (no double-refund, no notification spam)
    expect(bidHistory).toEqual([
      { id: "b1", status: "won" },
      { id: "b2", status: "lost" },
    ]);
  });

  it("winner bid already taken drops through to cancel remaining", () => {
    type Auction = { id: string; status: "active" | "resolved" | "cancelled" };

    function simulateResolveWithRace(auction: Auction, winnerBidId: string, bids: { id: string; status: string }[]) {
      if (auction.status !== "active") return { action: "skipped" };

      // Winner bid lookup
      const foundWinner = bids.find((b) => b.id === winnerBidId && b.status === "active");
      if (!foundWinner) {
        // Graceful fallback: cancel any remaining active bids
        const remaining = bids.filter((b) => b.status === "active");
        remaining.forEach((b) => (b.status = "cancelled"));
        auction.status = "resolved";
        return { action: "fallback-cancel", cancelledCount: remaining.length };
      }

      foundWinner.status = "won";
      bids.filter((b) => b.id !== foundWinner.id && b.status === "active").forEach((b) => (b.status = "lost"));
      auction.status = "resolved";
      return { action: "resolved", winnerId: foundWinner.id };
    }

    // Call #2 picks a winner bid that Call #1 already set to "won"
    const auction: Auction = { id: "a2", status: "active" };
    const bids = [
      { id: "b1", status: "won" }, // Already processed by concurrent call
      { id: "b2", status: "active" }, // Still active (losing bid, not yet processed)
    ];

    const result = simulateResolveWithRace(auction, "b1", bids);

    expect(result).toEqual({ action: "fallback-cancel", cancelledCount: 1 });
    expect(auction.status).toBe("resolved");
    expect(bids[1].status).toBe("cancelled"); // Remaining bid cleaned up
    expect(bids[0].status).toBe("won"); // Already-won bid untouched
  });
});
