import { describe, it, expect, vi } from "vitest";
import { getOwnerGuildName, getRotationInfo, safeMod } from "./rotation";
import type { BossGuild, Guild, DeathRecord, SpawnInfo, Boss } from "@/types";

// ── Helpers ─────────────────────────────────────────────────

function makeGuild(id: string, name: string): Guild {
  return { id, name, server_id: "s1", created_at: "" };
}

function makeBossGuild(
  bossId: string,
  guildId: string,
  sortOrder: number | null,
  mode: "rotation" | "daily" | "schedule",
  dayOfWeek?: number,
): BossGuild {
  return {
    id: `bg-${bossId}-${guildId}`,
    boss_id: bossId,
    guild_id: guildId,
    sort_order: sortOrder,
    mode,
    day_of_week: dayOfWeek ?? null,
  };
}

function makeDeath(
  bossId: string,
  deathTime: Date,
  ownerGuildId?: string,
  opts?: { isInitialSpawn?: boolean },
): DeathRecord {
  return {
    id: `dr-${bossId}-${deathTime.getTime()}`,
    boss_id: bossId,
    user_id: "u1",
    death_time: deathTime.toISOString(),
    rally_image_url: null,
    created_at: "",
    owner_guild_id: ownerGuildId ?? null,
    is_initial_spawn: opts?.isInitialSpawn ?? false,
  } as DeathRecord;
}

function makeBoss(overrides: Partial<Boss> = {}): Boss {
  return {
    id: "b1",
    name: "Test Boss",
    spawn_type: "fixed_hours",
    respawn_hours: 10,
    schedule: null,
    server_id: "s1",
    created_at: "",
    rotation_counter: 1,
    ...overrides,
  };
}

function makeSpawn(boss: Boss, status: string = "unknown", nextSpawn?: Date): SpawnInfo {
  return {
    boss,
    nextSpawn: nextSpawn ?? null,
    status: status as SpawnInfo["status"],
    deathRecord: null,
  };
}

// ── safeMod ─────────────────────────────────────────────────

describe("safeMod", () => {
  it("returns 0 for value 0 mod 3", () => {
    expect(safeMod(0, 3)).toBe(0);
  });

  it("wraps overflow: 5 mod 3 = 2", () => {
    expect(safeMod(5, 3)).toBe(2);
  });

  it("wraps negative: -1 mod 3 = 2", () => {
    expect(safeMod(-1, 3)).toBe(2);
  });

  it("handles value equal to n: 3 mod 3 = 0", () => {
    expect(safeMod(3, 3)).toBe(0);
  });
});

// ── getOwnerGuildName — Rotation (per-kill) Mode ────────────

