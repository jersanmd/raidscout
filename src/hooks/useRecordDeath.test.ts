import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ── Mocks ──────────────────────────────────────────────────
const mockSetToast = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockSetQueryData = vi.fn();
const mockInsertDeathRecord = vi.fn();
const mockAddAttendance = vi.fn();
const mockAdvanceBossRotation = vi.fn();
const mockNotifyDiscord = vi.fn();
const mockUploadRallyImage = vi.fn();
const mockAddRallyImageToDeath = vi.fn();
const mockSaveDeathScanResults = vi.fn();
const mockSupabaseDelete = vi.fn();
const mockSupabaseEq = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    isViewer: false,
    userRole: "owner",
  }),
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ setToast: mockSetToast }),
}));

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual("@/lib/supabase");
  return {
    ...(actual as any),
    getCurrentServerId: () => "server-1",
    notifyDiscord: mockNotifyDiscord,
    advanceBossRotation: mockAdvanceBossRotation,
    uploadRallyImage: mockUploadRallyImage,
    addRallyImageToDeath: mockAddRallyImageToDeath,
    saveDeathScanResults: mockSaveDeathScanResults,
    supabase: {
      from: mockSupabaseFrom,
    },
  };
});

// ── Wrapper ────────────────────────────────────────────────
function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// ── Tests ──────────────────────────────────────────────────
describe("useRecordDeath", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.clearAllMocks();

    // Default mock behaviors
    mockInsertDeathRecord.mockResolvedValue({ id: "death-123" });
    mockAddAttendance.mockResolvedValue({});
    mockUploadRallyImage.mockResolvedValue("https://example.com/rally.png");
    mockAddRallyImageToDeath.mockResolvedValue({});
    mockSaveDeathScanResults.mockResolvedValue({});
    mockAdvanceBossRotation.mockResolvedValue({});
    mockNotifyDiscord.mockResolvedValue({ ok: true, skipped: false });

    // supabase.from().delete().eq().eq()
    mockSupabaseEq.mockReturnValue({});
    mockSupabaseDelete.mockReturnValue({ eq: mockSupabaseEq });
    mockSupabaseFrom.mockReturnValue({ delete: () => ({ eq: () => ({ eq: mockSupabaseEq }) }) });

    // queryClient mocks
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(mockInvalidateQueries);
    vi.spyOn(queryClient, "setQueryData").mockImplementation(mockSetQueryData);
  });

  it("is importable and returns a function", async () => {
    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );
    expect(typeof result.current).toBe("function");
  });

  it("inserts death record with owner guild", async () => {
    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date("2026-06-12T12:00:00Z"),
        attendeeIds: [],
        ownerGuildName: "PANORTH",
        notifyDiscordChannel: false,
      });
    });

    expect(mockInsertDeathRecord).toHaveBeenCalledWith(
      "boss-1",
      expect.any(Date),
      "PANORTH",
    );
  });

  it("saves AI scan results when provided", async () => {
    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    const scanResults = {
      exactMatches: ["DonAlas"],
      fuzzyMatches: { Livera: "LiveraX" },
      unmatched: ["UnknownPlayer"],
      alreadyAttended: [],
    };

    await act(async () => {
      await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date(),
        attendeeIds: [],
        ownerGuildName: "PANORTH",
        scanResults,
        notifyDiscordChannel: false,
      });
    });

    expect(mockSaveDeathScanResults).toHaveBeenCalledWith("death-123", scanResults);
  });

  it("uploads rally images when provided", async () => {
    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    const file1 = new File([""], "rally1.png", { type: "image/png" });
    const file2 = new File([""], "rally2.png", { type: "image/png" });

    await act(async () => {
      await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date(),
        attendeeIds: [],
        ownerGuildName: "PANORTH",
        rallyImages: [file1, file2],
        notifyDiscordChannel: false,
      });
    });

    expect(mockUploadRallyImage).toHaveBeenCalledTimes(2);
    expect(mockAddRallyImageToDeath).toHaveBeenCalledTimes(2);
  });

  it("records attendance for all member IDs", async () => {
    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date(),
        attendeeIds: ["member-1", "member-2", "member-3"],
        ownerGuildName: "PANORTH",
        notifyDiscordChannel: false,
      });
    });

    expect(mockAddAttendance).toHaveBeenCalledTimes(3);
    expect(mockAddAttendance).toHaveBeenCalledWith("death-123", "member-1");
    expect(mockAddAttendance).toHaveBeenCalledWith("death-123", "member-2");
    expect(mockAddAttendance).toHaveBeenCalledWith("death-123", "member-3");
  });

  it("invalidates all relevant queries after recording", async () => {
    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date(),
        attendeeIds: ["member-1"],
        ownerGuildName: "PANORTH",
        notifyDiscordChannel: false,
      });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["death_records"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["leaderboard"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["members"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["analytics"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["bosses"] });
  });

  it("advances boss rotation on kill", async () => {
    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date(),
        attendeeIds: [],
        ownerGuildName: "PANORTH",
        notifyDiscordChannel: false,
      });
    });

    expect(mockAdvanceBossRotation).toHaveBeenCalledWith("boss-1");
  });

  it("shows success toast on clean recording", async () => {
    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date(),
        attendeeIds: ["member-1", "member-2"],
        ownerGuildName: "PANORTH",
        notifyDiscordChannel: false,
      });
    });

    expect(mockSetToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        message: expect.stringContaining("2 attendees"),
      }),
    );
  });

  it("shows partial error toast when attendance fails", async () => {
    mockAddAttendance
      .mockResolvedValueOnce({}) // member-1 OK
      .mockRejectedValueOnce(new Error("DB error")) // member-2 FAIL
      .mockResolvedValueOnce({}); // member-3 OK

    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date(),
        attendeeIds: ["member-1", "member-2", "member-3"],
        ownerGuildName: "PANORTH",
        notifyDiscordChannel: false,
      });
    });

    expect(mockSetToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("2/3 succeeded"),
      }),
    );
  });

  it("sends Discord notification when notifyDiscordChannel is true", async () => {
    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date(),
        attendeeIds: ["member-1"],
        ownerGuildName: "PANORTH",
        notifyDiscordChannel: true,
      });
    });

    expect(mockNotifyDiscord).toHaveBeenCalledWith(
      "server-1",
      "boss_died",
      expect.objectContaining({
        boss_name: "Venatus",
        guild_name: "PANORTH",
      }),
      "commands",
    );
  });

  it("skips Discord notification when notifyDiscordChannel is false", async () => {
    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date(),
        attendeeIds: [],
        ownerGuildName: "PANORTH",
        notifyDiscordChannel: false,
      });
    });

    expect(mockNotifyDiscord).not.toHaveBeenCalled();
  });

  it("returns ok: true on clean execution", async () => {
    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    let outcome: any;
    await act(async () => {
      outcome = await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date(),
        attendeeIds: [],
        ownerGuildName: "PANORTH",
        notifyDiscordChannel: false,
      });
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.deathRecordId).toBe("death-123");
    expect(outcome.errors).toEqual([]);
  });

  it("returns ok: false when attendance has errors", async () => {
    mockAddAttendance.mockRejectedValue(new Error("fail"));

    const { useRecordDeath } = await import("@/hooks/useRecordDeath");
    const { result } = renderHook(
      () => useRecordDeath(mockInsertDeathRecord, mockAddAttendance),
      { wrapper: createWrapper(queryClient) },
    );

    let outcome: any;
    await act(async () => {
      outcome = await result.current({
        bossId: "boss-1",
        bossName: "Venatus",
        deathTime: new Date(),
        attendeeIds: ["member-1"],
        ownerGuildName: "PANORTH",
        notifyDiscordChannel: false,
      });
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.errors.length).toBeGreaterThan(0);
  });
});
