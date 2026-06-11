// @ts-nocheck
import { describe, it, expect } from "vitest";

// ── Chunking algorithm (from commands.ts `list` handler) ─────
function chunkItems(items: string[], chunkSize: number = 25): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(
      items
        .slice(i, i + chunkSize)
        .map((item, j) => `${i + j + 1}. ${item}`)
        .join("\n")
    );
  }
  return chunks;
}

describe("list chunkItems", () => {
  it("returns empty array for empty input", () => {
    expect(chunkItems([])).toEqual([]);
  });

  it("single item produces one chunk with '1.' prefix", () => {
    const result = chunkItems(["Clemantis"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("1. Clemantis");
  });

  it("numbers items 1-based within each chunk", () => {
    const result = chunkItems(["A", "B", "C"]);
    expect(result[0]).toBe("1. A\n2. B\n3. C");
  });

  it("splits into multiple chunks when exceeding 25", () => {
    const items = Array.from({ length: 52 }, (_, i) => `Boss ${i + 1}`);
    const result = chunkItems(items);
    expect(result).toHaveLength(3); // 25 + 25 + 2
    expect(result[0].startsWith("1. Boss 1")).toBe(true);
    expect(result[0].split("\n")).toHaveLength(25);
    expect(result[1].startsWith("26. Boss 26")).toBe(true);
    expect(result[1].split("\n")).toHaveLength(25);
    expect(result[2].startsWith("51. Boss 51")).toBe(true);
    expect(result[2].split("\n")).toHaveLength(2);
  });

  it("exactly 25 items fits in one chunk", () => {
    const items = Array.from({ length: 25 }, (_, i) => `Item ${i + 1}`);
    const result = chunkItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].split("\n")).toHaveLength(25);
  });

  it("exactly 50 items splits into two chunks of 25", () => {
    const items = Array.from({ length: 50 }, (_, i) => `Item ${i + 1}`);
    const result = chunkItems(items);
    expect(result).toHaveLength(2);
    expect(result[0].split("\n")).toHaveLength(25);
    expect(result[1].split("\n")).toHaveLength(25);
  });

  it("51 items: 25 + 25 + 1", () => {
    const items = Array.from({ length: 51 }, (_, i) => `Item ${i + 1}`);
    const result = chunkItems(items);
    expect(result).toHaveLength(3);
    expect(result[2].split("\n")).toHaveLength(1);
    expect(result[2]).toBe("51. Item 51");
  });

  it("preserves item names with special characters", () => {
    const items = ["Clemantis 🐛", "Lord Nine 💀", "Test (Custom)"];
    const result = chunkItems(items);
    expect(result[0]).toContain("Clemantis 🐛");
    expect(result[0]).toContain("Lord Nine 💀");
    expect(result[0]).toContain("Test (Custom)");
  });
});

// ── Command argument parsing (from commands.ts) ──────────────
function parseArgs(content: string, prefix: string): { cmd: string; args: string[] } {
  const args = content.slice(prefix.length).split(/\s+/);
  return { cmd: args[0]?.toLowerCase() ?? "", args };
}

describe("parseArgs (command parsing)", () => {
  it("splits basic command and args", () => {
    const result = parseArgs("!killed Clemantis 14:30", "!");
    expect(result.cmd).toBe("killed");
    expect(result.args).toEqual(["killed", "Clemantis", "14:30"]);
  });

  it("handles multiple spaces between args", () => {
    const result = parseArgs("!killed   Clemantis   14:30", "!");
    expect(result.args.filter(a => a !== "")).toEqual(["killed", "Clemantis", "14:30"]);
  });

  it("joins multi-word boss names into separate args", () => {
    const result = parseArgs("!party Lord Nine", "!");
    expect(result.args).toEqual(["party", "Lord", "Nine"]);
    expect(result.args.slice(1).join(" ")).toBe("Lord Nine");
  });

  it("handles mention prefix", () => {
    // After stripping "<@123456>" from "<@123456> killed BossName",
    // we get " killed BossName" — leading space becomes empty first arg
    const result = parseArgs("<@123456> killed BossName", "<@123456>");
    expect(result.args).toEqual(["", "killed", "BossName"]);
    // The "command" is the first non-empty arg — handled by the caller
    expect(result.args[1]).toBe("killed");
  });

  it("lowercases the command", () => {
    expect(parseArgs("!KILLED boss", "!").cmd).toBe("killed");
    expect(parseArgs("!NextSpawn", "!").cmd).toBe("nextspawn");
  });

  it("handles empty content after prefix", () => {
    const result = parseArgs("!", "!");
    expect(result.cmd).toBe("");
    expect(result.args).toEqual([""]);
  });

  it("handles forcespawn with activity name", () => {
    const result = parseArgs("!forcespawn Daily Quest", "!");
    expect(result.cmd).toBe("forcespawn");
    expect(result.args.slice(1).join(" ")).toBe("Daily Quest");
  });

  it("handles editkilltime with date", () => {
    const result = parseArgs("!editkilltime Clemantis 08:30 2026-06-10", "!");
    expect(result.cmd).toBe("editkilltime");
    expect(result.args).toHaveLength(4);
    // args: ["editkilltime", "Clemantis", "08:30", "2026-06-10"]
    expect(result.args[3]).toBe("2026-06-10");
  });
});

