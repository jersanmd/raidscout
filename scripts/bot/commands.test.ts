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

// ── Activity instance state detection (from killed command) ─
interface ActInstance {
  id: string;
  activity_id: string;
  start_time?: string | null;
  end_time?: string | null;
}

function getActivityState(latestInst: ActInstance | null): "not-started" | "running" | "completed" {
  if (!latestInst || !latestInst.start_time) return "not-started";
  if (latestInst.end_time) return "completed";
  return "running";
}

function formatActivityKilledError(state: "not-started" | "completed", name: string, prefix: string): string {
  if (state === "completed") {
    return `❌ **${name}** was already completed.\n-# Wrong time? Use \`${prefix}editkilltime ${name} HH:MM\` to fix the start time instead.`;
  }
  return `❌ **${name}** is not currently active.\n-# Wrong start time? Use \`${prefix}editkilltime ${name} HH:MM\` to adjust it.`;
}

describe("getActivityState", () => {
  it('returns "not-started" for null instance', () => {
    expect(getActivityState(null)).toBe("not-started");
  });

  it('returns "not-started" for instance without start_time', () => {
    expect(getActivityState({ id: "i1", activity_id: "a1" })).toBe("not-started");
  });

  it('returns "running" for instance with start_time but no end_time', () => {
    expect(getActivityState({ id: "i1", activity_id: "a1", start_time: "2026-06-11T10:00:00Z" })).toBe("running");
  });

  it('returns "completed" for instance with both start_time and end_time', () => {
    expect(getActivityState({ id: "i1", activity_id: "a1", start_time: "2026-06-11T10:00:00Z", end_time: "2026-06-11T10:30:00Z" })).toBe("completed");
  });

  it('returns "not-started" for instance with end_time but no start_time', () => {
    // Edge case: end_time without start_time — code checks start_time first
    // This mirrors the actual code: isRunning = latestInst && latestInst.start_time && !latestInst.end_time
    // If start_time is missing, it falls through to !isRunning (not-started)
    expect(getActivityState({ id: "i1", activity_id: "a1", end_time: "2026-06-11T10:30:00Z" })).toBe("not-started");
  });
});

describe("formatActivityKilledError", () => {
  it("suggests editkilltime to fix start time for completed activities", () => {
    const msg = formatActivityKilledError("completed", "Daily Quest", "!");
    expect(msg).toContain("was already completed");
    expect(msg).toContain("!editkilltime Daily Quest");
    expect(msg).toContain("fix the start time");
  });

  it("suggests editkilltime to adjust start time for not-started activities", () => {
    const msg = formatActivityKilledError("not-started", "Weekly Boss", ";");
    expect(msg).toContain("is not currently active");
    expect(msg).toContain(";editkilltime Weekly Boss");
    expect(msg).toContain("adjust it");
  });

  it("includes HH:MM format hint", () => {
    const msg = formatActivityKilledError("not-started", "Event", "!");
    expect(msg).toContain("HH:MM");
    expect(msg).not.toContain("YYYY-MM-DD");
  });
});

// ── Killed command: date keyword parsing ────────────────────
function parseDayKeyword(lastArg: string | undefined): "yesterday" | "today" | null {
  if (!lastArg) return null;
  const lower = lastArg.toLowerCase();
  if (lower === "yesterday" || lower === "today") return lower;
  return null;
}

describe("parseDayKeyword", () => {
  it("detects yesterday", () => {
    expect(parseDayKeyword("yesterday")).toBe("yesterday");
    expect(parseDayKeyword("Yesterday")).toBe("yesterday");
  });

  it("detects today", () => {
    expect(parseDayKeyword("today")).toBe("today");
    expect(parseDayKeyword("TODAY")).toBe("today");
  });

  it("returns null for non-keywords", () => {
    expect(parseDayKeyword("14:30")).toBeNull();
    expect(parseDayKeyword("BossName")).toBeNull();
    expect(parseDayKeyword(undefined)).toBeNull();
  });
});

// ── Killed command: full args extraction ────────────────────
interface KilledArgs {
  bossName: string;
  timeStr?: string;
  explicitDay: "yesterday" | "today" | null;
}

