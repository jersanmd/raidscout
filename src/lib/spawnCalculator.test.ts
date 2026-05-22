import { describe, it, expect } from "vitest";
import { calculateSpawnInfo } from "./spawnCalculator";
import type { Boss, DeathRecord } from "@/types";

/** Helper: create a Boss for testing */
function makeBoss(overrides: Partial<Boss> = {}): Boss {
  return {
    id: "boss-1",
    name: "Test Boss",
    spawn_type: "fixed_hours",
    respawn_hours: 24,
    schedule: null,
    server_id: "server-1",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Helper: create a DeathRecord for testing */
function makeDeath(overrides: Partial<DeathRecord> = {}): DeathRecord {
  return {
    id: "death-1",
    boss_id: "boss-1",
    user_id: "user-1",
    death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString(), // June 1, 2025 noon
    rally_image_url: null,
    created_at: "2025-06-01T12:00:00Z",
    ...overrides,
  };
}

// ── Fixed Hours ─────────────────────────────────────────────

describe("calculateSpawnInfo — fixed_hours", () => {
  it("returns unknown when there is no death record (not killed yet)", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 24 });
    const now = new Date(2025, 5, 1, 12, 0, 0);

    const result = calculateSpawnInfo(boss, null, now);

    expect(result.status).toBe("unknown");
    expect(result.nextSpawn).toBeNull();
    expect(result.deathRecord).toBeNull();
  });

  it("returns countdown when spawn is in the future", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 24 });
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() });
    const now = new Date(2025, 5, 2, 8, 0, 0); // 20h after death, 4h before spawn

    const result = calculateSpawnInfo(boss, death, now);

    expect(result.status).toBe("countdown");
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 2, 12, 0, 0));
    expect(result.deathRecord).toBe(death);
  });

  it("returns alive when spawn time has passed", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 24 });
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() });
    const now = new Date(2025, 5, 3, 0, 0, 0); // 36h after death

    const result = calculateSpawnInfo(boss, death, now);

    expect(result.status).toBe("alive");
    expect(result.nextSpawn!.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it("returns alive at exact spawn time", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 10 });
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() });
    const now = new Date(2025, 5, 1, 22, 0, 0); // exactly 10h later

    const result = calculateSpawnInfo(boss, death, now);

    expect(result.status).toBe("alive");
  });

  it("returns countdown 1ms before spawn", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 10 });
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() });
    const now = new Date(2025, 5, 1, 21, 59, 59, 999); // 1ms before spawn

    const result = calculateSpawnInfo(boss, death, now);

    expect(result.status).toBe("countdown");
  });
});

// ── Fixed Schedule ──────────────────────────────────────────

describe("calculateSpawnInfo — fixed_schedule", () => {
  it("returns next schedule slot as countdown when boss hasn't spawned yet this week", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule",
      respawn_hours: null,
      schedule: [{ day: 1, time: "19:00" }], // Monday 7pm
    });
    // Monday 12:00 noon local time — well before the 7pm slot
    const now = new Date(2025, 5, 2, 12, 0, 0); // June 2, 2025 (Monday)

    const result = calculateSpawnInfo(boss, null, now);

    expect(result.status).toBe("countdown");
    expect(result.nextSpawn).not.toBeNull();
  });

  it("returns countdown when no death record — alive window only after a kill", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule",
      respawn_hours: null,
      schedule: [{ day: 1, time: "19:00" }], // Monday 7pm
    });
    // Monday 20:30 — 1.5 hours after the 7pm spawn
    // Without a death record, it should NOT be "alive" — just show next slot
    const now = new Date(2025, 5, 2, 20, 30, 0); // June 2, 2025 Monday 8:30pm

    const result = calculateSpawnInfo(boss, null, now);

    expect(result.status).toBe("countdown");
    // nextSpawn should be set (next week's slot since today's passed)
    expect(result.nextSpawn).not.toBeNull();
  });

  it("returns unknown when schedule is empty", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule",
      respawn_hours: null,
      schedule: [],
    });

    const result = calculateSpawnInfo(boss, null, new Date());

    expect(result.status).toBe("unknown");
    expect(result.nextSpawn).toBeNull();
  });

  it("returns unknown when schedule is null", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule",
      respawn_hours: null,
      schedule: null,
    });

    const result = calculateSpawnInfo(boss, null, new Date());

    expect(result.status).toBe("unknown");
    expect(result.nextSpawn).toBeNull();
  });
});

// ── Edge cases ──────────────────────────────────────────────

describe("calculateSpawnInfo — edge cases", () => {
  it("returns unknown for fixed_hours boss with respawn_hours=null (even with death)", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: null });
    const death = makeDeath();

    const result = calculateSpawnInfo(boss, death, new Date());

    expect(result.status).toBe("unknown");
  });

  it("handles 48h respawn correctly", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 48 });
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() });
    const now = new Date(2025, 5, 3, 8, 0, 0); // 44h later, 4h to go

    const result = calculateSpawnInfo(boss, death, now);

    expect(result.status).toBe("countdown");
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 3, 12, 0, 0));
  });

  it("handles 62h respawn correctly", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 62 });
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() });
    const now = new Date(2025, 5, 4, 0, 0, 0); // 60h later, 2h to go

    const result = calculateSpawnInfo(boss, death, now);

    expect(result.status).toBe("countdown");
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 4, 2, 0, 0));
  });
});
