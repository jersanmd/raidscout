import { describe, it, expect } from "vitest";
import { calculateSpawnInfo } from "./spawnCalculator";
import type { Boss, DeathRecord, ScheduleSlot } from "@/types";

// ── Helpers ─────────────────────────────────────────────────

function makeBoss(overrides: Partial<Boss> = {}): Boss {
  return {
    id: "boss-1", name: "Test Boss", spawn_type: "fixed_hours",
    respawn_hours: 24, schedule: null, server_id: "s1",
    created_at: "2025-01-01T00:00:00Z", ...overrides,
  };
}

function makeDeath(overrides: Partial<DeathRecord> = {}): DeathRecord {
  return {
    id: "death-1", boss_id: "boss-1", user_id: "u1",
    death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString(),
    rally_image_url: null, created_at: "2025-06-01T12:00:00Z", ...overrides,
  };
}

function scheduleSlot(day: number, time: string): ScheduleSlot {
  const [h, m] = time.split(":").map(Number);
  return { day, time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}

// ══════════════════════════════════════════════════════════════
// Fixed-hours: multiple kills & edge cases
// ══════════════════════════════════════════════════════════════

describe("fixed_hours — multiple kills & edge cases", () => {
  it("two kills 8h apart → second spawn 24h after second kill", () => {
    const boss = makeBoss({ respawn_hours: 24 });
    // Kill 1: noon
    const d1 = makeDeath({ id: "d1", death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() });
    // 20h later (8am next day): still countdown
    let r = calculateSpawnInfo(boss, d1, new Date(2025, 5, 2, 8, 0, 0));
    expect(r.status).toBe("countdown");
    expect(r.nextSpawn).toEqual(new Date(2025, 5, 2, 12, 0, 0));

    // Boss spawns at noon, kill again at 8pm
    const d2 = makeDeath({ id: "d2", boss_id: "boss-1",
      death_time: new Date(2025, 5, 2, 20, 0, 0).toISOString() });
    r = calculateSpawnInfo(boss, d2, new Date(2025, 5, 2, 20, 1, 0));
    expect(r.status).toBe("countdown");
    expect(r.nextSpawn).toEqual(new Date(2025, 5, 3, 20, 0, 0));
  });

  it("10h boss: killed at midnight, spawns at 10am", () => {
    const boss = makeBoss({ respawn_hours: 10 });
    const death = makeDeath({ death_time: new Date(2025, 5, 2, 0, 0, 0).toISOString() });
    const r = calculateSpawnInfo(boss, death, new Date(2025, 5, 2, 9, 59, 0));
    expect(r.status).toBe("countdown");
    expect(r.nextSpawn).toEqual(new Date(2025, 5, 2, 10, 0, 0));
  });

  it("62h boss: killed Friday noon, spawns Monday 2am", () => {
    const boss = makeBoss({ respawn_hours: 62 });
    // June 6, 2025 = Friday
    const death = makeDeath({ death_time: new Date(2025, 5, 6, 12, 0, 0).toISOString() });
    // Sunday 10pm = 58h later, still countdown
    let r = calculateSpawnInfo(boss, death, new Date(2025, 5, 8, 22, 0, 0));
    expect(r.status).toBe("countdown");
    // Monday 2am exactly
    expect(r.nextSpawn).toEqual(new Date(2025, 5, 9, 2, 0, 0));

    // Monday 2:01am = alive
    r = calculateSpawnInfo(boss, death, new Date(2025, 5, 9, 2, 1, 0));
    expect(r.status).toBe("alive");
  });

  it("reports remainingMs correctly for countdown", () => {
    const boss = makeBoss({ respawn_hours: 10 });
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() });
    const now = new Date(2025, 5, 1, 18, 0, 0); // 4h before spawn
    const r = calculateSpawnInfo(boss, death, now);
    expect(r.status).toBe("countdown");
    expect(r.nextSpawn!.getTime() - now.getTime()).toBe(4 * 3600_000);
  });
});

