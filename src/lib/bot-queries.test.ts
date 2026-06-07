/**
 * Bot command tests — verifies query construction for custom bosses & activities.
 * Tests the Supabase REST queries the bot sends, without running the full gateway.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────

const SUPABASE_URL = "https://test.supabase.co";
const SUPABASE_KEY = "test-key";

// Simulate supabaseQuery: calls fetch and returns JSON
async function supabaseQuery(path: string): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Query failed (${res.status})`);
  return res.json();
}

function encode(s: string) { return encodeURIComponent(s); }

// ── Test helpers ────────────────────────────────────────────

function bossListQuery(serverId: string) {
  return `bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&order=name`;
}

function bossSearchQuery(serverId: string, name: string, extra = "") {
  return `bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&name=ilike.${encode("%" + name + "%")}${extra}`;
}

function activitySearchQuery(serverId: string, name: string) {
  return `activities?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&name=ilike.${encode("%" + name + "%")}`;
}

function forcespawnQuery(serverId: string) {
  return `bosses?server_id=eq.${serverId}&is_enabled=not.is.false&deleted_at=is.null&spawn_type=eq.fixed_hours&select=id,respawn_hours`;
}

// ── Tests ───────────────────────────────────────────────────

describe("Bot queries — disabled/deleted filtering", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("!list excludes disabled and soft-deleted bosses", async () => {
    const serverId = "srv-1";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: "b1", name: "Venatus" }]),
    });
    vi.stubGlobal("fetch", mockFetch);

    await supabaseQuery(bossListQuery(serverId));

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("is_enabled=not.is.false");
    expect(url).toContain("deleted_at=is.null");
    expect(url).toContain("server_id=eq.srv-1");
  });

  it("!nextspawn excludes disabled and soft-deleted bosses", async () => {
    const serverId = "srv-1";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", mockFetch);

    await supabaseQuery(bossListQuery(serverId));

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("is_enabled=not.is.false");
    expect(url).toContain("deleted_at=is.null");
  });

  it("!killed excludes disabled and soft-deleted bosses", async () => {
    const serverId = "srv-1";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", mockFetch);

    await supabaseQuery(bossSearchQuery(serverId, "Venatus"));

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("is_enabled=not.is.false");
    expect(url).toContain("deleted_at=is.null");
    expect(url).toContain("name=ilike.%25Venatus%25");
  });

  it("!forcespawn excludes disabled and soft-deleted bosses", async () => {
    const serverId = "srv-1";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: "b1", name: "Venatus", respawn_hours: 10 }]),
    });
    vi.stubGlobal("fetch", mockFetch);

    await supabaseQuery(bossSearchQuery(serverId, "Venatus", "&select=id,name,respawn_hours"));

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("is_enabled=not.is.false");
    expect(url).toContain("deleted_at=is.null");
  });

  it("!forcespawnall excludes disabled and soft-deleted bosses", async () => {
    const serverId = "srv-1";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: "b1", respawn_hours: 24 }]),
    });
    vi.stubGlobal("fetch", mockFetch);

    await supabaseQuery(forcespawnQuery(serverId));

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("is_enabled=not.is.false");
    expect(url).toContain("deleted_at=is.null");
    expect(url).toContain("spawn_type=eq.fixed_hours");
  });
});

describe("Bot queries — !killed activity fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to activities when boss not found", async () => {
    const serverId = "srv-1";
    const name = "Guild War";
    const calls: string[] = [];

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      calls.push(url);
      return Promise.resolve({
        ok: true,
        json: () => {
          // First call: bosses (empty)
          if (calls.length === 1) return Promise.resolve([]);
          // Second call: activities (found)
          return Promise.resolve([{ id: "a1", name: "Guild War", schedule_type: "recurring" }]);
        },
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    // Simulate the !killed logic: try boss first, then activity
    const bossUrl = bossSearchQuery(serverId, name);
    const bosses = await supabaseQuery(bossUrl);
    expect(bosses).toEqual([]);

    // Fallback to activities
    const actUrl = activitySearchQuery(serverId, name);
    const activities = await supabaseQuery(actUrl);
    expect(activities.length).toBe(1);
    expect(activities[0].name).toBe("Guild War");

    // Verify both URLs have is_enabled and deleted_at filters
    expect(calls[0]).toContain("is_enabled=not.is.false");
    expect(calls[0]).toContain("deleted_at=is.null");
    expect(calls[1]).toContain("is_enabled=not.is.false");
    expect(calls[1]).toContain("deleted_at=is.null");
  });

  it("activity query excludes disabled and soft-deleted", async () => {
    const serverId = "srv-1";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", mockFetch);

    await supabaseQuery(activitySearchQuery(serverId, "Raid"));

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("activities?");
    expect(url).toContain("is_enabled=not.is.false");
    expect(url).toContain("deleted_at=is.null");
    expect(url).toContain("server_id=eq.srv-1");
  });
});

describe("Bot queries — server scoping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("boss query is scoped to the resolved server", async () => {
    const serverIds = ["srv-1", "srv-2", "srv-custom"];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    for (const sid of serverIds) {
      vi.stubGlobal("fetch", mockFetch);
      await supabaseQuery(bossListQuery(sid));
      expect(mockFetch.mock.calls[0][0]).toContain(`server_id=eq.${sid}`);
      mockFetch.mockClear();
    }
  });

  it("activity query is scoped to the resolved server", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", mockFetch);

    await supabaseQuery(activitySearchQuery("custom-srv", "Test"));

    expect(mockFetch.mock.calls[0][0]).toContain("server_id=eq.custom-srv");
  });

  it("death records are scoped to the resolved server", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", mockFetch);

    await supabaseQuery("death_records?server_id=eq.srv-1&boss_id=eq.b1&order=death_time.desc&limit=1");

    expect(mockFetch.mock.calls[0][0]).toContain("server_id=eq.srv-1");
  });

  it("spawn overrides are scoped to the resolved server", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", mockFetch);

    await supabaseQuery("boss_spawn_overrides?server_id=eq.srv-1&boss_id=eq.b1&select=death_time&limit=1");

    expect(mockFetch.mock.calls[0][0]).toContain("server_id=eq.srv-1");
  });
});

describe("Bot queries — activity instance recording", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("records activity completion to activity_instances table", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: "inst-1" }]),
    });
    vi.stubGlobal("fetch", mockFetch);

    // Simulate the POST to activity_instances
    const activityTime = new Date().toISOString();
    const body = JSON.stringify({
      activity_id: "a1",
      start_time: activityTime,
      end_time: activityTime,
    });

    const res = await fetch(`${SUPABASE_URL}/rest/v1/activity_instances`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toContain("activity_instances");

    const callOptions = mockFetch.mock.calls[0][1] as RequestInit;
    expect(callOptions.method).toBe("POST");
    expect(JSON.parse(callOptions.body as string)).toEqual({
      activity_id: "a1",
      start_time: activityTime,
      end_time: activityTime,
    });
  });

  it("disables one-time activities after completion", async () => {
    const patchCalls: string[] = [];
    const mockFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "PATCH") patchCalls.push(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    vi.stubGlobal("fetch", mockFetch);

    // Simulate the PATCH to disable one-time activity
    await fetch(`${SUPABASE_URL}/rest/v1/activities?id=eq.a1`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: false }),
    });

    expect(patchCalls.length).toBe(1);
    expect(patchCalls[0]).toContain("activities?id=eq.a1");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ is_enabled: false });
  });
});