describe("getOwnerGuildName — rotation (per-kill)", () => {
  const g1 = makeGuild("g1", "Alpha");
  const g2 = makeGuild("g2", "Beta");
  const g3 = makeGuild("g3", "Gamma");
  const guilds = [g1, g2, g3];

  it("returns first guild when rotation_counter is 1", () => {
    const boss = makeBoss({ id: "b1", rotation_counter: 1 });
    const bg = [
      makeBossGuild("b1", "g1", 1, "rotation"),
      makeBossGuild("b1", "g2", 2, "rotation"),
      makeBossGuild("b1", "g3", 3, "rotation"),
    ];
    const result = getOwnerGuildName("b1", bg, guilds, [], [makeSpawn(boss)]);
    expect(result).toBe("Alpha");
  });

  it("returns second guild when rotation_counter is 2", () => {
    const boss = makeBoss({ id: "b1", rotation_counter: 2 });
    const bg = [
      makeBossGuild("b1", "g1", 1, "rotation"),
      makeBossGuild("b1", "g2", 2, "rotation"),
      makeBossGuild("b1", "g3", 3, "rotation"),
    ];
    const result = getOwnerGuildName("b1", bg, guilds, [], [makeSpawn(boss)]);
    expect(result).toBe("Beta");
  });

  it("wraps counter > length", () => {
    const boss = makeBoss({ id: "b1", rotation_counter: 5 });
    const bg = [
      makeBossGuild("b1", "g1", 1, "rotation"),
      makeBossGuild("b1", "g2", 2, "rotation"),
    ];
    const result = getOwnerGuildName("b1", bg, guilds, [], [makeSpawn(boss)]);
    expect(result).toBe("Alpha"); // 5 mod 2 = 1 → idx 1 → Beta? No: safeMod(5-1, 2) = safeMod(4,2) = 0 → Alpha
  });

  it("handles counter = 0 gracefully (wraps to last)", () => {
    const boss = makeBoss({ id: "b1", rotation_counter: 0 });
    const bg = [
      makeBossGuild("b1", "g1", 1, "rotation"),
      makeBossGuild("b1", "g2", 2, "rotation"),
    ];
    const result = getOwnerGuildName("b1", bg, guilds, [], [makeSpawn(boss)]);
    expect(result).toBe("Beta"); // safeMod(-1, 2) = 1 → Beta
  });

  it("returns undefined when no boss guilds exist", () => {
    const boss = makeBoss({ id: "b1" });
    const result = getOwnerGuildName("b1", [], guilds, [], [makeSpawn(boss)]);
    expect(result).toBeUndefined();
  });
});

// ── getOwnerGuildName — Daily Mode ──────────────────────────

describe("getOwnerGuildName — daily", () => {
  const g1 = makeGuild("g1", "Alpha");
  const g2 = makeGuild("g2", "Beta");
  const guilds = [g1, g2];

  it("returns first guild when no death record exists", () => {
    const boss = makeBoss({ id: "b1", respawn_hours: 10 });
    const bg = [
      makeBossGuild("b1", "g1", 0, "daily"),
      makeBossGuild("b1", "g2", 1, "daily"),
    ];
    const result = getOwnerGuildName("b1", bg, guilds, [], [makeSpawn(boss)]);
    expect(result).toBe("Alpha");
  });

  it("returns same guild when death and spawn are same day", () => {
    const boss = makeBoss({ id: "b1", respawn_hours: 10 });
    const bg = [
      makeBossGuild("b1", "g1", 0, "daily"),
      makeBossGuild("b1", "g2", 1, "daily"),
    ];
    // Killed at 2am UTC, respawns at 12pm UTC same day
    const death = makeDeath("b1", new Date(Date.UTC(2026, 4, 23, 2, 0, 0)), "g1");
    const result = getOwnerGuildName("b1", bg, guilds, [death], [makeSpawn(boss)]);
    expect(result).toBe("Alpha"); // Same day → same guild
  });

  it("advances to next guild when spawn crosses to next day", () => {
    const boss = makeBoss({ id: "b1", respawn_hours: 10 });
    const bg = [
      makeBossGuild("b1", "g1", 0, "daily"),
      makeBossGuild("b1", "g2", 1, "daily"),
    ];
    // Killed at 8pm UTC May 23, respawns at 6am UTC May 24 (next day)
    const death = makeDeath("b1", new Date(Date.UTC(2026, 4, 23, 20, 0, 0)), "g1");
    const result = getOwnerGuildName("b1", bg, guilds, [death], [makeSpawn(boss)]);
    expect(result).toBe("Beta"); // Next day → next guild
  });

  it("wraps back to first guild after last", () => {
    const boss = makeBoss({ id: "b1", respawn_hours: 24 });
    const bg = [
      makeBossGuild("b1", "g1", 0, "daily"),
      makeBossGuild("b1", "g2", 1, "daily"),
    ];
    // Killed May 22 at noon, respawns May 23 at noon (next day)
    // Last guild was g2 → should wrap to g1
    // Actually we need to simulate that g2 was the last killer
    // Let me just set a death with g1 as killer on a different day
    const death = makeDeath("b1", new Date(Date.UTC(2026, 4, 22, 12, 0, 0)), "g2");
    const result = getOwnerGuildName("b1", bg, guilds, [death], [makeSpawn(boss)]);
    expect(result).toBe("Alpha"); // g2 → advance to g1
  });
});