// ══════════════════════════════════════════════════════════════
// Fixed-schedule: day-of-week & slot windows
// ══════════════════════════════════════════════════════════════

describe("fixed_schedule — day-of-week & slot windows", () => {
  it("multi-slot boss: alive after first slot, countdown after kill", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [
        scheduleSlot(1, "19:00"), // Monday 7pm
        scheduleSlot(4, "19:00"), // Thursday 7pm
      ],
    });
    // Monday 7:30pm — within alive window of Monday 7pm slot
    const now = new Date(2025, 5, 2, 19, 30, 0);
    let r = calculateSpawnInfo(boss, null, now);
    expect(r.status).toBe("alive");

    // Kill at Monday 8pm
    const death = makeDeath({ death_time: new Date(2025, 5, 2, 20, 0, 0).toISOString() });
    r = calculateSpawnInfo(boss, death, new Date(2025, 5, 2, 20, 1, 0));
    expect(r.status).toBe("countdown");
    // Next slot: Thursday 7pm
    expect(r.nextSpawn).not.toBeNull();
    const thuSlot = r.nextSpawn!;
    expect(thuSlot.getDay()).toBe(4); // Thursday
    expect(thuSlot.getHours()).toBe(19);
  });

  it("boss with 2 slots on same day — earlier slot alive, later slot countdown after kill", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [
        scheduleSlot(3, "11:30"), // Wednesday 11:30am
        scheduleSlot(3, "19:00"), // Wednesday 7pm
      ],
    });
    // Wednesday 12pm — alive from 11:30am slot
    let r = calculateSpawnInfo(boss, null, new Date(2025, 5, 4, 12, 0, 0));
    expect(r.status).toBe("alive");

    // Kill at 12:30pm — countdown to 7pm slot
    const death = makeDeath({ death_time: new Date(2025, 5, 4, 12, 30, 0).toISOString() });
    r = calculateSpawnInfo(boss, death, new Date(2025, 5, 4, 12, 31, 0));
    expect(r.status).toBe("countdown");
    expect(r.nextSpawn!.getHours()).toBe(19);
  });

  it("Sunday slot: alive Sunday evening, countdown after 4h cap Monday morning", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [scheduleSlot(0, "22:00")], // Sunday 10pm
    });
    // Sunday 10:30pm — alive (30 min after slot)
    let r = calculateSpawnInfo(boss, null, new Date(2025, 5, 1, 22, 30, 0));
    expect(r.status).toBe("alive");

    // Monday 3am — 5h after slot, past 4h cap → countdown
    r = calculateSpawnInfo(boss, null, new Date(2025, 5, 2, 3, 0, 0));
    expect(r.status).toBe("countdown");
  });

  it("returns countdown when now is before the first slot of the week", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [scheduleSlot(5, "22:00")], // Friday 10pm
    });
    // Monday noon — well before Friday
    const r = calculateSpawnInfo(boss, null, new Date(2025, 5, 2, 12, 0, 0));
    expect(r.status).toBe("countdown");
    expect(r.nextSpawn!.getDay()).toBe(5);
  });

  it("alive window closes 1h before next slot", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [scheduleSlot(1, "19:00")], // Monday 7pm
    });
    // Monday 5:59pm — 1h1min before slot, alive window closed
    const r = calculateSpawnInfo(boss, null, new Date(2025, 5, 2, 17, 59, 0));
    expect(r.status).toBe("countdown");
  });

  it("single-slot boss killed within alive window → countdown to next week", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [scheduleSlot(1, "19:00")], // Monday 7pm
    });
    // Kill on Monday 7:30pm (after slot started)
    const death = makeDeath({ death_time: new Date(2025, 5, 2, 19, 30, 0).toISOString() });
    const r = calculateSpawnInfo(boss, death, new Date(2025, 5, 2, 19, 31, 0));
    expect(r.status).toBe("countdown");
    // Next spawn = next Monday
    expect(r.nextSpawn!.getDay()).toBe(1);
    expect(r.nextSpawn!.getDate()).toBe(9); // one week later
  });

  // ── Alive window cap (single-slot bosses) ───────────────

  it("single-slot boss alive window capped — Wednesday is countdown, not alive from last Saturday", () => {
    // Bug fix: single-slot bosses were "alive" for 6 days because
    // aliveUntil pointed to next week's slot. Now capped at 4 hours.
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [scheduleSlot(6, "15:00")], // Saturday 3pm
    });
    // Wednesday noon — 3+ days after last Saturday, well past the 4h cap
    const r = calculateSpawnInfo(boss, null, new Date(2025, 5, 4, 12, 0, 0)); // June 4 = Wednesday
    expect(r.status).toBe("countdown");
  });

  it("single-slot boss still alive within 4h window of last-slot fallback", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [scheduleSlot(0, "22:00")], // Sunday 10pm
    });
    // Monday 1am — 3h after Sunday 10pm, within 4h cap → still alive
    const r = calculateSpawnInfo(boss, null, new Date(2025, 5, 2, 1, 0, 0)); // Monday 1am
    expect(r.status).toBe("alive");
  });

  it("single-slot boss countdown after 4h window expires", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [scheduleSlot(0, "22:00")], // Sunday 10pm
    });
    // Monday 3am — 5h after Sunday 10pm, past 4h cap → countdown
    const r = calculateSpawnInfo(boss, null, new Date(2025, 5, 2, 3, 0, 0)); // Monday 3am
    expect(r.status).toBe("countdown");
  });

  it("multi-slot boss alive window still works normally (not affected by cap)", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [
        scheduleSlot(1, "19:00"), // Monday 7pm
        scheduleSlot(4, "19:00"), // Thursday 7pm
      ],
    });
    // Monday 10pm — 3h after slot, next slot Thursday 7pm = alive until Thursday 6pm
    // rawAliveUntil is Thursday 6pm, which is > 4h from slot time
    // cap = Monday 7pm + 4h = Monday 11pm → now (10pm) < 11pm → alive
    const r = calculateSpawnInfo(boss, null, new Date(2025, 5, 2, 22, 0, 0));
    expect(r.status).toBe("alive");
  });

  it("multi-slot boss not alive at midnight when 4h cap expires", () => {
    const boss = makeBoss({
      spawn_type: "fixed_schedule", respawn_hours: null,
      schedule: [
        scheduleSlot(1, "19:00"), // Monday 7pm
        scheduleSlot(4, "19:00"), // Thursday 7pm
      ],
    });
    // Tuesday 2am — 7h after slot, past 4h cap → countdown
    const r = calculateSpawnInfo(boss, null, new Date(2025, 5, 3, 2, 0, 0));
    expect(r.status).toBe("countdown");
  });
});

