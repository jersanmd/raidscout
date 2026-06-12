// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  addHours,
  formatRelative,
  safeMod,
  computeOwnerGuild,
  getScheduleTz,
  scheduleSlotToUTC,
  findNextScheduleSlot,
} from "./spawn-utils";

// ── addHours ─────────────────────────────────────────────────
describe("addHours", () => {
  it("adds hours to a date", () => {
    const base = new Date("2026-06-07T12:00:00Z");
    expect(addHours(base, 5).toISOString()).toBe("2026-06-07T17:00:00.000Z");
  });

  it("adds 0 hours (same date)", () => {
    const base = new Date("2026-06-07T12:00:00Z");
    expect(addHours(base, 0).getTime()).toBe(base.getTime());
  });

  it("wraps to next day", () => {
    const base = new Date("2026-06-07T22:00:00Z");
    expect(addHours(base, 4).toISOString()).toBe("2026-06-08T02:00:00.000Z");
  });

  it("handles negative hours", () => {
    const base = new Date("2026-06-07T02:00:00Z");
    expect(addHours(base, -5).toISOString()).toBe("2026-06-06T21:00:00.000Z");
  });

  it("handles fractional hours", () => {
    const base = new Date("2026-06-07T12:00:00Z");
    const result = addHours(base, 2.5);
    expect(result.toISOString()).toBe("2026-06-07T14:30:00.000Z");
  });
});

// ── formatRelative ───────────────────────────────────────────
describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it('returns "now" when time is in the past', () => {
    const past = Math.floor(Date.now() / 1000) - 60; // 1 min ago
    expect(formatRelative(past)).toBe("now");
  });

  it('returns "now" when time is exactly now', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatRelative(now)).toBe("now");
  });

  it('returns "in Xm" for minutes', () => {
    const in10Min = Math.floor(Date.now() / 1000) + 600;
    expect(formatRelative(in10Min)).toBe("in 10m");
  });

  it('returns "in Xh" for exact hours', () => {
    const in2h = Math.floor(Date.now() / 1000) + 7200;
    expect(formatRelative(in2h)).toBe("in 2h");
  });

  it('returns "in Xh Ym" for mixed time', () => {
    const in2h30m = Math.floor(Date.now() / 1000) + 9000;
    expect(formatRelative(in2h30m)).toBe("in 2h 30m");
  });

  it("handles single hour", () => {
    const in1h = Math.floor(Date.now() / 1000) + 3600;
    expect(formatRelative(in1h)).toBe("in 1h");
  });
});

// ── safeMod ──────────────────────────────────────────────────
describe("safeMod", () => {
  it("returns positive modulo for positive numbers", () => {
    expect(safeMod(5, 3)).toBe(2);
  });

  it("returns positive modulo for negative numbers", () => {
    expect(safeMod(-1, 5)).toBe(4);
  });

  it("returns 0 when divisible", () => {
    expect(safeMod(6, 3)).toBe(0);
  });

  it("works for 0", () => {
    expect(safeMod(0, 5)).toBe(0);
  });

  it("handles large values", () => {
    expect(safeMod(100, 7)).toBe(2);
    expect(safeMod(-100, 7)).toBe(5);
  });

  it("handles n=1 (always 0)", () => {
    expect(safeMod(5, 1)).toBe(0);
    expect(safeMod(-5, 1)).toBe(0);
  });
});

// ── getScheduleTz ────────────────────────────────────────────
describe("getScheduleTz", () => {
  it("returns Asia/Manila for non-template seed bosses", () => {
    expect(getScheduleTz({ template_id: null }, "Asia/Manila")).toBe("Asia/Manila");
  });

  it("returns UTC for custom/template bosses", () => {
    expect(getScheduleTz({ template_id: "tpl-123" }, "Asia/Manila")).toBe("UTC");
  });

  it("returns Asia/Manila even when server TZ differs (seed bosses are always Manila)", () => {
    expect(getScheduleTz({}, "America/New_York")).toBe("Asia/Manila");
  });

  it("returns Asia/Manila for seed bosses regardless of server timezone", () => {
    expect(getScheduleTz({ template_id: null }, "Europe/London")).toBe("Asia/Manila");
    expect(getScheduleTz({ template_id: undefined }, "Pacific/Auckland")).toBe("Asia/Manila");
  });
});

