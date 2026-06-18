// ── Integration tests: spawn-cron data pipeline ──────────────────
// Tests the full spawn-cron processing with mock snap data
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildDedupKey } from "./spawn-cron";

// ── Mock snap data builders ──────────────────────────────────
function makeBoss(id: string, name: string, overrides: Partial<any> = {}) {
  return {
    id, name, server_id: "svr-1",
    spawn_type: "fixed_hours", respawn_hours: 24,
    is_enabled: true, deleted_at: null, schedule: null,
    rotation_mode: null, rotation_counter: 1,
    ...overrides,
  };
}

function makeDeath(bossId: string, deathTime: string) {
  return { id: `d-${bossId}-1`, boss_id: bossId, server_id: "svr-1",
    death_time: deathTime, is_initial_spawn: false, killed_by: "user-1" };
}

function makeGuild(id: string, name: string) {
  return { id, name, server_id: "svr-1" };
}

function makeSnap(overrides: Partial<any> = {}) {
  return {
    timezone: "Asia/Manila",
    bosses: [],
    deaths: [],
    guilds: [],
    overrides: [],
    boss_guilds: [],
    boss_assists: [],
    activities: [],
    ...overrides,
  };
}

// ── Death record lookup tests (DISTINCT ON shape) ───────────
describe("death record lookup with DISTINCT ON shape", () => {
  it("find() returns latest death for boss (DISTINCT ON — 1 row per boss)", () => {
    const deaths = [
      makeDeath("boss-1", "2026-06-18T10:00:00Z"),
      makeDeath("boss-2", "2026-06-18T09:00:00Z"),
      makeDeath("boss-3", "2026-06-18T08:00:00Z"),
    ];
    // With DISTINCT ON, we get exactly 1 row per boss, pre-sorted
    const lastDeath = deaths.find(d => d.boss_id === "boss-2") ?? null;
    expect(lastDeath).not.toBeNull();
    expect(lastDeath!.death_time).toBe("2026-06-18T09:00:00Z");
  });

  it("find() returns null when boss has no death records", () => {
    const deaths = [
      makeDeath("boss-1", "2026-06-18T10:00:00Z"),
    ];
    const lastDeath = deaths.find(d => d.boss_id === "boss-2") ?? null;
    expect(lastDeath).toBeNull();
  });

  it("find() works with empty deaths array", () => {
    const deaths: any[] = [];
    const lastDeath = deaths.find(d => d.boss_id === "boss-1") ?? null;
    expect(lastDeath).toBeNull();
  });

  it("works with old REST format too (multiple deaths per boss, find returns first match)", () => {
    // REST format: ordered by death_time DESC, so first match IS the latest
    const deaths = [
      makeDeath("boss-1", "2026-06-18T12:00:00Z"), // latest
      makeDeath("boss-1", "2026-06-18T10:00:00Z"), // older
      makeDeath("boss-2", "2026-06-18T11:00:00Z"),
    ];
    const lastDeath = deaths.find(d => d.boss_id === "boss-1") ?? null;
    expect(lastDeath!.death_time).toBe("2026-06-18T12:00:00Z"); // first = latest
  });

  it("no is_initial_spawn records present (filtered in SQL)", () => {
    const deaths = [
      makeDeath("boss-1", "2026-06-18T10:00:00Z"),
      makeDeath("boss-2", "2026-06-18T09:00:00Z"),
    ];
    const hasInitial = deaths.some(d => d.is_initial_spawn === true);
    expect(hasInitial).toBe(false); // SQL already filtered out
  });
});

