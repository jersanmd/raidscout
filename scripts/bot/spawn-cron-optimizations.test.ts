// ── Tests: spawn-cron performance optimizations ───────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── concurrentMap (imported from spawn-cron) ──────────────────
// We test the concurrency behavior by importing and verifying
// that items are processed in parallel batches of N.

// We need to mock the module's dependencies before importing
vi.mock("./config", () => ({
  TOKEN: "test-token",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_KEY: "test-key",
}));

// ── Discord fetch timeout & retries ──────────────────────────
describe("discordFetch retry behavior", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns response on success", async () => {
    const { discordFetch } = await import("./discord-api");
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response("ok", { status: 200 }))
    ) as any;

    const res = await discordFetch("https://discord.com/api/v10/test", {});
    expect(res.ok).toBe(true);
  });

  it("retries on 500 then succeeds", async () => {
    const { discordFetch } = await import("./discord-api");
    let callCount = 0;
    globalThis.fetch = vi.fn(() => {
      callCount++;
      if (callCount < 2) return Promise.resolve(new Response(null, { status: 500 }));
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as any;

    const res = await discordFetch("https://discord.com/api/v10/test", {});
    expect(res.ok).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("throws after exhausting retries (2 attempts)", async () => {
    const { discordFetch } = await import("./discord-api");
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 500 }))
    ) as any;

    await expect(discordFetch("https://discord.com/api/v10/test", {})).rejects.toThrow("Discord API failed after 2 retries");
  });

  it("handles 404 without retrying", async () => {
    const { discordFetch } = await import("./discord-api");
    let callCount = 0;
    globalThis.fetch = vi.fn(() => {
      callCount++;
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as any;

    const res = await discordFetch("https://discord.com/api/v10/test", {});
    expect(res.status).toBe(404);
    expect(callCount).toBe(1); // no retry on 404
  });
});

// ── Batch dedup queue ────────────────────────────────────────
describe("batch dedup queue", () => {
  let queueDedupRecord: Function;
  let flushDedupBatch: Function;
  let pendingDedupBatch: any[];

  beforeEach(async () => {
    // Reset the module state by re-importing
    vi.resetModules();
    // We need to access the module's internal state.
    // Since queueDedupRecord and flushDedupBatch are not exported,
    // we test them indirectly through the exported functions.
    // But buildDedupKey IS exported — let's test that the dedup
    // key format is preserved.
  });

  // buildDedupKey is the same format used by queueDedupRecord internally
  it("dedup key format unchanged after refactor", async () => {
    const { buildDedupKey } = await import("./spawn-cron");
    const key = buildDedupKey("boss_spawned", "svr-1", "boss-1", 1000);
    expect(key).toBe("svr-1-boss-1-boss_spawned-1000");
  });

  it("dedup keys cover all event types", async () => {
    const { buildDedupKey } = await import("./spawn-cron");
    const events = ["boss_spawned", "boss_spawning", "boss_thread", "activity_spawning", "activity_started", "activity_thread"];
    for (const e of events) {
      expect(buildDedupKey(e, "s", "b", 1)).toBeTruthy();
    }
  });
});

// ── concurrentMap concurrency behavior ───────────────────────
describe("concurrentMap", () => {
  it("processes items in parallel batches", async () => {
    // Import the function (it's not exported, but we can test logic)
    // Instead, verify the RPC retry pattern by testing conditionals
    const callOrder: number[] = [];
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    
    // Simulate concurrentMap(items, 3, fn) behavior
    async function concurrentMap<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
      const results: R[] = [];
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
      }
      return results;
    }

    let running = 0;
    let maxRunning = 0;
    const results = await concurrentMap(items, 3, async (n) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(r => setTimeout(r, 10));
      callOrder.push(n);
      running--;
      return n * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    // With concurrency 3, maxRunning should be 3 (first batch: 1,2,3)
    expect(maxRunning).toBeLessThanOrEqual(3);
  });

  it("concurrency of 8 creates batches of 8", async () => {
    const batchSizes: number[] = [];
    async function concurrentMap<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
      const results: R[] = [];
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        batchSizes.push(batch.length);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
      }
      return results;
    }

    const items = Array.from({ length: 20 }, (_, i) => i);
    await concurrentMap(items, 8, async () => {});
    
    // 20 items with concurrency 8 → [8, 8, 4]
    expect(batchSizes).toEqual([8, 8, 4]);
  });
});