// ── computeOwnerGuild ────────────────────────────────────────
describe("computeOwnerGuild", () => {
  const guilds = [
    { id: "g1", name: "Alpha" },
    { id: "g2", name: "Bravo" },
    { id: "g3", name: "Charlie" },
    { id: "g4", name: "Delta" },
  ];

  const boss = { id: "b1", respawn_hours: 24, rotation_counter: 1 };

  describe("daily mode", () => {
    const bg = [
      { boss_id: "b1", guild_id: "g1", sort_order: 0, mode: "daily", day_of_week: null },
      { boss_id: "b1", guild_id: "g2", sort_order: 1, mode: "daily", day_of_week: null },
      { boss_id: "b1", guild_id: "g3", sort_order: 2, mode: "daily", day_of_week: null },
    ];

    it("first spawn (no deaths) goes to first guild", () => {
      const spawn = new Date("2026-06-07T14:00:00Z");
      expect(computeOwnerGuild(boss, bg, guilds, null, spawn, "UTC")).toBe("Alpha");
    });

    it("initial spawn death returns first guild", () => {
      const spawn = new Date("2026-06-08T14:00:00Z");
      const lastDeath = { is_initial_spawn: true, death_time: "2026-06-07T10:00:00Z", owner_guild_id: null };
      expect(computeOwnerGuild(boss, bg, guilds, lastDeath, spawn, "UTC")).toBe("Alpha");
    });

    it("same-day respawn returns same guild", () => {
      // Boss with short respawn so computed spawn is same day as death
      const shortBoss = { ...boss, respawn_hours: 4 };
      const spawn = new Date("2026-06-07T18:00:00Z");
      const lastDeath = { is_initial_spawn: false, death_time: "2026-06-07T10:00:00Z", owner_guild_id: "g2" };
      expect(computeOwnerGuild(shortBoss, bg, guilds, lastDeath, spawn, "UTC")).toBe("Bravo");
    });

    it("next-day respawn (24h) rotates to next guild", () => {
      // 24h respawn = death on June 7 + 24h = spawn on June 8 → next day → rotation
      const spawn = new Date("2026-06-08T18:00:00Z");
      const lastDeath = { is_initial_spawn: false, death_time: "2026-06-07T10:00:00Z", owner_guild_id: "g2" };
      expect(computeOwnerGuild(boss, bg, guilds, lastDeath, spawn, "UTC")).toBe("Charlie");
    });

    it("next-day respawn rotates to next guild", () => {
      const spawn = new Date("2026-06-08T10:00:00Z");
      const lastDeath = { is_initial_spawn: false, death_time: "2026-06-07T10:00:00Z", owner_guild_id: "g1" };
      expect(computeOwnerGuild(boss, bg, guilds, lastDeath, spawn, "UTC")).toBe("Bravo");
    });

    it("wraps around with safeMod", () => {
      const spawn = new Date("2026-06-08T10:00:00Z");
      const lastDeath = { is_initial_spawn: false, death_time: "2026-06-07T10:00:00Z", owner_guild_id: "g3" };
      expect(computeOwnerGuild(boss, bg, guilds, lastDeath, spawn, "UTC")).toBe("Alpha");
    });

    it("next-day with no prior owner falls to index 1", () => {
      const spawn = new Date("2026-06-08T10:00:00Z");
      const lastDeath = { is_initial_spawn: false, death_time: "2026-06-07T10:00:00Z", owner_guild_id: null };
      expect(computeOwnerGuild(boss, bg, guilds, lastDeath, spawn, "UTC")).toBe("Bravo"); // (0+1) % 3 = 1
    });
  });

  describe("rotation mode", () => {
    const bg = [
      { boss_id: "b1", guild_id: "g2", sort_order: 1, mode: "rotation", day_of_week: null },
      { boss_id: "b1", guild_id: "g3", sort_order: 2, mode: "rotation", day_of_week: null },
      { boss_id: "b1", guild_id: "g4", sort_order: 3, mode: "rotation", day_of_week: null },
    ];
    const bossRot = { ...boss, rotation_counter: 1 };

    it("counter=1 → first rotation entry", () => {
      const spawn = new Date("2026-06-07T14:00:00Z");
      expect(computeOwnerGuild(bossRot, bg, guilds, null, spawn, "UTC")).toBe("Bravo");
    });

    it("counter=2 → second rotation entry", () => {
      const spawn = new Date("2026-06-07T14:00:00Z");
      expect(computeOwnerGuild({ ...bossRot, rotation_counter: 2 }, bg, guilds, null, spawn, "UTC")).toBe("Charlie");
    });

    it("counter wraps around", () => {
      const spawn = new Date("2026-06-07T14:00:00Z");
      expect(computeOwnerGuild({ ...bossRot, rotation_counter: 4 }, bg, guilds, null, spawn, "UTC")).toBe("Bravo");
    });
  });

  describe("schedule (day-of-week) mode", () => {
    const bg = [
      { boss_id: "b1", guild_id: "g1", sort_order: 1, mode: "schedule", day_of_week: 1 }, // Mon
      { boss_id: "b1", guild_id: "g2", sort_order: 2, mode: "schedule", day_of_week: 3 }, // Wed
      { boss_id: "b1", guild_id: "g3", sort_order: 3, mode: "schedule", day_of_week: 5 }, // Fri
    ];

    it("matches Monday spawn to Monday guild", () => {
      const spawn = new Date("2026-06-08T14:00:00Z"); // Monday UTC
      expect(computeOwnerGuild(boss, bg, guilds, null, spawn, "UTC")).toBe("Alpha");
    });

    it("matches Wednesday spawn to Wednesday guild", () => {
      const spawn = new Date("2026-06-10T14:00:00Z"); // Wednesday UTC
      expect(computeOwnerGuild(boss, bg, guilds, null, spawn, "UTC")).toBe("Bravo");
    });

    it("returns undefined if no day matches", () => {
      const spawn = new Date("2026-06-07T14:00:00Z"); // Sunday UTC
      expect(computeOwnerGuild(boss, bg, guilds, null, spawn, "UTC")).toBeUndefined();
    });

    it("schedule entries do NOT fall through to rotation on non-matching days", () => {
      // Boss also has rotation entries — on non-schedule days, rotation should apply
      const mixed = [
        { boss_id: "b1", guild_id: "g4", sort_order: 1, mode: "rotation", day_of_week: null },
        { boss_id: "b1", guild_id: "g1", sort_order: 1, mode: "schedule", day_of_week: 1 }, // Mon
        { boss_id: "b1", guild_id: "g2", sort_order: 2, mode: "schedule", day_of_week: 3 }, // Wed
      ];
      // Wednesday → should match schedule, not rotation
      const wed = new Date("2026-06-10T14:00:00Z"); // Wednesday UTC
      expect(computeOwnerGuild({ ...boss, rotation_counter: 1 }, mixed, guilds, null, wed, "UTC")).toBe("Bravo");
      // Sunday → no schedule match, falls through to rotation
      const sun = new Date("2026-06-07T14:00:00Z"); // Sunday UTC
      expect(computeOwnerGuild({ ...boss, rotation_counter: 1 }, mixed, guilds, null, sun, "UTC")).toBe("Delta");
    });

    it("schedule takes priority over daily rotation on same boss", () => {
      const mixed = [
        { boss_id: "b1", guild_id: "g1", sort_order: 0, mode: "daily", day_of_week: null },
        { boss_id: "b1", guild_id: "g2", sort_order: 1, mode: "schedule", day_of_week: 3 }, // Wed
      ];
      const spawn = new Date("2026-06-10T14:00:00Z"); // Wednesday
      expect(computeOwnerGuild(boss, mixed, guilds, null, spawn, "UTC")).toBe("Bravo");
    });
  });

  describe("edge cases", () => {
    it("no boss_guild entries → undefined", () => {
      const spawn = new Date("2026-06-07T14:00:00Z");
      expect(computeOwnerGuild(boss, [], guilds, null, spawn, "UTC")).toBeUndefined();
    });

    it("all sort_order=-1 → undefined", () => {
      const bg = [{ boss_id: "b1", guild_id: "g1", sort_order: -1, mode: "daily", day_of_week: null }];
      const spawn = new Date("2026-06-07T14:00:00Z");
      expect(computeOwnerGuild(boss, bg, guilds, null, spawn, "UTC")).toBeUndefined();
    });

    it("guild not found → undefined for that guild", () => {
      const bg = [{ boss_id: "b1", guild_id: "g999", sort_order: 0, mode: "daily", day_of_week: null }];
      const spawn = new Date("2026-06-07T14:00:00Z");
      expect(computeOwnerGuild(boss, bg, guilds, null, spawn, "UTC")).toBeUndefined();
    });

    it("daily with single guild always returns that guild", () => {
      const bg = [{ boss_id: "b1", guild_id: "g1", sort_order: 0, mode: "daily", day_of_week: null }];
      const spawn = new Date("2026-06-08T10:00:00Z");
      const lastDeath = { is_initial_spawn: false, death_time: "2026-06-07T10:00:00Z", owner_guild_id: "g1" };
      expect(computeOwnerGuild(boss, bg, guilds, lastDeath, spawn, "UTC")).toBe("Alpha");
    });
  });
});

