import { describe, it, expect } from "vitest";
import { calculateSpawnInfo } from "./spawnCalculator";
import { getLeaderboardResetAt } from "@/hooks/useLeaderboardSnapshots";
import type { Boss, DeathRecord } from "@/types";

// ── Helpers ─────────────────────────────────────────────────

function makeBoss(overrides: Partial<Boss> = {}): Boss {
  return {
    id: "boss-1", name: "Venatus", spawn_type: "fixed_hours",
    respawn_hours: 10, schedule: null, server_id: "s1",
    created_at: "2025-01-01T00:00:00Z", ...overrides,
  };
}

function makeDeath(overrides: Partial<DeathRecord> = {}): DeathRecord {
  return {
    id: "death-1", boss_id: "boss-1", user_id: "u1",
    death_time: new Date(2025, 5, 1, 10, 0, 0).toISOString(),
    rally_image_url: null, created_at: "2025-06-01T10:00:00Z", ...overrides,
  };
}

// ── Full User Session Simulation ────────────────────────────

describe("Integration: full user session", () => {
  it("new server → mark alive → kill → kill again → edit spawn", () => {
    const boss = makeBoss();
    const now = new Date(2025, 5, 1, 12, 0, 0); // noon

    // --- Step 1: New server, boss is unknown ---
    let result = calculateSpawnInfo(boss, null, now, null);
    expect(result.status).toBe("unknown");

    // --- Step 2: Mark all alive → override created ---
    const override = { death_time: new Date(2025, 5, 1, 2, 0, 0).toISOString() }; // now - 10h
    result = calculateSpawnInfo(boss, null, now, override);
    expect(result.status).toBe("alive");
    expect(result.nextSpawn!.getTime()).toBeLessThanOrEqual(now.getTime());

    // --- Step 3: Kill at 12:30pm → override deleted ---
    const kill1 = makeDeath({ id: "d1", death_time: new Date(2025, 5, 1, 12, 30, 0).toISOString() });
    result = calculateSpawnInfo(boss, kill1, new Date(2025, 5, 1, 12, 31, 0), null);
    expect(result.status).toBe("countdown");
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 22, 30, 0));

    // --- Step 4: Wait 30 min, edit spawn to 2pm ---
    const now2 = new Date(2025, 5, 1, 13, 0, 0);
    const override2 = { death_time: new Date(2025, 5, 1, 4, 0, 0).toISOString() }; // 2pm - 10h
    result = calculateSpawnInfo(boss, kill1, now2, override2);
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 14, 0, 0)); // 2pm

    // --- Step 5: Kill again at 2:15pm → override deleted ---
    const kill2 = makeDeath({ id: "d2", death_time: new Date(2025, 5, 1, 14, 15, 0).toISOString() });
    const now3 = new Date(2025, 5, 1, 14, 16, 0);
    result = calculateSpawnInfo(boss, kill2, now3, null);
    expect(result.status).toBe("countdown");
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 2, 0, 15, 0)); // next day 12:15am
  });

  it("two bosses: Venatus (10h) and Dalia (18h)", () => {
    const venatus = makeBoss({ id: "v1", name: "Venatus", respawn_hours: 10 });
    const dalia = makeBoss({ id: "d1", name: "Lady Dalia", respawn_hours: 18 });
    const now = new Date(2025, 5, 1, 12, 0, 0);

    // Mark all alive
    const vOverride = { death_time: new Date(2025, 5, 1, 2, 0, 0).toISOString() }; // 12 - 10
    const dOverride = { death_time: new Date(2025, 5, 0, 18, 0, 0).toISOString() }; // 12 - 18

    let v = calculateSpawnInfo(venatus, null, now, vOverride);
    let d = calculateSpawnInfo(dalia, null, now, dOverride);
    expect(v.status).toBe("alive");
    expect(d.status).toBe("alive");

    // Kill Venatus only
    const vDeath = makeDeath({ id: "vd1", boss_id: "v1", death_time: now.toISOString() });
    v = calculateSpawnInfo(venatus, vDeath, new Date(2025, 5, 1, 12, 1, 0), null);
    expect(v.status).toBe("countdown");
    expect(v.nextSpawn).toEqual(new Date(2025, 5, 1, 22, 0, 0));

    // Dalia should still be alive (different boss, override untouched)
    d = calculateSpawnInfo(dalia, null, new Date(2025, 5, 1, 12, 1, 0), dOverride);
    expect(d.status).toBe("alive");
  });

  it("bulk mark alive: 3 unknown bosses → all become alive", () => {
    const bosses = [
      makeBoss({ id: "b1", name: "Amentis", respawn_hours: 29 }),
      makeBoss({ id: "b2", name: "Ego", respawn_hours: 21 }),
      makeBoss({ id: "b3", name: "Baron", respawn_hours: 32 }),
    ];
    const now = new Date(2025, 5, 1, 12, 0, 0);

    const overrides = [
      { boss_id: "b1", death_time: new Date(2025, 5, 0, 7, 0, 0).toISOString() }, // 12 - 29
      { boss_id: "b2", death_time: new Date(2025, 5, 0, 15, 0, 0).toISOString() }, // 12 - 21
      { boss_id: "b3", death_time: new Date(2025, 5, 0, 4, 0, 0).toISOString() }, // 12 - 32
    ];

    for (let i = 0; i < bosses.length; i++) {
      // Before: unknown
      expect(calculateSpawnInfo(bosses[i], null, now, null).status).toBe("unknown");
      // After: alive via override
      expect(calculateSpawnInfo(bosses[i], null, now, overrides[i]).status).toBe("alive");
    }
  });
});

