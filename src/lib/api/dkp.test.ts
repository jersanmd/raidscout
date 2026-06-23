import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock("@/lib/api/client", () => ({
  supabase: {
    rpc: mockRpc,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
  supabaseUrl: "https://test.supabase.co",
  supabaseKey: "test-key",
  getCurrentServerId: vi.fn().mockReturnValue("server-1"),
}));

import {
  getMemberDkp,
  getServerDkpRankings,
  getMemberDkpHistory,
  getActiveBids,
  markItemForBid,
  placeBid,
  cancelBid,
  resolveAuction,
  getDkpConfig,
  saveDkpConfig,
  adjustMemberDkp,
} from "@/lib/api/dkp";

describe("DKP API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMemberDkp", () => {
    it("returns balance for a member", async () => {
      mockRpc.mockResolvedValueOnce({ data: [{ balance: 150, earned_this_week: 50, spent_this_week: 20 }], error: null });
      const result = await getMemberDkp("member-1", "server-1");
      expect(result.balance).toBe(150);
      expect(result.earned_this_week).toBe(50);
      expect(mockRpc).toHaveBeenCalledWith("get_member_dkp", { p_member_id: "member-1", p_server_id: "server-1" });
    });

    it("returns zeros when no data", async () => {
      mockRpc.mockResolvedValueOnce({ data: [], error: null });
      const result = await getMemberDkp("member-1", "server-1");
      expect(result.balance).toBe(0);
      expect(result.earned_this_week).toBe(0);
    });

    it("throws on error", async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: "DB error" } });
      await expect(getMemberDkp("member-1", "server-1")).rejects.toThrow();
    });
  });

  describe("getServerDkpRankings", () => {
    it("returns rankings array", async () => {
      mockRpc.mockResolvedValueOnce({ data: [{ member_id: "m1", member_name: "Player1", balance: 100, rank: 1 }], error: null });
      const result = await getServerDkpRankings("server-1");
      expect(result).toHaveLength(1);
      expect(result[0].member_name).toBe("Player1");
    });

    it("returns empty array when no data", async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });
      const result = await getServerDkpRankings("server-1");
      expect(result).toEqual([]);
    });
  });

  describe("getMemberDkpHistory", () => {
    it("returns transactions with pagination", async () => {
      mockRpc.mockResolvedValueOnce({ data: [{ id: "t1", amount: 50, type: "earn_kill", reason: "Boss kill", created_at: "2026-01-01" }], error: null });
      const result = await getMemberDkpHistory("member-1", "server-1", 20);
      expect(result).toHaveLength(1);
      expect(mockRpc).toHaveBeenCalledWith("get_member_dkp_history", expect.objectContaining({ p_limit: 20 }));
    });

    it("passes cursor when provided", async () => {
      mockRpc.mockResolvedValueOnce({ data: [], error: null });
      await getMemberDkpHistory("member-1", "server-1", 10, "2026-01-01");
      expect(mockRpc).toHaveBeenCalledWith("get_member_dkp_history", expect.objectContaining({ p_cursor: "2026-01-01" }));
    });
  });

  describe("markItemForBid", () => {
    it("marks item with end time", async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });
      await markItemForBid("item-1", 50, "server-1", "Test Item", "2026-12-31T23:59:00Z");
      expect(mockRpc).toHaveBeenCalledWith("mark_item_for_bid", expect.objectContaining({ p_item_id: "item-1", p_dkp_cost: 50 }));
    });

    it("marks item without end time (null)", async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });
      await markItemForBid("item-1", 50, "server-1", "Test Item", undefined);
      expect(mockRpc).toHaveBeenCalledWith("mark_item_for_bid", expect.objectContaining({ p_bid_end_time: null }));
    });
  });

  describe("placeBid", () => {
    it("places a bid and returns bid ID", async () => {
      mockRpc.mockResolvedValueOnce({ data: "bid-1", error: null });
      const result = await placeBid("item-1", 100, "server-1", "Test Item");
      expect(result).toBe("bid-1");
    });

    it("throws on insufficient DKP", async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: "Insufficient DKP" } });
      await expect(placeBid("item-1", 1000)).rejects.toThrow();
    });
  });

  describe("resolveAuction", () => {
    it("awards to winner", async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });
      await resolveAuction("item-1", "bid-1", "server-1", "Test Item");
      expect(mockRpc).toHaveBeenCalledWith("resolve_auction", { p_item_id: "item-1", p_winner_bid_id: "bid-1" });
    });

    it("cancels auction with null winner", async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });
      await resolveAuction("item-1", null, "server-1", "Test Item");
      expect(mockRpc).toHaveBeenCalledWith("resolve_auction", { p_item_id: "item-1", p_winner_bid_id: null });
    });
  });

  describe("adjustMemberDkp", () => {
    it("adjusts DKP with reason", async () => {
      mockRpc.mockResolvedValueOnce({ data: "txn-1", error: null });
      const result = await adjustMemberDkp("member-1", "server-1", 50, "Bonus");
      expect(result).toBe("txn-1");
    });
  });

  describe("saveDkpConfig", () => {
    it("upserts config", async () => {
      await saveDkpConfig("server-1", { enabled: true, dkp_multiplier: 1.5 });
      // Should not throw
    });
  });
});