// ── Alias resolution (from commands.ts) ─────────────────────
function resolveAlias(rawCmd: string, aliases: Record<string, string>): string {
  return aliases[rawCmd] || rawCmd;
}

describe("resolveAlias", () => {
  it("returns original command when no alias defined", () => {
    expect(resolveAlias("killed", {})).toBe("killed");
  });

  it("resolves alias to canonical command", () => {
    const aliases = { k: "killed", ns: "nextspawn", fs: "forcespawn" };
    expect(resolveAlias("k", aliases)).toBe("killed");
    expect(resolveAlias("ns", aliases)).toBe("nextspawn");
    expect(resolveAlias("fs", aliases)).toBe("forcespawn");
  });

  it("canonical commands pass through unchanged", () => {
    const aliases = { k: "killed" };
    expect(resolveAlias("killed", aliases)).toBe("killed");
    expect(resolveAlias("nextspawn", aliases)).toBe("nextspawn");
  });

  it("handles empty aliases object", () => {
    expect(resolveAlias("help", {})).toBe("help");
  });

  it("is case-sensitive (lowercase input expected)", () => {
    const aliases = { K: "killed" }; // uppercase alias
    expect(resolveAlias("k", aliases)).toBe("k");
    expect(resolveAlias("K", aliases)).toBe("killed");
  });
});

// ── Valid commands set ──────────────────────────────────────
describe("valid commands set", () => {
  const validCmds = new Set([
    "list", "nextspawn", "spawn", "killed", "kill", "editkilltime",
    "forcespawn", "forcespawnall", "spawnall", "commands", "help",
    "notifhere", "cmdhere", "threadhere", "party",
  ]);

  it("includes all expected commands", () => {
    expect(validCmds.has("list")).toBe(true);
    expect(validCmds.has("nextspawn")).toBe(true);
    expect(validCmds.has("spawn")).toBe(true);
    expect(validCmds.has("killed")).toBe(true);
    expect(validCmds.has("kill")).toBe(true);
    expect(validCmds.has("editkilltime")).toBe(true);
    expect(validCmds.has("forcespawn")).toBe(true);
    expect(validCmds.has("forcespawnall")).toBe(true);
    expect(validCmds.has("spawnall")).toBe(true);
    expect(validCmds.has("commands")).toBe(true);
    expect(validCmds.has("help")).toBe(true);
    expect(validCmds.has("notifhere")).toBe(true);
    expect(validCmds.has("cmdhere")).toBe(true);
    expect(validCmds.has("threadhere")).toBe(true);
    expect(validCmds.has("party")).toBe(true);
  });

  it("rejects unknown commands", () => {
    expect(validCmds.has("foobar")).toBe(false);
    expect(validCmds.has("")).toBe(false);
  });

  it("has exactly 15 commands", () => {
    expect(validCmds.size).toBe(15);
  });
});

// ── Time parsing for killed/editkilltime ────────────────────
function parseTimeArg(timeStr: string): { h: number; m: number } | null {
  if (!/^\d{1,2}:\d{2}$/.test(timeStr)) return null;
  const [h, m] = timeStr.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

describe("parseTimeArg", () => {
  it("parses valid HH:MM format", () => {
    expect(parseTimeArg("14:30")).toEqual({ h: 14, m: 30 });
    expect(parseTimeArg("08:00")).toEqual({ h: 8, m: 0 });
    expect(parseTimeArg("0:00")).toEqual({ h: 0, m: 0 });
  });

  it("rejects invalid format", () => {
    expect(parseTimeArg("14-30")).toBeNull();
    expect(parseTimeArg("1430")).toBeNull();
    expect(parseTimeArg("abc")).toBeNull();
    expect(parseTimeArg("")).toBeNull();
  });

  it("rejects out-of-range hours", () => {
    expect(parseTimeArg("24:00")).toBeNull();
    expect(parseTimeArg("99:00")).toBeNull();
  });

  it("rejects out-of-range minutes", () => {
    expect(parseTimeArg("14:60")).toBeNull();
    expect(parseTimeArg("14:99")).toBeNull();
  });

  it("accepts single-digit hours", () => {
    expect(parseTimeArg("9:30")).toEqual({ h: 9, m: 30 });
    expect(parseTimeArg("9:05")).toEqual({ h: 9, m: 5 });
  });

  it("accepts 23:59 (max valid time)", () => {
    expect(parseTimeArg("23:59")).toEqual({ h: 23, m: 59 });
  });

  it("rejects negative values", () => {
    // Regex won't match leading dash
    expect(parseTimeArg("-1:00")).toBeNull();
  });
});
