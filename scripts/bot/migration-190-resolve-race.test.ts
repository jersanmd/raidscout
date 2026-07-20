import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

function readMigration(name: string): string {
  const path = resolve(ROOT, "supabase", "migrations", name);
  expect(existsSync(path), `Migration ${name} not found`).toBe(true);
  return readFileSync(path, "utf-8");
}

const sql = readMigration("190_fix_batch_resolve_race.sql");

describe("migration 190: fix batch resolve race", () => {

  describe("resolve_auction", () => {
    it("drops old function before creating new one", () => {
      expect(sql).toContain("DROP FUNCTION IF EXISTS public.resolve_auction(uuid, uuid)");
      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.resolve_auction(p_auction_id UUID, p_winner_bid_id UUID DEFAULT NULL)");
    });

    it("has duplicate-resolution guard before FOR UPDATE lock", () => {
      expect(sql).toMatch(/IF NOT EXISTS.*dkp_auctions.*id = p_auction_id.*status = 'active'.*THEN\s+RETURN/s);
    });

    it("has re-check guard after FOR UPDATE lock", () => {
      const afterLock = sql.split("FOR UPDATE")[1] || "";
      const locks = sql.match(/FOR UPDATE/g);
      // There's only one FOR UPDATE in the fixed version
      expect(locks).toHaveLength(1);
      expect(afterLock).toMatch(/IF NOT EXISTS.*dkp_auctions.*id = p_auction_id.*status = 'active'.*THEN\s+RETURN/s);
    });

    it("handles winner bid already-processed gracefully instead of raising exception", () => {
      expect(sql).toContain("IF NOT FOUND THEN");
      // Should NOT have RAISE EXCEPTION for the winner-not-found case
      const afterWinnerNotFound = sql.split("IF NOT FOUND THEN")[1] || "";
      expect(afterWinnerNotFound).not.toMatch(/RAISE EXCEPTION.*[Ww]inner/);
      // Should have a fallback that cancels remaining active bids
      expect(afterWinnerNotFound).toContain("UPDATE public.dkp_auctions SET status = 'resolved'");
    });

    it("has GRANT EXECUTE for authenticated role", () => {
      expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.resolve_auction(UUID, UUID) TO authenticated");
    });

    it("clears is_up_for_bid when no more active auctions", () => {
      expect(sql).toContain("is_up_for_bid = false");
      expect(sql).toContain("bid_end_time = NULL");
    });

    it("includes notifications for winner, loser, and cancel flows", () => {
      expect(sql).toContain("dkp_won");
      expect(sql).toContain("dkp_lost");
      expect(sql).toContain("Auction cancelled");
    });
  });

  describe("auto_resolve_auction", () => {
    it("drops old function before creating new one", () => {
      expect(sql).toContain("DROP FUNCTION IF EXISTS public.auto_resolve_auction(uuid)");
      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.auto_resolve_auction(p_item_id UUID)");
    });

    it("wraps resolve_auction call in BEGIN/EXCEPTION block", () => {
      expect(sql).toContain("BEGIN");
      expect(sql).toContain("PERFORM public.resolve_auction(v_auction.id, v_winner_bid_id)");
      expect(sql).toContain("EXCEPTION WHEN OTHERS THEN");
      expect(sql).toContain("RAISE WARNING");
    });

    it("finds highest active bid by amount DESC, created_at ASC", () => {
      expect(sql).toContain("ORDER BY bid_amount DESC, created_at ASC");
    });

    it("only processes auctions with expired bid_end_time", () => {
      expect(sql).toContain("bid_end_time <= now()");
    });

    it("has GRANT EXECUTE for anon and authenticated roles", () => {
      expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.auto_resolve_auction(UUID) TO anon, authenticated");
    });
  });
});

describe("migration 190: no regressions vs migration 184", () => {
  it("preserves all notification message texts", () => {
    // Winner notification
    expect(sql).toContain("You won the auction!");
    expect(sql).toContain("You won \"");
    // Loser notification
    expect(sql).toContain("Auction ended — you did not win");
    expect(sql).toContain("Your DKP has been refunded.");
    // Cancel notification
    expect(sql).toContain("The auction for");
    expect(sql).toContain("was cancelled. Your DKP has been refunded.");
  });

  it("preserves earn_refund transaction inserts for losers and cancellations", () => {
    expect(sql).toContain("earn_refund");
    expect(sql).toContain("'bid'");
    expect(sql).toContain("reference_id");
  });

  it("preserves winner validation (bid must belong to auction)", () => {
    expect(sql).toContain("auction_id = p_auction_id");
    expect(sql).toContain("p_winner_bid_id AND auction_id = p_auction_id AND status = 'active'");
  });

  it("updates dkp_auctions status to resolved on completion", () => {
    expect(sql).toContain("UPDATE public.dkp_auctions SET status = 'resolved'");
  });
});
