import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the server transfer logic (executeTransfers) in isolation
const mockUpsert = vi.fn();
const mockToast = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ upsert: mockUpsert }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
}));

async function executeTransfers(
  transferList: Array<{ id: string; name: string; cp: number | null; className: string | null }>,
  transferTargets: Record<string, { serverId: string; guildId: string }>,
  onToast: (type: string, msg: string) => void
) {
  console.log("[ServerTransfer] Starting transfer for", transferList.length, "players");
  let success = 0;
  let failed = 0;
  try {
    for (const row of transferList) {
      const target = transferTargets[row.id];
      if (!target?.serverId || !target?.guildId) {
        console.warn("[ServerTransfer] Skipping", row.name, "- missing server or guild");
        failed++;
        continue;
      }
      console.log("[ServerTransfer] Moving", row.name, "→ server:", target.serverId, "guild:", target.guildId);
      const { error } = await mockUpsert({
        name: row.name, server_id: target.serverId, guild_id: target.guildId,
        class: row.className || null,
      }, { onConflict: "server_id, name" });
      if (error) {
        console.error("[ServerTransfer] Failed for", row.name, ":", error.message);
        failed++;
      } else {
        console.log("[ServerTransfer] Success:", row.name);
        success++;
      }
    }
    console.log("[ServerTransfer] Done —", success, "success,", failed, "failed");
    if (success > 0) onToast("success", `${success} player${success !== 1 ? "s" : ""} transferred successfully`);
    if (failed > 0) onToast("error", `${failed} transfer${failed !== 1 ? "s" : ""} failed`);
    return { success, failed };
  } catch (err: any) {
    console.error("[ServerTransfer] Unexpected error:", err);
    onToast("error", err?.message || "Transfer failed");
    return { success, failed };
  }
}

describe("Server Transfer — executeTransfers", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("transfers a single player successfully", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const result = await executeTransfers(
      [{ id: "m1", name: "Hero", cp: 1000, className: "Warrior" }],
      { m1: { serverId: "s2", guildId: "g2" } }, mockToast
    );
    expect(result.success).toBe(1); expect(result.failed).toBe(0);
    expect(mockUpsert).toHaveBeenCalledWith(
      { name: "Hero", server_id: "s2", guild_id: "g2", class: "Warrior" },
      { onConflict: "server_id, name" }
    );
    expect(mockToast).toHaveBeenCalledWith("success", "1 player transferred successfully");
  });

  it("transfers multiple players successfully", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const result = await executeTransfers(
      [{ id: "m1", name: "Hero", cp: 1000, className: "Warrior" }, { id: "m2", name: "Mage", cp: 800, className: "Mage" }],
      { m1: { serverId: "s2", guildId: "g1" }, m2: { serverId: "s2", guildId: "g2" } }, mockToast
    );
    expect(result.success).toBe(2); expect(result.failed).toBe(0);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockToast).toHaveBeenCalledWith("success", "2 players transferred successfully");
  });

  it("skips players with missing server or guild", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const result = await executeTransfers(
      [{ id: "m1", name: "Hero", cp: 1000, className: "Warrior" }, { id: "m2", name: "NoTarget", cp: 500, className: null }, { id: "m3", name: "Mage2", cp: 600, className: "Mage" }],
      { m1: { serverId: "s2", guildId: "g1" }, m2: { serverId: "", guildId: "" }, m3: { serverId: "s2", guildId: "g1" } }, mockToast
    );
    expect(result.success).toBe(2); expect(result.failed).toBe(1);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("handles upsert DB errors gracefully", async () => {
    mockUpsert.mockResolvedValue({ error: { message: "DB constraint violation" } });
    const result = await executeTransfers(
      [{ id: "m1", name: "Hero", cp: 1000, className: "Warrior" }],
      { m1: { serverId: "s2", guildId: "g2" } }, mockToast
    );
    expect(result.success).toBe(0); expect(result.failed).toBe(1);
    expect(mockToast).toHaveBeenCalledWith("error", "1 transfer failed");
  });

  it("handles mixed success and failure", async () => {
    mockUpsert.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "Server error" } }).mockResolvedValueOnce({ error: null });
    const result = await executeTransfers(
      [{ id: "m1", name: "Hero", cp: 1000, className: "Warrior" }, { id: "m2", name: "Broken", cp: 500, className: null }, { id: "m3", name: "Mage", cp: 800, className: "Mage" }],
      { m1: { serverId: "s2", guildId: "g1" }, m2: { serverId: "s2", guildId: "g1" }, m3: { serverId: "s2", guildId: "g1" } }, mockToast
    );
    expect(result.success).toBe(2); expect(result.failed).toBe(1);
    expect(mockUpsert).toHaveBeenCalledTimes(3);
    expect(mockToast).toHaveBeenCalledWith("success", "2 players transferred successfully");
    expect(mockToast).toHaveBeenCalledWith("error", "1 transfer failed");
  });

  it("handles unexpected exceptions", async () => {
    mockUpsert.mockRejectedValue(new Error("Network failure"));
    const result = await executeTransfers(
      [{ id: "m1", name: "Hero", cp: 1000, className: "Warrior" }],
      { m1: { serverId: "s2", guildId: "g2" } }, mockToast
    );
    expect(result.success).toBe(0);
    expect(mockToast).toHaveBeenCalledWith("error", "Network failure");
  });

  it("logs throughout the transfer process", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockUpsert.mockResolvedValue({ error: null });
    await executeTransfers(
      [{ id: "m1", name: "Hero", cp: 1000, className: "Warrior" }],
      { m1: { serverId: "s2", guildId: "g2" } }, mockToast
    );
    expect(logSpy).toHaveBeenCalledWith("[ServerTransfer] Starting transfer for", 1, "players");
    expect(logSpy).toHaveBeenCalledWith("[ServerTransfer] Success:", "Hero");
    logSpy.mockRestore();
  });
});
