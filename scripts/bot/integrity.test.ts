// @ts-nocheck
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

describe("shared types integrity", () => {
  it("shared/types.ts exists and has required exports", () => {
    const path = resolve(ROOT, "shared/types.ts");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("export interface MemberBossKill");
    expect(content).toContain("export interface Boss");
    expect(content).toContain("export interface Activity");
    expect(content).toContain("export interface ScheduleSlot");
  });

  it("frontend imports from shared types", () => {
    const path = resolve(ROOT, "src/lib/api/leaderboard.ts");
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("shared/types");
  });
});

describe("TypeScript compilation", () => {
  it("frontend TypeScript compiles with zero errors", () => {
    const result = execSync("npx tsc --noEmit", {
      cwd: ROOT, encoding: "utf-8", stdio: "pipe",
    });
    expect(result.trim()).toBe("");
  });

  it("bot TypeScript compiles with zero errors", () => {
    const result = execSync("npx tsc --project tsconfig.bot.json --noEmit", {
      cwd: ROOT, encoding: "utf-8", stdio: "pipe",
    });
    expect(result.trim()).toBe("");
  });
});

describe("bot build", () => {
  it("bot esbuild produces valid output", () => {
    execSync("npm run build:bot", { cwd: ROOT, stdio: "pipe" });
    const distPath = resolve(ROOT, "dist/bot.cjs");
    expect(existsSync(distPath)).toBe(true);
    const size = readFileSync(distPath).length;
    expect(size).toBeGreaterThan(80000);
  });
});

describe("migration integrity", () => {
  it("all_migrations.sql exists and is valid", () => {
    const path = resolve(ROOT, "all_migrations.sql");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content.length).toBeGreaterThan(30000);
    expect(content).toContain("CREATE TABLE");
  });
});