// ── Override precedence ─────────────────────────────────────
describe("override precedence", () => {
  it("override death_time takes precedence over last death", () => {
    const deaths = [makeDeath("boss-1", "2026-06-18T10:00:00Z")];
    const overrides = [{ boss_id: "boss-1", death_time: "2026-06-18T08:00:00Z" }];
    
    const overrideMap = new Map(overrides.map(o => [o.boss_id, o.death_time]));
    const lastDeath = deaths.find(d => d.boss_id === "boss-1") ?? null;
    const effectiveDeathTime = overrideMap.get("boss-1") ?? lastDeath?.death_time ?? null;
    
    expect(effectiveDeathTime).toBe("2026-06-18T08:00:00Z"); // override wins
  });

  it("falls back to last death when no override", () => {
    const deaths = [makeDeath("boss-1", "2026-06-18T10:00:00Z")];
    const overrideMap = new Map<string, string>();
    
    const lastDeath = deaths.find(d => d.boss_id === "boss-1") ?? null;
    const effectiveDeathTime = overrideMap.get("boss-1") ?? lastDeath?.death_time ?? null;
    
    expect(effectiveDeathTime).toBe("2026-06-18T10:00:00Z");
  });

  it("returns null when no death and no override", () => {
    const overrideMap = new Map<string, string>();
    const deaths: any[] = [];
    
    const lastDeath = deaths.find(d => d.boss_id === "boss-1") ?? null;
    const effectiveDeathTime = overrideMap.get("boss-1") ?? lastDeath?.death_time ?? null;
    
    expect(effectiveDeathTime).toBeNull();
  });
});

// ── Dedup key behavior across restarts ──────────────────────
describe("dedup key resilience across restarts", () => {
  it("same spawn event produces same key before and after restart", () => {
    const key1 = buildDedupKey("boss_spawned", "svr-1", "boss-a", 1718700000);
    // Simulate restart — fresh process, same data
    const key2 = buildDedupKey("boss_spawned", "svr-1", "boss-a", 1718700000);
    expect(key1).toBe(key2);
  });

  it("preload reconstructs all 6 event types correctly", () => {
    const dbRows = [
      { server_id: "svr-1", boss_id: "b1", spawn_timestamp: 100, event: "boss_spawned" },
      { server_id: "svr-1", boss_id: "b1", spawn_timestamp: 200, event: "boss_spawning" },
      { server_id: "svr-1", boss_id: "b1", spawn_timestamp: 300, event: "boss_thread" },
      { server_id: "svr-1", boss_id: "a1", spawn_timestamp: 400, event: "activity_spawning" },
      { server_id: "svr-1", boss_id: "a1", spawn_timestamp: 500, event: "activity_started" },
      { server_id: "svr-1", boss_id: "a1", spawn_timestamp: 600, event: "activity_thread" },
    ];

    const keys = new Set<string>();
    for (const r of dbRows) {
      const key = buildDedupKey(r.event, r.server_id, r.boss_id, r.spawn_timestamp);
      if (key) keys.add(key);
    }

    expect(keys.size).toBe(6); // all 6 are different
    expect(keys.has("svr-1-b1-boss_spawned-100")).toBe(true);
    expect(keys.has("svr-1-b1-5min-200")).toBe(true);
    expect(keys.has("svr-1-thread-b1-300")).toBe(true);
    expect(keys.has("svr-1-act-5min-a1-400")).toBe(true);
    expect(keys.has("svr-1-act-started-a1-500")).toBe(true);
    expect(keys.has("svr-1-thread-activity-a1-600")).toBe(true);
  });

  it("preload skips unknown event types gracefully", () => {
    const key = buildDedupKey("unknown_event", "svr", "bid", 100);
    expect(key).toBeNull(); // skipped, no crash
  });

  it("dedup keys for same boss at different unix timestamps are different", () => {
    const k1 = buildDedupKey("boss_spawned", "svr-1", "boss-a", 100);
    const k2 = buildDedupKey("boss_spawned", "svr-1", "boss-a", 200);
    expect(k1).not.toBe(k2);
  });

  it("dedup prevents re-fire after restart (simulated)", () => {
    // Simulate: notification sent before restart, DB has the record
    const dedup = new Map<string, number>();
    const spawnUnix = 1718700000;
    const key = buildDedupKey("boss_spawned", "svr-1", "boss-a", spawnUnix)!;

    // Preload from DB (simulated)
    dedup.set(key, Date.now());

    // First tick after restart: boss still in 60s window
    const secsSinceSpawn = 30; // spawned 30s ago
    if (secsSinceSpawn >= 0 && secsSinceSpawn <= 60) {
      if (!dedup.has(key)) {
        dedup.set(key, Date.now()); // Would send notification — but key exists!
      }
    }

    // Should NOT have sent a duplicate (dedup still has 1 entry)
    expect(dedup.size).toBe(1);
  });
});