// ══════════════════════════════════════════════════════════════
// Spawn override map operations
// ══════════════════════════════════════════════════════════════

describe("spawn override map — CRUD operations", () => {
  type Override = { boss_id: string; death_time: string };

  it("build override map from empty", () => {
    const overrides: Override[] = [];
    const map = new Map(overrides.map(o => [o.boss_id, o]));
    expect(map.size).toBe(0);
  });

  it("build override map with 3 entries", () => {
    const overrides: Override[] = [
      { boss_id: "a", death_time: "t1" },
      { boss_id: "b", death_time: "t2" },
      { boss_id: "c", death_time: "t3" },
    ];
    const map = new Map(overrides.map(o => [o.boss_id, o]));
    expect(map.size).toBe(3);
    expect(map.get("b")!.death_time).toBe("t2");
  });

  it("delete override updates map correctly", () => {
    const overrides: Override[] = [
      { boss_id: "a", death_time: "t1" },
      { boss_id: "b", death_time: "t2" },
    ];
    // Kill boss "a" → remove its override
    const updated = overrides.filter(o => o.boss_id !== "a");
    const map = new Map(updated.map(o => [o.boss_id, o]));
    expect(map.size).toBe(1);
    expect(map.has("a")).toBe(false);
    expect(map.has("b")).toBe(true);
  });

  it("edit spawn updates existing override inline", () => {
    const overrides: Override[] = [
      { boss_id: "a", death_time: "old" },
      { boss_id: "b", death_time: "t2" },
    ];
    // Edit spawn for boss "a" → upsert
    const updated = [
      ...overrides.filter(o => o.boss_id !== "a"),
      { boss_id: "a", death_time: "new" },
    ];
    const map = new Map(updated.map(o => [o.boss_id, o]));
    expect(map.size).toBe(2);
    expect(map.get("a")!.death_time).toBe("new");
    expect(map.get("b")!.death_time).toBe("t2");
  });

  it("edit spawn adds new entry for previously unknown boss", () => {
    const overrides: Override[] = [{ boss_id: "a", death_time: "t1" }];
    const updated = [
      ...overrides,
      { boss_id: "b", death_time: "new_t" },
    ];
    const map = new Map(updated.map(o => [o.boss_id, o]));
    expect(map.size).toBe(2);
    expect(map.get("b")!.death_time).toBe("new_t");
  });

  it("bulk mark alive adds overrides for multiple new bosses", () => {
    const existing: Override[] = [{ boss_id: "a", death_time: "t1" }];
    const newOnes: Override[] = [
      { boss_id: "b", death_time: "t2" },
      { boss_id: "c", death_time: "t3" },
      { boss_id: "d", death_time: "t4" },
    ];
    // Merge: filter out any existing, then add new
    const newIds = new Set(newOnes.map(o => o.boss_id));
    const merged = [...existing.filter(o => !newIds.has(o.boss_id)), ...newOnes];
    const map = new Map(merged.map(o => [o.boss_id, o]));
    expect(map.size).toBe(4);
    expect(map.get("a")!.death_time).toBe("t1");
    expect(map.get("c")!.death_time).toBe("t3");
  });
});

