import { describe, it, expect } from "vitest";
import { guildColor, BOSSES, DAY_NAMES, DAY_NAMES_SHORT, FILTER_WINDOWS } from "./constants";

// ── guildColor ──────────────────────────────────────────────

describe("guildColor", () => {
  it("returns a color object with bg, text, and border keys", () => {
    const color = guildColor("Alpha");
    expect(color).toHaveProperty("bg");
    expect(color).toHaveProperty("text");
    expect(color).toHaveProperty("border");
    expect(typeof color.bg).toBe("string");
    expect(typeof color.text).toBe("string");
    expect(typeof color.border).toBe("string");
  });

  it("returns the same color for the same guild name (deterministic)", () => {
    const a = guildColor("Alpha");
    const b = guildColor("Alpha");
    expect(a).toEqual(b);
  });

  it("returns the same color for the same guild name called multiple times", () => {
    const results = Array.from({ length: 100 }, () => guildColor("Beta"));
    const first = results[0];
    results.forEach(r => expect(r).toEqual(first));
  });

  it("different names may map to different colors", () => {
    const names = ["Alpha", "Beta", "Gamma", "Delta", "Omega"];
    const colors = names.map(n => guildColor(n));
    // At least some should differ (not all identical)
    const uniqueBgs = new Set(colors.map(c => c.bg));
    expect(uniqueBgs.size).toBeGreaterThan(1);
  });

  it("handles empty string", () => {
    const color = guildColor("");
    expect(color).toBeDefined();
    expect(color.bg).toBeDefined();
  });

  it("handles very long guild names", () => {
    const longName = "SuperAwesomeLegendaryMegaGuildOfDoomAndDestruction12345";
    const color = guildColor(longName);
    expect(color).toBeDefined();
  });

  it("handles unicode/special characters", () => {
    const name = "Guild 🛡️ №1 — 精英";
    const color = guildColor(name);
    expect(color).toBeDefined();
    expect(color.bg).toBeDefined();
  });
});

// ── BOSSES ──────────────────────────────────────────────────

describe("BOSSES", () => {
  it("has at least 39 bosses", () => {
    expect(BOSSES.length).toBeGreaterThanOrEqual(39);
  });

  it("every boss has a non-empty name", () => {
    BOSSES.forEach(boss => {
      expect(boss.name).toBeTruthy();
      expect(boss.name.length).toBeGreaterThan(0);
    });
  });

  it("every boss has a valid spawn_type", () => {
    BOSSES.forEach(boss => {
      expect(["fixed_hours", "fixed_schedule"]).toContain(boss.spawn_type);
    });
  });

  it("fixed_hours bosses have respawn_hours set", () => {
    const hoursBosses = BOSSES.filter(b => b.spawn_type === "fixed_hours");
    expect(hoursBosses.length).toBeGreaterThan(0);
    hoursBosses.forEach(boss => {
      expect(boss.respawn_hours).toBeGreaterThan(0);
      expect(boss.schedule).toBeNull();
    });
  });

  it("fixed_schedule bosses have schedule with valid slots", () => {
    const scheduleBosses = BOSSES.filter(b => b.spawn_type === "fixed_schedule");
    expect(scheduleBosses.length).toBeGreaterThan(0);
    scheduleBosses.forEach(boss => {
      expect(boss.respawn_hours).toBeNull();
      expect(boss.schedule).not.toBeNull();
      expect(boss.schedule!.length).toBeGreaterThan(0);
      boss.schedule!.forEach(slot => {
        expect(slot.day).toBeGreaterThanOrEqual(0);
        expect(slot.day).toBeLessThanOrEqual(6);
        expect(slot.time).toMatch(/^\d{2}:\d{2}$/);
      });
    });
  });

  it("no duplicate boss names", () => {
    const names = BOSSES.map(b => b.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

// ── DAY_NAMES ───────────────────────────────────────────────

describe("DAY_NAMES", () => {
  it("has exactly 7 entries (Sunday to Saturday)", () => {
    expect(DAY_NAMES).toHaveLength(7);
  });

  it("starts with Sunday", () => {
    expect(DAY_NAMES[0]).toBe("Sunday");
  });

  it("short names match the same weekdays", () => {
    expect(DAY_NAMES_SHORT).toHaveLength(7);
    expect(DAY_NAMES_SHORT[0]).toBe("Sun");
    expect(DAY_NAMES_SHORT[6]).toBe("Sat");
  });
});

// ── FILTER_WINDOWS ─────────────────────────────────────────

describe("FILTER_WINDOWS", () => {
  it("contains 1, 8, and 24 hour windows", () => {
    expect(FILTER_WINDOWS).toEqual([1, 8, 24]);
  });
});