// ── Leaderboard week-0 integration ──────────────────────────

describe("Integration: leaderboard week-0", () => {
  it("first finalize uses server.created_at when no reset stored", () => {
    // Simulate clearing localStorage
    const serverId = "test-server-123";
    // No stored reset → should return server.created_at
    const fallback = "2025-05-01T00:00:00Z";
    const reset = getLeaderboardResetAt(serverId, fallback);
    expect(reset).toBe(fallback);
  });

  it("subsequent finalize uses stored reset date", () => {
    const serverId = "test-server-456";
    const storedDate = "2025-06-01T00:00:00Z";
    localStorage.setItem(`lordnine-leaderboard-reset-at-${serverId}`, storedDate);

    const reset = getLeaderboardResetAt(serverId, "2025-01-01T00:00:00Z");
    expect(reset).toBe(storedDate); // stored takes priority over fallback

    localStorage.removeItem(`lordnine-leaderboard-reset-at-${serverId}`);
  });
});

// ── Spawn override map simulation ───────────────────────────

describe("Integration: spawn override map", () => {
  it("overrideMap correctly filters out deleted override", () => {
    // Simulate what setQueryData does after a kill
    const overrides = [
      { boss_id: "b1", death_time: "2025-06-01T02:00:00Z" },
      { boss_id: "b2", death_time: "2025-06-01T04:00:00Z" },
    ];
    const bossId = "b1";

    // After kill: filter out b1's override
    const updated = overrides.filter(o => o.boss_id !== bossId);
    expect(updated).toHaveLength(1);
    expect(updated[0].boss_id).toBe("b2");
  });

  it("overrideMap correctly adds new override from edit spawn", () => {
    const overrides = [{ boss_id: "b1", death_time: "2025-06-01T02:00:00Z" }];

    // Edit spawn for b2
    const newOverride = { boss_id: "b2", death_time: "2025-06-01T06:00:00Z" };
    const updated = [...overrides.filter(o => o.boss_id !== "b2"), newOverride];
    expect(updated).toHaveLength(2);
    expect(updated.find(o => o.boss_id === "b2")!.death_time).toBe("2025-06-01T06:00:00Z");
  });
});

// ── Fixed-schedule killed-after-slot ────────────────────────

describe("Integration: fixed-schedule kill tracking", () => {
  it("killed after slot → not in alive window → countdown to next slot", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [{ day: 1, time: "19:00" }], // Monday 7pm
    });
    // Monday 8pm — slot was at 7pm, boss killed at 8pm
    const death = makeDeath({ death_time: new Date(2025, 5, 2, 20, 0, 0).toISOString() });
    const now = new Date(2025, 5, 2, 20, 30, 0);

    const result = calculateSpawnInfo(boss, death, now, null);
    // Killed after slot → not alive → countdown to next week
    expect(result.status).toBe("countdown");
  });

  it("not killed after slot → within alive window → alive", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [{ day: 1, time: "19:00" }],
    });
    // Monday 7:30pm — slot at 7pm, boss NOT killed → alive window
    const now = new Date(2025, 5, 2, 19, 30, 0);

    const result = calculateSpawnInfo(boss, null, now, null);
    expect(result.status).toBe("alive");
  });
});