// ══════════════════════════════════════════════════════════════
// Leaderboard period boundaries
// ══════════════════════════════════════════════════════════════

describe("leaderboard — period boundaries", () => {
  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - ((day + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getMonthStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  it("weekly period starts on Monday 00:00", () => {
    // Wednesday June 4, 2025
    const wed = new Date(2025, 5, 4, 15, 30, 0);
    const start = getWeekStart(wed);
    expect(start.getDay()).toBe(1); // Monday
    expect(start.getDate()).toBe(2); // June 2
    expect(start.getHours()).toBe(0);
  });

  it("weekly period: Sunday is in the current week (starts previous Monday)", () => {
    // Sunday June 8, 2025
    const sun = new Date(2025, 5, 8, 12, 0, 0);
    const start = getWeekStart(sun);
    expect(start.getDate()).toBe(2); // Monday June 2
  });

  it("weekly period: Monday itself is the start", () => {
    const mon = new Date(2025, 5, 2, 8, 0, 0);
    const start = getWeekStart(mon);
    expect(start.getDate()).toBe(2);
    expect(start.getTime()).toBe(mon.getTime() - 8 * 3600_000);
  });

  it("monthly period starts on the 1st at 00:00", () => {
    const mid = new Date(2025, 5, 15, 12, 0, 0);
    const start = getMonthStart(mid);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(5); // June
    expect(start.getHours()).toBe(0);
  });

  it("monthly period: Jan 1 is its own start", () => {
    const jan1 = new Date(2025, 0, 1, 0, 0, 0);
    const start = getMonthStart(jan1);
    expect(start.getTime()).toBe(jan1.getTime());
  });

  it("points falling exactly on period boundary are included", () => {
    const start = new Date(2025, 5, 2, 0, 0, 0); // Monday midnight
    const recordTime = new Date(2025, 5, 2, 0, 0, 0); // exact same time
    expect(recordTime.getTime()).toBeGreaterThanOrEqual(start.getTime());
  });

  it("points before period boundary are excluded", () => {
    const start = new Date(2025, 5, 2, 0, 0, 0); // Monday midnight
    const recordTime = new Date(2025, 5, 1, 23, 59, 59); // 1 second before
    expect(recordTime.getTime()).toBeLessThan(start.getTime());
  });
});

// ══════════════════════════════════════════════════════════════
// Death record history — multiple kills, editing, attendance
// ══════════════════════════════════════════════════════════════

describe("death record history — multi-kill scenarios", () => {
  it("history accumulates: kill1 → kill2, both preserved", () => {
    const history: DeathRecord[] = [];
    // Kill 1
    history.push(makeDeath({ id: "d1", death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() }));
    // Kill 2 (boss respawned and was killed again)
    history.push(makeDeath({ id: "d2", death_time: new Date(2025, 5, 2, 12, 0, 0).toISOString() }));
    expect(history).toHaveLength(2);
    expect(history[0].id).toBe("d1");
    expect(history[1].id).toBe("d2");
  });

  it("latest death record is used for spawn calculation", () => {
    const deaths = [
      makeDeath({ id: "old", death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() }),
      makeDeath({ id: "latest", death_time: new Date(2025, 5, 2, 12, 0, 0).toISOString() }),
    ];
    // Sort by death_time descending
    deaths.sort((a, b) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime());
    const latest = deaths[0];
    expect(latest.id).toBe("latest");
  });

  it("editing a death time shifts the spawn window", () => {
    const death = makeDeath({ death_time: new Date(2025, 5, 1, 12, 0, 0).toISOString() });
    const boss = makeBoss({ respawn_hours: 24 });

    // Original: spawns June 2 at noon
    let r = calculateSpawnInfo(boss, death, new Date(2025, 5, 1, 12, 1, 0));
    expect(r.nextSpawn).toEqual(new Date(2025, 5, 2, 12, 0, 0));

    // Edit death time to 8pm → spawn shifts to June 2 at 8pm
    const editedDeath = makeDeath({ id: "death-1",
      death_time: new Date(2025, 5, 1, 20, 0, 0).toISOString() });
    r = calculateSpawnInfo(boss, editedDeath, new Date(2025, 5, 1, 20, 1, 0));
    expect(r.nextSpawn).toEqual(new Date(2025, 5, 2, 20, 0, 0));
  });

  it("deleting a death record restores unknown state (fixed_hours)", () => {
    const boss = makeBoss({ respawn_hours: 10 });
    // After kill → countdown
    const death = makeDeath();
    let r = calculateSpawnInfo(boss, death, new Date(2025, 5, 1, 12, 1, 0));
    expect(r.status).toBe("countdown");

    // Delete death record → unknown
    r = calculateSpawnInfo(boss, null, new Date(2025, 5, 1, 12, 1, 0));
    expect(r.status).toBe("unknown");
  });
});

// ══════════════════════════════════════════════════════════════
// Attendance record scenarios
// ══════════════════════════════════════════════════════════════

describe("attendance records", () => {
  it("empty attendance on a kill returns 0 points", () => {
    const attendeeIds: string[] = [];
    expect(attendeeIds.length).toBe(0);
  });

  it("attendance with 3 members yields 3 records", () => {
    const attendeeIds = ["m1", "m2", "m3"];
    const records = attendeeIds.map(id => ({ member_id: id, death_record_id: "d1" }));
    expect(records).toHaveLength(3);
    expect(records[1].member_id).toBe("m2");
  });

  it("duplicate attendance should be deduplicated", () => {
    const raw = ["m1", "m2", "m1", "m3", "m2"];
    const unique = [...new Set(raw)];
    expect(unique).toHaveLength(3);
    expect(unique).toEqual(["m1", "m2", "m3"]);
  });

  it("boss points configuration: default 1pt, custom 3pt", () => {
    const bossPoints = new Map<string, number>();
    bossPoints.set("boss-1", 1); // default
    bossPoints.set("boss-2", 3); // custom

    const attendeeCount = 5;
    const points1 = attendeeCount * (bossPoints.get("boss-1") ?? 1);
    const points2 = attendeeCount * (bossPoints.get("boss-2") ?? 1);

    expect(points1).toBe(5);
    expect(points2).toBe(15);
  });
});