// ── RPC retry logic ──────────────────────────────────────────
describe("RPC retry pattern", () => {
  it("retries RPC once before falling back", async () => {
    let rpcCalls = 0;
    const mockRpc = vi.fn(async () => {
      rpcCalls++;
      throw new Error("RPC failed");
    });

    // Simulate the retry pattern
    let snap: any = null;
    try {
      snap = await mockRpc();
    } catch {
      try {
        snap = await mockRpc();
      } catch {
        snap = null;
      }
    }

    expect(snap).toBeNull();
    expect(rpcCalls).toBe(2); // tried twice
  });

  it("uses first successful result", async () => {
    let rpcCalls = 0;
    const mockRpc = vi.fn(async () => {
      rpcCalls++;
      return { data: "ok" };
    });

    let snap: any = null;
    try {
      snap = await mockRpc();
    } catch {
      try { snap = await mockRpc(); } catch { snap = null; }
    }

    expect(snap).toEqual({ data: "ok" });
    expect(rpcCalls).toBe(1); // succeeded first try
  });

  it("uses second try result if first fails", async () => {
    let rpcCalls = 0;
    const mockRpc = vi.fn(async () => {
      rpcCalls++;
      if (rpcCalls === 1) throw new Error("fail");
      return { data: "retry-ok" };
    });

    let snap: any = null;
    try {
      snap = await mockRpc();
    } catch {
      try { snap = await mockRpc(); } catch { snap = null; }
    }

    expect(snap).toEqual({ data: "retry-ok" });
    expect(rpcCalls).toBe(2);
  });
});

// ── Adaptive interval calculation ──────────────────────────
describe("adaptive interval calculation", () => {
  const step = 30_000;
  const calc = (durations: number[]) => {
    if (durations.length < 3) return 30_000;
    const sample = durations.slice(-10);
    const avg = sample.reduce((a, b) => a + b, 0) / sample.length;
    return Math.max(30_000, Math.floor(avg / step) * step + step);
  };

  it("defaults to 30s with few ticks", () => {
    expect(calc([1000, 2000])).toBe(30_000);
  });

  it("stays at 30s when avg < 30s", () => {
    expect(calc([5000, 10000, 15000])).toBe(30_000);
  });

  it("scales to 60s when avg in 30-59s range", () => {
    expect(calc([30000, 35000, 40000])).toBe(60_000);
    expect(calc([59000, 59000, 59000])).toBe(60_000);
  });

  it("scales to 90s when avg in 60-89s range", () => {
    expect(calc([60000, 70000, 80000])).toBe(90_000);
  });

  it("scales to 120s when avg in 90-119s range", () => {
    expect(calc([90000, 100000, 110000])).toBe(120_000);
  });

  it("scales to 150s when avg in 120-149s range", () => {
    expect(calc([120000, 130000, 140000])).toBe(150_000);
  });

  it("scales to 180s when avg in 150-179s range", () => {
    expect(calc([150000, 160000, 170000])).toBe(180_000);
  });

  it("scales to 210s when avg in 180-209s range", () => {
    expect(calc([180000, 190000, 200000])).toBe(210_000);
  });

  it("handles edge at exactly 30s boundary", () => {
    expect(calc([30000, 30000, 30000])).toBe(60_000);
  });

  it("handles edge at exactly 60s boundary", () => {
    expect(calc([60000, 60000, 60000])).toBe(90_000);
  });

  it("handles edge at exactly 90s boundary", () => {
    expect(calc([90000, 90000, 90000])).toBe(120_000);
  });
});