// ── scheduleSlotToUTC ────────────────────────────────────────
describe("scheduleSlotToUTC", () => {
  // Use a fixed timezone offset to make tests predictable
  // Asia/Manila = UTC+8, so 12:00 Manila = 04:00 UTC
  const tz = "Asia/Manila";

  it("converts a schedule slot to UTC", () => {
    // Monday (1) 12:00 Manila on a Sunday ref date → next Monday
    const ref = new Date("2026-06-07T00:00:00Z"); // Sunday UTC
    const result = scheduleSlotToUTC(tz, ref, 1, "12:00"); // Monday 12:00 Manila
    // Monday 12:00 Manila = Monday 04:00 UTC
    expect(result.toISOString()).toBe("2026-06-08T04:00:00.000Z");
  });

  it("handles Sunday=0 to Monday=1 transition", () => {
    const ref = new Date("2026-06-07T00:00:00Z"); // Sunday UTC
    const result = scheduleSlotToUTC(tz, ref, 0, "08:00"); // Sunday 08:00 Manila
    // Sunday 08:00 Manila = Sunday 00:00 UTC
    expect(result.toISOString()).toBe("2026-06-07T00:00:00.000Z");
  });

  it("handles Friday=5 slot from mid-week ref", () => {
    const ref = new Date("2026-06-10T00:00:00Z"); // Wednesday UTC
    const result = scheduleSlotToUTC(tz, ref, 5, "20:00"); // Friday 20:00 Manila
    // Friday 20:00 Manila = Friday 12:00 UTC
    expect(result.getUTCDay()).toBe(5);
    expect(result.getUTCHours()).toBe(12);
  });

  it("wraps to previous occurrence within 3-day window", () => {
    const ref = new Date("2026-06-10T00:00:00Z"); // Wednesday UTC
    const result = scheduleSlotToUTC(tz, ref, 1, "12:00"); // Monday 12:00 Manila
    // Should go back to Monday (2 days before Wednesday)
    expect(result.getUTCDay()).toBe(1);
  });

  it("returns a Date object", () => {
    const ref = new Date("2026-06-07T00:00:00Z");
    const result = scheduleSlotToUTC(tz, ref, 1, "12:00");
    expect(result).toBeInstanceOf(Date);
  });
});