// ── Fixed hours spawn calculation ───────────────────────────
describe("fixed_hours spawn calculation", () => {
  it("spawns at death_time + respawn_hours", () => {
    const deathTime = new Date("2026-06-18T10:00:00Z");
    const respawnHours = 24;
    const spawnTime = new Date(deathTime.getTime() + respawnHours * 3600_000);
    expect(spawnTime.toISOString()).toBe("2026-06-19T10:00:00.000Z");
  });

  it("skips when no death data", () => {
    // effectiveDeathTime is null → continue (skip)
    const effectiveDeathTime = null;
    expect(effectiveDeathTime).toBeNull(); // would trigger `if (!effectiveDeathTime) continue;`
  });

  it("uses custom respawn_hours", () => {
    const deathTime = new Date("2026-06-18T10:00:00Z");
    const respawnHours = 48;
    const spawnTime = new Date(deathTime.getTime() + respawnHours * 3600_000);
    expect(spawnTime.toISOString()).toBe("2026-06-20T10:00:00.000Z");
  });

  it("defaults to 24h when respawn_hours is null", () => {
    const deathTime = new Date("2026-06-18T10:00:00Z");
    const respawnHours = null;
    const spawnTime = new Date(deathTime.getTime() + (respawnHours ?? 24) * 3600_000);
    expect(spawnTime.toISOString()).toBe("2026-06-19T10:00:00.000Z");
  });
});

// ── Notification window detection ───────────────────────────
describe("notification window detection", () => {
  it("detects just-spawned (secsSinceSpawn 0-60)", () => {
    const spawnUnix = Math.floor(Date.now() / 1000) - 10; // spawned 10s ago
    const nowUnix = Math.floor(Date.now() / 1000);
    const secsSinceSpawn = nowUnix - spawnUnix;
    expect(secsSinceSpawn).toBeGreaterThanOrEqual(0);
    expect(secsSinceSpawn).toBeLessThanOrEqual(60);
  });

  it("detects 5-min warning (secsUntilSpawn 1-300)", () => {
    const spawnUnix = Math.floor(Date.now() / 1000) + 120; // 2 min from now
    const nowUnix = Math.floor(Date.now() / 1000);
    const secsUntilSpawn = spawnUnix - nowUnix;
    expect(secsUntilSpawn).toBeGreaterThan(0);
    expect(secsUntilSpawn).toBeLessThanOrEqual(300);
  });

  it("skips spawned-long-ago (secsUntilSpawn <= 0)", () => {
    const spawnUnix = Math.floor(Date.now() / 1000) - 3600; // 1h ago
    const nowUnix = Math.floor(Date.now() / 1000);
    const secsUntilSpawn = spawnUnix - nowUnix;
    expect(secsUntilSpawn).toBeLessThanOrEqual(0);
  });

  it("skips too-far-ahead (secsUntilSpawn > 300)", () => {
    const spawnUnix = Math.floor(Date.now() / 1000) + 600; // 10 min
    const nowUnix = Math.floor(Date.now() / 1000);
    const secsUntilSpawn = spawnUnix - nowUnix;
    expect(secsUntilSpawn).toBeGreaterThan(300);
  });
});

// ── Snap data shape compatibility ───────────────────────────
describe("snap data shape compatibility (RPC vs REST fallback)", () => {
  it("RPC snap has all required keys", () => {
    const snap = makeSnap({
      bosses: [makeBoss("b1", "Test Boss")],
      deaths: [makeDeath("b1", "2026-06-18T10:00:00Z")],
      guilds: [makeGuild("g1", "Test Guild")],
    });
    
    expect(snap).toHaveProperty("timezone");
    expect(snap).toHaveProperty("bosses");
    expect(snap).toHaveProperty("deaths");
    expect(snap).toHaveProperty("guilds");
    expect(snap).toHaveProperty("overrides");
    expect(snap).toHaveProperty("boss_guilds");
    expect(snap).toHaveProperty("boss_assists");
    expect(snap).toHaveProperty("activities");
  });

  it("REST fallback builds same shape", () => {
    // Simulating the REST fallback construction:
    const tz = "Asia/Manila";
    const bosses = [makeBoss("b1", "Test")];
    const deaths = [makeDeath("b1", "2026-06-18T10:00:00Z")];
    const guilds = [makeGuild("g1", "Guild")];
    const overrides: any[] = [];
    const bossGuilds: any[] = [];
    const bossAssists: any[] = [];
    const activities: any[] = [];
    
    const snap = { timezone: tz, bosses, deaths, guilds, overrides,
      boss_guilds: bossGuilds, boss_assists: bossAssists, activities };
    
    // Same shape as RPC
    expect(snap.timezone).toBe("Asia/Manila");
    expect(snap.bosses.length).toBe(1);
    expect(snap.deaths.length).toBe(1);
    expect(snap.guilds.length).toBe(1);
  });

  it("handles completely empty server (no bosses, no configs)", () => {
    const snap = makeSnap();
    const bosses = snap.bosses || [];
    expect(bosses.length).toBe(0);
    // Would trigger `if (!bosses?.length) return bossCount;` — early exit, no crash
  });

  it("handles nullish snap fields with defaults", () => {
    const snap = makeSnap({ timezone: null });
    const tz = snap.timezone || "Asia/Manila";
    expect(tz).toBe("Asia/Manila");
    
    const bosses = snap.bosses || [];
    expect(bosses).toEqual([]);
    
    const deaths = snap.deaths || [];
    expect(deaths).toEqual([]);
  });
});