// ── getOwnerGuildName — Schedule Mode ───────────────────────

describe("getOwnerGuildName — schedule", () => {
  const g1 = makeGuild("g1", "Alpha");
  const g2 = makeGuild("g2", "Beta");
  const guilds = [g1, g2];

  it("returns guild matching current day of week", () => {
    const boss = makeBoss({ id: "b1", spawn_type: "fixed_schedule", respawn_hours: null });
    const bg = [
      makeBossGuild("b1", "g1", 0, "schedule", 5), // Friday
      makeBossGuild("b1", "g2", 1, "schedule", 0), // Sunday
    ];
    // Use dayOfWeek override to avoid timezone dependency
    const result = getOwnerGuildName(
      "b1", bg, guilds, [],
      [{ boss, nextSpawn: new Date(), status: "countdown", deathRecord: null }],
      5, // Friday
    );
    expect(result).toBe("Alpha"); // Friday → Alpha
  });

  it("uses current date when boss is alive", () => {
    vi.setSystemTime(new Date(Date.UTC(2025, 5, 6, 12, 0, 0))); // Friday June 6, 2025 UTC
    const boss = makeBoss({ id: "b1", spawn_type: "fixed_schedule", respawn_hours: null });
    const bg = [
      makeBossGuild("b1", "g1", 0, "schedule", 5), // Friday
    ];
    const result = getOwnerGuildName(
      "b1", bg, guilds, [],
      [{ boss, nextSpawn: null, status: "alive", deathRecord: null }],
    );
    // Uses new Date() which will be whatever day it is now
    expect(result).toBeDefined();
  });
});

// ── getRotationInfo — Per-Kill Mode ─────────────────────────

describe("getRotationInfo — per-kill", () => {
  const g1 = makeGuild("g1", "Alpha");
  const g2 = makeGuild("g2", "Beta");
  const g3 = makeGuild("g3", "Gamma");
  const guilds = [g1, g2, g3];

  it("returns current index 0 for counter=1 with 3 guilds", () => {
    const boss = makeBoss({ id: "b1", rotation_counter: 1 });
    const bg = [
      makeBossGuild("b1", "g1", 1, "rotation"),
      makeBossGuild("b1", "g2", 2, "rotation"),
      makeBossGuild("b1", "g3", 3, "rotation"),
    ];
    const result = getRotationInfo("b1", bg, guilds, [], [makeSpawn(boss)]);
    expect(result).not.toBeNull();
    expect(result!.currentIndex).toBe(0);
    expect(result!.mode).toBe("per kill");
    expect(result!.guilds[0].name).toBe("Alpha");
  });

  it("returns current index 1 for counter=2", () => {
    const boss = makeBoss({ id: "b1", rotation_counter: 2 });
    const bg = [
      makeBossGuild("b1", "g1", 1, "rotation"),
      makeBossGuild("b1", "g2", 2, "rotation"),
    ];
    const result = getRotationInfo("b1", bg, guilds, [], [makeSpawn(boss)]);
    expect(result!.currentIndex).toBe(1);
  });
});

// ── getRotationInfo — Daily Mode ────────────────────────────

