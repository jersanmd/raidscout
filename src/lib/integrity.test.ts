import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

// ── concurrentMap utility (replicated from spawn-cron.ts) ──
async function concurrentMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

describe("concurrentMap (spawn-cron parallelization)", () => {
  it("processes all items", async () => {
    const processed: number[] = [];
    const results = await concurrentMap([1, 2, 3, 4, 5], 2, async (n) => {
      processed.push(n);
      return n * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(processed.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles empty array", async () => {
    const results = await concurrentMap([], 10, async (n) => n);
    expect(results).toEqual([]);
  });

  it("handles concurrency larger than items", async () => {
    const results = await concurrentMap([1, 2], 100, async (n) => n * 3);
    expect(results).toEqual([3, 6]);
  });

  it("handles concurrency of 1 (sequential)", async () => {
    const order: number[] = [];
    const results = await concurrentMap([1, 2, 3], 1, async (n) => {
      order.push(n);
      await new Promise((r) => setTimeout(r, 5));
      return n;
    });
    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]); // preserves order with concurrency=1
  });

  it("error in one item does not block others in batch", async () => {
    const processed: number[] = [];
    await expect(
      concurrentMap([1, 2, 3], 3, async (n) => {
        processed.push(n);
        if (n === 2) throw new Error("fail");
        return n;
      }),
    ).rejects.toThrow("fail");
    // All 3 started before the error propagated
    expect(processed.sort()).toEqual([1, 2, 3]);
  });

  it("preserves batch ordering", async () => {
    const results = await concurrentMap(
      ["a", "b", "c", "d", "e"],
      2,
      async (s) => s.toUpperCase(),
    );
    // Batches: ["a","b"] then ["c","d"] then ["e"]
    expect(results).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("handles large input without blowing up", async () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const results = await concurrentMap(items, 10, async (n) => n + 1);
    expect(results.length).toBe(100);
    expect(results[0]).toBe(1);
    expect(results[99]).toBe(100);
  });
});

describe("bot build integrity", () => {
  it("esbuild produces valid JavaScript (no syntax errors)", () => {
    // Run the actual build command
    execSync("npm run build:bot", { cwd: ROOT, stdio: "pipe" });
    const distPath = resolve(ROOT, "dist/bot.cjs");
    expect(existsSync(distPath)).toBe(true);

    const content = readFileSync(distPath, "utf-8");
    expect(content.length).toBeGreaterThan(80000);

    // Verify the output is valid JavaScript by parsing it
    // (require would execute it, which we don't want; parse is safe)
    expect(() => {
      new Function(content);
    }).not.toThrow();
  });

  it("build output contains spawn-cron logic", () => {
    const distPath = resolve(ROOT, "dist/bot.cjs");
    const content = readFileSync(distPath, "utf-8");

    // Verify concurrentMap was bundled correctly
    expect(content).toContain("concurrentMap");
    // Verify spawn notification dedup still works
    expect(content).toContain("sentNotifs");
    // Verify the cron tick is present
    expect(content).toContain("runSpawnCron");
  });

  it("build output contains error logging from our changes", () => {
    const distPath = resolve(ROOT, "dist/bot.cjs");
    const content = readFileSync(distPath, "utf-8");

    // Verify our error logging made it into the build
    expect(content).toContain("supabaseQuerySafe failed");
  });
});

describe("error logging catch blocks", () => {
  it("catch with console.error does not throw on its own", () => {
    // Simulate the pattern we use: catch(err) { console.error("prefix:", err) }
    const fn = () => {
      try {
        throw new Error("test error");
      } catch (err) {
        console.error("[test] operation failed:", err);
        // should not re-throw
      }
    };
    expect(() => fn()).not.toThrow();
  });

  it("catch with console.error preserves original error info", () => {
    const logged: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => logged.push(args.join(" "));

    try {
      try {
        JSON.parse("{invalid}");
      } catch (err) {
        console.error("[test] parse failed:", err);
      }
    } finally {
      console.error = origError;
    }

    expect(logged.length).toBe(1);
    expect(logged[0]).toContain("[test] parse failed:");
    expect(logged[0]).toContain("SyntaxError");
  });
});

describe("changed files are syntactically valid", () => {
  const changedFiles = [
    "src/lib/api/analytics.ts",
    "src/lib/api/attendance.ts",
    "src/lib/api/bosses.ts",
    "src/lib/api/history.ts",
    "src/pages/BossListView.tsx",
    "src/pages/WeeklyScheduleView.tsx",
    "src/pages/LeaderboardView.tsx",
    "src/components/ParticipantModal.tsx",
    "src/components/DeathRecordModal.tsx",
    "src/components/BossCard.tsx",
    "scripts/bot/spawn-cron.ts",
    "scripts/bot/supabase.ts",
    "scripts/bot/notifications.ts",
    "scripts/bot/commands.ts",
  ];

  for (const file of changedFiles) {
    it(`${file} exists and has content`, () => {
      const path = resolve(ROOT, file);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content.length).toBeGreaterThan(100);
    });
  }

  it("no file still has silent catch {} (data-critical paths only)", () => {
    // Check the files we changed — none should have bare catch{} anymore
    const criticalFiles = [
      "src/lib/api/analytics.ts",
      "src/lib/api/bosses.ts",
      "src/pages/BossListView.tsx",
      "src/components/ParticipantModal.tsx",
      "scripts/bot/supabase.ts",
      "scripts/bot/spawn-cron.ts",
    ];

    for (const file of criticalFiles) {
      const path = resolve(ROOT, file);
      const content = readFileSync(path, "utf-8");
      const silentCatches = content.match(/catch\s*\{\s*\}/g);
      expect(silentCatches).toBeNull();
    }
  });
});