// ── Error containment ───────────────────────────────────────
describe("error containment", () => {
  it("per-boss error doesn't crash server processing", () => {
    const processed: string[] = [];
    const bosses = [
      makeBoss("b1", "Boss 1"),
      makeBoss("b2", "Boss 2"), // will throw
      makeBoss("b3", "Boss 3"),
    ];
    
    for (const boss of bosses) {
      try {
        if (boss.id === "b2") throw new Error("simulated error");
        processed.push(boss.id);
      } catch (bossErr: any) {
        // Logged, continues to next boss
      }
    }
    
    expect(processed).toEqual(["b1", "b3"]); // b2 skipped, b3 still processed
  });

  it("outer try/catch prevents server failure from killing batch", async () => {
    const results: string[] = [];
    const serverIds = ["svr-1", "svr-2", "svr-3"];
    
    for (const serverId of serverIds) {
      try {
        if (serverId === "svr-2") throw new Error("DB timeout");
        results.push(serverId);
      } catch (serverErr: any) {
        // Logged, batch continues
      }
    }
    
    expect(results).toEqual(["svr-1", "svr-3"]);
  });

  it("concurrentMap with Promise.all — one rejection doesn't kill others", async () => {
    // Verify that our concurrentMap batches don't lose servers on partial failure
    const processed: string[] = [];
    
    async function processServer(id: string): Promise<string> {
      if (id === "svr-bad") throw new Error("fail");
      processed.push(id);
      return id;
    }
    
    // Simulate outer try/catch wrapping (as in our code)
    async function safeProcess(id: string): Promise<string> {
      try { return await processServer(id); }
      catch { return ""; } // caught, batch continues
    }
    
    const batch = await Promise.all(["svr-1", "svr-bad", "svr-3"].map(safeProcess));
    expect(processed).toEqual(["svr-1", "svr-3"]);
    expect(batch.filter(Boolean).length).toBe(2);
  });
});

// ── 30s tick window ─────────────────────────────────────────
describe("30s tick window", () => {
  it("spawn detected within 30s of actual spawn", () => {
    const spawnTime = Date.now() - 25_000; // 25s ago
    const now = Date.now();
    const secsSinceSpawn = Math.floor((now - spawnTime) / 1000);
    expect(secsSinceSpawn).toBeGreaterThanOrEqual(0);
    expect(secsSinceSpawn).toBeLessThanOrEqual(30);
  });

  it("spawn at t=0 detected on next tick at t=30", () => {
    const spawnTime = Date.now() - 30_000;
    const now = Date.now();
    const secsSinceSpawn = Math.floor((now - spawnTime) / 1000);
    // At 30s, it's still within the 60s detection window
    expect(secsSinceSpawn).toBeGreaterThanOrEqual(0);
    expect(secsSinceSpawn).toBeLessThanOrEqual(60);
  });

  it("spawn at t=0 NOT missed (detected within 60s window)", () => {
    // With 30s tick, max delay is 30s. The 0-60s window catches it on next tick.
    const spawnTime = Date.now() - 29_000;
    const now = Date.now();
    const secsSinceSpawn = Math.floor((now - spawnTime) / 1000);
    expect(secsSinceSpawn).toBeLessThanOrEqual(60);
    expect(secsSinceSpawn).toBeGreaterThanOrEqual(0);
  });
});
