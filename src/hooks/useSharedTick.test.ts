import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { applyServerClockSample, serverNow, serverRemainingMs } from "./useSharedTick";

// The offset store is module-global; an authoritative sample resets it, which
// doubles as test isolation.

describe("server clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    applyServerClockSample(1_000_000, true); // offset 0 baseline
  });
  afterEach(() => vi.useRealTimers());

  it("an authoritative (RPC) sample sets the offset", () => {
    applyServerClockSample(1_015_000, true); // server 15s ahead of device
    expect(serverNow()).toBe(1_015_000);
  });

  it("authoritative samples RESET — surviving a device clock step-correction", () => {
    applyServerClockSample(1_020_000, true);  // +20s
    applyServerClockSample(1_002_000, true);  // fresh RPC says only +2s (device clock was corrected)
    expect(serverNow()).toBe(1_002_000);
  });

  it("event samples only raise the offset, never lower it", () => {
    applyServerClockSample(1_010_000, true);   // baseline +10s
    applyServerClockSample(1_005_000, false);  // laggy event implies +5s — ignored
    expect(serverNow()).toBe(1_010_000);
    applyServerClockSample(1_012_000, false);  // fresher event implies +12s — taken
    expect(serverNow()).toBe(1_012_000);
  });

  it("ignores unparseable samples", () => {
    applyServerClockSample(1_010_000, true);
    applyServerClockSample(NaN, true);
    expect(serverNow()).toBe(1_010_000);
  });

  it("remaining time uses server time with the 1s pessimistic margin", () => {
    // Device thinks it's 1,000,000; server is 15s ahead. Deadline 20s after
    // device-now = only 5s of real server time, minus 1s margin = 4s shown.
    applyServerClockSample(1_015_000, true);
    const end = new Date(1_020_000).toISOString();
    expect(serverRemainingMs(end)).toBe(4_000);
  });

  it("remaining clamps at zero — the exact reported bug renders Ended, not 9s", () => {
    // Reported case: device ~16s behind, row showed 00:00:09 while the server
    // had passed the deadline. With the corrected clock this must be 0.
    applyServerClockSample(1_016_000, true);
    const end = new Date(1_009_000).toISOString();
    expect(serverRemainingMs(end)).toBe(0);
  });

  it("falls back to the device clock when no sample ever arrives", () => {
    applyServerClockSample(1_000_000, true); // offset 0 == no correction
    const end = new Date(1_011_000).toISOString();
    expect(serverRemainingMs(end)).toBe(10_000); // 11s − 1s margin
  });
});