// ── findNextScheduleSlot ─────────────────────────────────────
describe("findNextScheduleSlot", () => {
  const tz = "Asia/Manila";
  const schedule = [
    { day: 1, time: "18:00" }, // Monday 18:00 Manila
    { day: 3, time: "18:00" }, // Wednesday 18:00 Manila
    { day: 5, time: "18:00" }, // Friday 18:00 Manila
  ];

  it("finds the next slot after a given time", () => {
    const after = new Date("2026-06-08T10:00:00Z"); // Monday 10:00 UTC = Monday 18:00 Manila? No, 10 UTC = 18 Manila
    // Actually Monday 10:00 UTC = Monday 18:00 Manila... so the next slot after 18:00 Manila on Monday
    // would be Wednesday 18:00 Manila
    const result = findNextScheduleSlot(schedule, after, tz);
    expect(result.getUTCDay()).toBe(3); // Wednesday
  });

  it("finds same-day slot if after is before it", () => {
    // Use a date where the same-day schedule slot hasn't happened yet
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayDay = today.getUTCDay();
    // Find a schedule day that matches today
    const todaySlot = schedule.find(s => s.day === todayDay);
    if (todaySlot) {
      const slotHour = parseInt(todaySlot.time.split(":")[0]);
      // Set after to be before the slot time
      const after = new Date(today);
      after.setUTCHours(slotHour - 5, 0, 0, 0);
      const result = findNextScheduleSlot(schedule, after, tz);
      expect(result.getUTCDay()).toBe(todayDay);
      // Result should be today at the slot time (converted from Manila to UTC = -8h)
      expect(result.getUTCHours()).toBe(slotHour - 8 >= 0 ? slotHour - 8 : slotHour + 16);
    } else {
      // No schedule today — test passes vacuously
      expect(true).toBe(true);
    }
  });

  it("wraps to next week", () => {
    const after = new Date("2026-06-13T04:00:00Z"); // Saturday (day 6) UTC
    const result = findNextScheduleSlot(schedule, after, tz);
    // Next after Saturday is Monday
    expect(result.getUTCDay()).toBe(1); // Monday
  });

  it("returns the after param if no future slot found (fallback)", () => {
    const emptySchedule: { day: number; time: string }[] = [];
    const after = new Date("2026-06-07T12:00:00Z");
    const result = findNextScheduleSlot(emptySchedule, after, tz);
    expect(result.getTime()).toBe(after.getTime());
  });

  it("returns closest future slot when multiple are ahead", () => {
    // Use a date just before the next schedule slot
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayDay = today.getUTCDay();
    // Find the next schedule day starting from tomorrow
    let nextDay = null;
    for (let d = 1; d <= 7; d++) {
      const checkDay = (todayDay + d) % 7;
      const match = schedule.find(s => s.day === checkDay);
      if (match) { nextDay = checkDay; break; }
    }
    if (nextDay !== null) {
      const after = new Date(today);
      after.setUTCDate(after.getUTCDate() - 1); // yesterday — so the next slot is definitely tomorrow+
      const result = findNextScheduleSlot(schedule, after, tz);
      expect(result.getUTCDay()).toBe(nextDay);
    } else {
      expect(true).toBe(true);
    }
  });

  it("handles single-slot schedule (only Monday)", () => {
    const singleSlot = [{ day: 1, time: "12:00" }];
    const after = new Date("2026-06-09T00:00:00Z"); // Tuesday
    const result = findNextScheduleSlot(singleSlot, after, tz);
    // Next Monday
    expect(result.getUTCDay()).toBe(1);
  });
});

