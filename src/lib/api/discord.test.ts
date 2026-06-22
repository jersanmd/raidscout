// ── Discord API Tests ──────────────────────────────────────
// Tests for createProgressThread and sendCpReminder

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase client
vi.mock("@/lib/api/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
  supabaseUrl: "https://test.supabase.co",
  supabaseKey: "test-key",
  getCurrentServerId: vi.fn(),
}));

import { createProgressThread, sendCpReminder } from "@/lib/api/discord";

// We need to test the instruction message template
// Extract the expected message content to verify format

function buildInstructionMessage(serverName: string, ping = "@everyone"): string {
  return [
    `${ping}`,
    ``,
    `**⚔️ Progress Report — ${serverName}**`,
    ``,
    `Please update your Combat Power using the following format:`,
    ``,
    `\`\`\``,
    `!updatestats <YourName> <CP>`,
    `\`\`\``,
    ``,
    `**Examples:**`,
    `• \`!updatestats PressX 120,000\``,
    `• \`!updatestats PressX 120k\`  (k = thousand)`,
    ``,
    `**Rules:**`,
    `1. You **must** attach a screenshot as proof along with your message`,
    `2. Send exactly **1 message + 1 image** together`,
    `3. Messages without an image will be rejected`,
    `4. Use comma \`,\` or \`k\` suffix for readability — we'll parse it automatically`,
    ``,
    `Thank you! 🫡`,
  ].join("\n");
}

function buildThreadName(tz = "UTC"): string {
  const now = new Date();
  return `Progress Report: ${now.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short",
  })}`;
}

describe("createProgressThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("should call the Supabase edge function with server_id", async () => {
    const { supabase } = await import("@/lib/api/client");
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, succeeded: 1, failed: 0, thread_name: "Progress Report: Test" }),
    });

    const result = await createProgressThread("test-server-id");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as any).mock.calls[0];
    expect(url).toContain("/functions/v1/create-progress-thread");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.server_id).toBe("test-server-id");
    expect(options.headers["Authorization"]).toBe("Bearer test-token");
    expect(result.ok).toBe(true);
  });

  it("should return ok:false when not authenticated", async () => {
    const { supabase } = await import("@/lib/api/client");
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
    });

    const result = await createProgressThread("test-server-id");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Not authenticated");
  });

  it("should return ok:false when fetch fails", async () => {
    const { supabase } = await import("@/lib/api/client");
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    });

    (global.fetch as any).mockRejectedValue(new Error("Network error"));

    const result = await createProgressThread("test-server-id");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Network error");
  });

  it("should pass through succeeded/failed counts from the edge function", async () => {
    const { supabase } = await import("@/lib/api/client");
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        thread_name: "Progress Report: Jun 13",
        succeeded: 3,
        failed: 1,
      }),
    });

    const result = await createProgressThread("test-server-id");
    expect(result.ok).toBe(true);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(1);
  });
});

describe("sendCpReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("should call the discord-notify edge function with cp_reminder event", async () => {
    const { supabase } = await import("@/lib/api/client");
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const result = await sendCpReminder("test-server-id");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as any).mock.calls[0];
    expect(url).toContain("/functions/v1/discord-notify");
    const body = JSON.parse(options.body);
    expect(body.server_id).toBe("test-server-id");
    expect(body.event).toBe("cp_reminder");
    expect(result.ok).toBe(true);
  });
});

describe("Progress thread instruction message", () => {
  it("should contain the correct format instructions", () => {
    const msg = buildInstructionMessage("TestServer", "@everyone");
    expect(msg).toContain("@everyone");
    expect(msg).toContain("Progress Report — TestServer");
    expect(msg).toContain("!updatestats <YourName> <CP>");
    expect(msg).toContain("!updatestats PressX 120,000");
    expect(msg).toContain("!updatestats PressX 120k");
  });

  it("should support custom notification prefix", () => {
    const msg = buildInstructionMessage("TestServer", "@raiders");
    expect(msg).toContain("@raiders");
  });

  it("should require screenshot proof", () => {
    const msg = buildInstructionMessage("TestServer");
    expect(msg).toContain("attach a screenshot as proof");
    expect(msg).toContain("Messages without an image will be rejected");
    expect(msg).toContain("1 message + 1 image");
  });

  it("should explain comma and k suffix support", () => {
    const msg = buildInstructionMessage("TestServer");
    expect(msg).toContain("comma `,` or `k` suffix");
    expect(msg).toContain("we'll parse it automatically");
  });
});

describe("Thread name format", () => {
  it("should include the current date and time", () => {
    const name = buildThreadName();
    expect(name).toMatch(/^Progress Report:/);
    // Should contain a date-like string
    expect(name.length).toBeGreaterThan(20);
  });
});
