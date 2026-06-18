// ── Tests: dedup persistence + error handling ──────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDedupKey } from "./spawn-cron";
import { logError, safeCall } from "./supabase";

// ── buildDedupKey ──────────────────────────────────────────
describe("buildDedupKey", () => {
  const sid = "svr-abc";
  const bid = "boss-xyz";
  const ts = 1718700000;

  it("builds boss_spawned key", () => {
    expect(buildDedupKey("boss_spawned", sid, bid, ts))
      .toBe("svr-abc-boss-xyz-boss_spawned-1718700000");
  });

  it("builds boss_spawning (5-min) key", () => {
    expect(buildDedupKey("boss_spawning", sid, bid, ts))
      .toBe("svr-abc-boss-xyz-5min-1718700000");
  });

  it("builds boss_thread key", () => {
    expect(buildDedupKey("boss_thread", sid, bid, ts))
      .toBe("svr-abc-thread-boss-xyz-1718700000");
  });

  it("builds activity_spawning key", () => {
    expect(buildDedupKey("activity_spawning", sid, "act-1", ts))
      .toBe("svr-abc-act-5min-act-1-1718700000");
  });

  it("builds activity_started key", () => {
    expect(buildDedupKey("activity_started", sid, "act-1", ts))
      .toBe("svr-abc-act-started-act-1-1718700000");
  });

  it("builds activity_thread key", () => {
    expect(buildDedupKey("activity_thread", sid, "act-2", ts))
      .toBe("svr-abc-thread-activity-act-2-1718700000");
  });

  it("returns null for unknown event", () => {
    expect(buildDedupKey("unknown_event", sid, bid, ts)).toBeNull();
  });

  it("returns null for empty event", () => {
    expect(buildDedupKey("", sid, bid, ts)).toBeNull();
  });

  it("keys are unique per event type (same boss, same timestamp)", () => {
    const keys = new Set([
      buildDedupKey("boss_spawned", sid, bid, ts),
      buildDedupKey("boss_spawning", sid, bid, ts),
      buildDedupKey("boss_thread", sid, bid, ts),
    ]);
    expect(keys.size).toBe(3); // all different
  });

  it("keys are unique per server ID", () => {
    const k1 = buildDedupKey("boss_spawned", "s1", bid, ts);
    const k2 = buildDedupKey("boss_spawned", "s2", bid, ts);
    expect(k1).not.toBe(k2);
  });

  it("keys are unique per timestamp", () => {
    const k1 = buildDedupKey("boss_spawned", sid, bid, 100);
    const k2 = buildDedupKey("boss_spawned", sid, bid, 200);
    expect(k1).not.toBe(k2);
  });
});

// ── logError ────────────────────────────────────────────────
describe("logError", () => {
  let consoleSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("logs with scope and message", () => {
    logError("test", "something broke");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[test] something broke")
    );
  });

  it("logs string detail", () => {
    logError("test", "msg", "extra info");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("extra info")
    );
  });

  it("logs Error detail with stack", () => {
    const err = new Error("boom");
    logError("test", "msg", err);
    const call = consoleSpy.mock.calls[0][0];
    expect(call).toContain("boom");
    expect(call).toContain("←"); // stack trace separator
  });

  it("logs extra context as JSON", () => {
    logError("test", "msg", null, { serverId: "abc", count: 5 });
    const call = consoleSpy.mock.calls[0][0];
    expect(call).toContain('"serverId":"abc"');
    expect(call).toContain('"count":5');
  });

  it("handles null detail gracefully", () => {
    expect(() => logError("test", "msg", null)).not.toThrow();
  });

  it("handles undefined extra gracefully", () => {
    expect(() => logError("test", "msg", "detail")).not.toThrow();
  });

  it("handles circular reference in extra", () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    expect(() => logError("test", "msg", null, obj)).not.toThrow();
  });
});

// ── safeCall ────────────────────────────────────────────────
describe("safeCall", () => {
  it("returns result on success", async () => {
    const result = await safeCall("test", async () => 42);
    expect(result).toBe(42);
  });

  it("returns null on failure", async () => {
    const result = await safeCall("test", async () => { throw new Error("fail"); });
    expect(result).toBeNull();
  });

  it("does not throw on failure", async () => {
    await expect(
      safeCall("test", async () => { throw new Error("fail"); })
    ).resolves.toBeNull();
  });

  it("logs error on failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await safeCall("test", async () => { throw new Error("something wrong"); });
    expect(spy).toHaveBeenCalled();
  });
});