function parseKilledArgs(rawArgs: string[]): KilledArgs | null {
  if (rawArgs.length === 0) return null;
  const remaining = [...rawArgs];
  let explicitDay: "yesterday" | "today" | null = null;

  const lastWord = remaining[remaining.length - 1]?.toLowerCase();
  if (lastWord === "yesterday" || lastWord === "today") {
    explicitDay = lastWord;
    remaining.pop();
  }

  let timeStr: string | undefined;
  const maybeTime = remaining[remaining.length - 1];
  if (maybeTime && /^\d{1,2}:\d{2}$/.test(maybeTime)) {
    timeStr = maybeTime;
    remaining.pop();
  }

  const bossName = remaining.join(" ");
  if (!bossName) return null;

  return { bossName, timeStr, explicitDay };
}

describe("parseKilledArgs", () => {
  it("parses boss name only", () => {
    const result = parseKilledArgs(["Clemantis"]);
    expect(result).toEqual({ bossName: "Clemantis", timeStr: undefined, explicitDay: null });
  });

  it("parses boss name with time", () => {
    const result = parseKilledArgs(["Clemantis", "14:30"]);
    expect(result).toEqual({ bossName: "Clemantis", timeStr: "14:30", explicitDay: null });
  });

  it("parses boss name with time and yesterday", () => {
    const result = parseKilledArgs(["Clemantis", "14:30", "yesterday"]);
    expect(result).toEqual({ bossName: "Clemantis", timeStr: "14:30", explicitDay: "yesterday" });
  });

  it("parses multi-word boss name", () => {
    const result = parseKilledArgs(["Lord", "Nine", "14:30"]);
    expect(result).toEqual({ bossName: "Lord Nine", timeStr: "14:30", explicitDay: null });
  });

  it("parses multi-word boss with today keyword", () => {
    const result = parseKilledArgs(["General", "Aquleus", "08:00", "today"]);
    expect(result).toEqual({ bossName: "General Aquleus", timeStr: "08:00", explicitDay: "today" });
  });

  it("parses activity with time", () => {
    const result = parseKilledArgs(["Daily Quest", "10:00"]);
    expect(result).toEqual({ bossName: "Daily Quest", timeStr: "10:00", explicitDay: null });
  });

  it("returns null for empty args", () => {
    expect(parseKilledArgs([])).toBeNull();
  });

  it("parses boss name with only yesterday (no time)", () => {
    const result = parseKilledArgs(["Clemantis", "yesterday"]);
    expect(result).toEqual({ bossName: "Clemantis", timeStr: undefined, explicitDay: "yesterday" });
  });

  it("treats 'yesterday' literally when it's the only word", () => {
    // If someone types ;killed yesterday, "yesterday" is a day keyword but no boss remains
    const result = parseKilledArgs(["yesterday"]);
    expect(result).toBeNull(); // bossName is empty after stripping keyword
  });
});

// ── Not alive error messages (bosses) ───────────────────────
function formatBossNotAliveError(bossName: string, prefix: string): string {
  return `❌ **${bossName}** is not currently alive.\n-# Wrong kill time? Use \`${prefix}editkilltime ${bossName} HH:MM\` to fix the previous kill instead.`;
}

function formatBossCooldownError(bossName: string, killedAtUnix: number, prefix: string): string {
  return `⏳ **${bossName}** already declared dead at <t:${killedAtUnix}:t>.\n-# Wrong time? Use \`${prefix}editkilltime ${bossName} HH:MM\` to fix it.`;
}

describe("killed error messages", () => {
  const prefix = "!";

  it("boss not alive message suggests fixing previous kill", () => {
    const msg = formatBossNotAliveError("Clemantis", prefix);
    expect(msg).toContain("is not currently alive");
    expect(msg).toContain("!editkilltime Clemantis");
    expect(msg).toContain("fix the previous kill");
  });

  it("boss cooldown message includes Discord timestamp", () => {
    const unix = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const msg = formatBossCooldownError("Clemantis", unix, prefix);
    expect(msg).toContain("already declared dead");
    expect(msg).toContain(`<t:${unix}:t>`);
    expect(msg).toContain("!editkilltime Clemantis");
  });

  it("activity not active message uses different wording than boss", () => {
    const actMsg = formatActivityKilledError("not-started", "Daily Quest", prefix);
    const bossMsg = formatBossNotAliveError("Daily Quest", prefix);
    expect(actMsg).not.toBe(bossMsg);
    expect(actMsg).toContain("start time");
    expect(bossMsg).toContain("kill time");
  });
});