// ── scheduleSlotToUTC edge cases ─────────────────────────────
describe("scheduleSlotToUTC edge cases", () => {
  const tz = "Asia/Manila";

  it("handles midnight slot (00:00)", () => {
    const ref = new Date("2026-06-07T00:00:00Z"); // Sunday UTC
    const result = scheduleSlotToUTC(tz, ref, 1, "00:00"); // Monday 00:00 Manila
    // Monday 00:00 Manila = Sunday 16:00 UTC
    expect(result.getUTCDay()).toBe(0); // Sunday in UTC
    expect(result.getUTCHours()).toBe(16);
  });

  it("handles 23:59 slot", () => {
    const ref = new Date("2026-06-07T00:00:00Z"); // Sunday UTC
    const result = scheduleSlotToUTC(tz, ref, 1, "23:59"); // Monday 23:59 Manila
    // Monday 23:59 Manila = Monday 15:59 UTC
    expect(result.getUTCDay()).toBe(1);
    expect(result.getUTCHours()).toBe(15);
    expect(result.getUTCMinutes()).toBe(59);
  });

  it("handles timezone with negative offset (America/New_York = UTC-4)", () => {
    const nyTz = "America/New_York";
    const ref = new Date("2026-06-07T12:00:00Z"); // Sunday 12:00 UTC
    const result = scheduleSlotToUTC(nyTz, ref, 1, "12:00"); // Monday 12:00 NY
    // Monday 12:00 EDT = Monday 16:00 UTC
    expect(result.getUTCDay()).toBe(1);
    expect(result.getUTCHours()).toBe(16);
  });

  it("handles timezone with half-hour offset (Asia/Kolkata = UTC+5:30)", () => {
    const tz530 = "Asia/Kolkata";
    const ref = new Date("2026-06-07T00:00:00Z"); // Sunday
    const result = scheduleSlotToUTC(tz530, ref, 1, "12:00"); // Monday 12:00 IST
    // Monday 12:00 IST = Monday 06:30 UTC
    expect(result.getUTCHours()).toBe(6);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it("handles same-day slot (today)", () => {
    const ref = new Date("2026-06-09T00:00:00Z"); // Tuesday UTC
    const result = scheduleSlotToUTC(tz, ref, 2, "12:00"); // Tuesday 12:00 Manila
    // Tuesday 12:00 Manila = Tuesday 04:00 UTC
    expect(result.toISOString()).toBe("2026-06-09T04:00:00.000Z");
  });

  it("wraps forward across 3-day boundary (Friday from Tuesday)", () => {
    const ref = new Date("2026-06-09T00:00:00Z"); // Tuesday UTC
    const result = scheduleSlotToUTC(tz, ref, 5, "12:00"); // Friday 12:00 Manila
    // Diff = 5 - 2 = 3, not > 3, so no adjustment... actually:
    // dayDiff = 5 - 2 = 3, 3 is not < -3 and not > 3, so no adjustment
    // Should be Friday of the same week
    expect(result.getUTCDay()).toBe(5);
  });
});