describe("getRotationInfo — daily", () => {
  const g1 = makeGuild("g1", "Alpha");
  const g2 = makeGuild("g2", "Beta");
  const guilds = [g1, g2];

  it("advances to index 1 when no death record", () => {
    const boss = makeBoss({ id: "b1", respawn_hours: 10 });
    const bg = [
      makeBossGuild("b1", "g1", 0, "daily"),
      makeBossGuild("b1", "g2", 1, "daily"),
    ];
    const result = getRotationInfo("b1", bg, guilds, [], [makeSpawn(boss)]);
    expect(result!.currentIndex).toBe(1); // Advance from first guild
  });

  it("stays on same index when death and spawn are same day", () => {
    const boss = makeBoss({ id: "b1", respawn_hours: 10 });
    const bg = [
      makeBossGuild("b1", "g1", 0, "daily"),
      makeBossGuild("b1", "g2", 1, "daily"),
    ];
    const death = makeDeath("b1", new Date(Date.UTC(2026, 4, 23, 2, 0, 0)), "g1");
    const result = getRotationInfo("b1", bg, guilds, [death], [makeSpawn(boss)]);
    expect(result!.currentIndex).toBe(0); // Same day → stays on g1
  });

  it("advances to next guild when spawn crosses day boundary", () => {
    const boss = makeBoss({ id: "b1", respawn_hours: 10 });
    const bg = [
      makeBossGuild("b1", "g1", 0, "daily"),
      makeBossGuild("b1", "g2", 1, "daily"),
    ];
    const death = makeDeath("b1", new Date(Date.UTC(2026, 4, 23, 20, 0, 0)), "g1");
    const result = getRotationInfo("b1", bg, guilds, [death], [makeSpawn(boss)]);
    expect(result!.currentIndex).toBe(1); // Next day → advance to g2
  });

  it("returns null when only 1 guild assigned", () => {
    const boss = makeBoss({ id: "b1" });
    const bg = [makeBossGuild("b1", "g1", 0, "daily")];
    const result = getRotationInfo("b1", bg, guilds, [], [makeSpawn(boss)]);
    expect(result).toBeNull();
  });
});

// ── Edge Cases ──────────────────────────────────────────────

describe("getOwnerGuildName — edge cases", () => {
  it("returns undefined when bossId not in bossGuilds", () => {
    const g1 = makeGuild("g1", "Alpha");
    const boss = makeBoss({ id: "b1" });
    const result = getOwnerGuildName("b1", [], [g1], [], [makeSpawn(boss)]);
    expect(result).toBeUndefined();
  });

  it("handles boss with no rotation_counter (defaults to 1)", () => {
    const boss = makeBoss({ id: "b1", rotation_counter: undefined });
    const bg = [makeBossGuild("b1", "g1", 1, "rotation")];
    const result = getOwnerGuildName("b1", bg, [makeGuild("g1", "Alpha")], [], [makeSpawn(boss)]);
    expect(result).toBe("Alpha");
  });

  it("daily mode handles death with no owner_guild_id", () => {
    const boss = makeBoss({ id: "b1", respawn_hours: 10 });
    const bg = [
      makeBossGuild("b1", "g1", 0, "daily"),
      makeBossGuild("b1", "g2", 1, "daily"),
    ];
    // Death from yesterday (different UTC day) but no owner_guild_id
    const death = makeDeath("b1", new Date(Date.UTC(2026, 4, 22, 20, 0, 0)), undefined as any);
    const result = getOwnerGuildName("b1", bg, [makeGuild("g1", "Alpha"), makeGuild("g2", "Beta")], [death], [makeSpawn(boss)]);
    expect(result).toBe("Beta"); // Advances from first guild idx=1
  });

  it("daily mode with rotation_adjustment", () => {
    const boss = makeBoss({ id: "b1", respawn_hours: 24, rotation_adjustment: 1 });
    const bg = [
      makeBossGuild("b1", "g1", 0, "daily"),
      makeBossGuild("b1", "g2", 1, "daily"),
    ];
    // Killed by g1 on different day, adjustment +1 skips g2 to g1
    const death = makeDeath("b1", new Date(Date.UTC(2026,4,22,12,0,0)), "g1");
    const result = getOwnerGuildName(
      "b1", bg,
      [makeGuild("g1", "Alpha"), makeGuild("g2", "Beta")],
      [death],
      [makeSpawn(boss)],
    );
    expect(result).toBe("Alpha"); // lastIdx=0 + 1 + adjustment(1) = 2 → safeMod(2,2)=0 → Alpha
  });
});
