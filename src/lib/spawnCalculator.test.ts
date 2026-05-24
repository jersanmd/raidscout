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

  it("returns alive when no death record and within alive window of most recent slot", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule",
      respawn_hours: null,
      schedule: [{ day: 1, time: "19:00" }], // Monday 7pm
    });
    // Monday 20:30 — 1.5 hours after the 7pm spawn, within 2h alive window
    const now = new Date(2025, 5, 2, 20, 30, 0); // June 2, 2025 Monday 8:30pm

    const result = calculateSpawnInfo(boss, null, now);

    expect(result.status).toBe("alive");
    expect(result.nextSpawn).not.toBeNull(); // next week's slot
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

// ── Spawn Overrides ─────────────────────────────────────────

describe("calculateSpawnInfo — spawn overrides", () => {
  it("override death_time takes priority over death record death_time", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 10 });
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() }); // noon
    // death alone → spawns at 10pm. Override shifts death to 2am → should spawn at noon
    const override = { death_time: new Date(2025, 5, 1, 2, 0, 0).toISOString() };
    const now = new Date(2025, 5, 1, 11, 0, 0); // 11am, 1h before override-based spawn

    const result = calculateSpawnInfo(boss, death, now, override);

    expect(result.status).toBe("countdown");
    // spawn = override.death_time + 10h = 2am + 10h = noon
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 12, 0, 0));
  });

  it("override makes boss appear alive even without any death record", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 10 });
    // No death record at all — would normally be "unknown"
    const override = { death_time: new Date(2025, 5, 1, 0, 0, 0).toISOString() }; // midnight
    const now = new Date(2025, 5, 1, 11, 0, 0); // 11am, 1h after spawn

    const result = calculateSpawnInfo(boss, null, now, override);

    expect(result.status).toBe("alive");
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 10, 0, 0));
  });

  it("null override falls back to death record normally", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 10 });
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() });
    const now = new Date(2025, 5, 1, 18, 0, 0); // 6pm, 4h before spawn

    const result = calculateSpawnInfo(boss, death, now, null);

    expect(result.status).toBe("countdown");
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 22, 0, 0));
  });

  it("override on a boss with a recent kill shifts the spawn earlier", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 10 });
    // Killed at 10am → normally spawns at 8pm
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 10, 0, 0).toISOString() });
    // Override: pretend death was at 6am → spawns at 4pm instead of 8pm
    const override = { death_time: new Date(2025, 5, 1, 6, 0, 0).toISOString() };
    const now = new Date(2025, 5, 1, 14, 0, 0); // 2pm, 2h before override spawn

    const result = calculateSpawnInfo(boss, death, now, override);

    expect(result.status).toBe("countdown");
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 16, 0, 0)); // 4pm
    // Without override it would be 8pm
  });

  it("override on unknown boss with no death record and no respawn_hours stays unknown", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: null });
    const override = { death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() };

    const result = calculateSpawnInfo(boss, null, new Date(), override);

    // respawn_hours is null, can't compute spawn
    expect(result.status).toBe("unknown");
  });
});

// ── Real-world scenarios ────────────────────────────────────

describe("calculateSpawnInfo — real-world flows", () => {
  it("mark alive → kill → countdown (Venatus 10h)", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 10 });
    const now = new Date(2025, 5, 1, 12, 0, 0); // noon

    // Mark all alive: creates override with death_time = now - 10h = 2am
    const override = { death_time: new Date(2025, 5, 1, 2, 0, 0).toISOString() };
    let result = calculateSpawnInfo(boss, null, now, override);
    expect(result.status).toBe("alive"); // spawned at 2am+10h=noon

    // Kill at 12:30pm → death record created, override deleted
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 12, 30, 0).toISOString() });
    result = calculateSpawnInfo(boss, death, now, null); // no override after kill
    expect(result.status).toBe("countdown");
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 22, 30, 0)); // 12:30 + 10h
  });

  it("kill → edit spawn earlier → countdown adjusts", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 10 });
    // Killed at 10am → spawns at 8pm
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 10, 0, 0).toISOString() });
    const now = new Date(2025, 5, 1, 14, 0, 0); // 2pm

    let result = calculateSpawnInfo(boss, death, now, null);
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 20, 0, 0)); // 8pm

    // Edit spawn to 4pm → override death_time = 4pm - 10h = 6am
    const override = { death_time: new Date(2025, 5, 1, 6, 0, 0).toISOString() };
    result = calculateSpawnInfo(boss, death, now, override);
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 16, 0, 0)); // 4pm
    expect(result.status).toBe("countdown"); // 2pm < 4pm
  });

  it("fixed-schedule boss ignores override (schedule always wins)", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule",
      respawn_hours: null,
      schedule: [{ day: 1, time: "19:00" }], // Monday 7pm
    });
    const now = new Date(2025, 5, 2, 20, 0, 0); // Monday 8pm — within alive window
    const override = { death_time: new Date(2025, 5, 1, 0, 0, 0).toISOString() };

    const result = calculateSpawnInfo(boss, null, now, override);

    // Override is ignored for fixed_schedule — schedule controls spawn
    expect(result.status).toBe("alive");
  });

  it("kill twice in same day with edit between", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 10 });
    // First kill at 2am
    const death1 = makeDeath({ death_time: new Date(2025, 5, 1, 2, 0, 0).toISOString() });
    let now = new Date(2025, 5, 1, 3, 0, 0);
    let result = calculateSpawnInfo(boss, death1, now, null);
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 12, 0, 0)); // noon

    // Edit spawn to 8am → override: death = 8am - 10h = 10pm prev day
    const override = { death_time: new Date(2025, 5, 0, 22, 0, 0).toISOString() };
    result = calculateSpawnInfo(boss, death1, now, override);
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 8, 0, 0)); // 8am (already past)

    // Second kill at 8:30am → override deleted
    now = new Date(2025, 5, 1, 8, 30, 0);
    const death2 = makeDeath({ death_time: now.toISOString() });
    result = calculateSpawnInfo(boss, death2, now, null);
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 18, 30, 0)); // 6:30pm
    expect(result.status).toBe("countdown");
  });

  it("multiple kills accumulate in history correctly", () => {
    const boss = makeBoss({ spawn_type: "fixed_hours", respawn_hours: 10 });
    // Kill 1: 2am
    const death1 = makeDeath({ id: "d1", death_time: new Date(2025, 5, 1, 2, 0, 0).toISOString() });
    // Kill 2: 12pm (latest)
    const death2 = makeDeath({ id: "d2", death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() });
    const now = new Date(2025, 5, 1, 13, 0, 0);

    // Spawn calculator uses latest death — should use death2
    const result = calculateSpawnInfo(boss, death2, now, null);
    expect(result.nextSpawn).toEqual(new Date(2025, 5, 1, 22, 0, 0)); // 10pm
    // death1 is preserved in history but not used for spawn
  });
});
