import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  SupabaseConnectionCard,
  formatBytes,
  SUPABASE_PING_HISTORY,
  TABLE_NAMES,
  type InfraMetrics,
} from "@/pages/AdminPanelView";

// ── formatBytes ─────────────────────────────────────────────

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.50 GB");
  });
});

// ── SUPABASE_PING_HISTORY ───────────────────────────────────

describe("SUPABASE_PING_HISTORY", () => {
  it("is 60", () => {
    expect(SUPABASE_PING_HISTORY).toBe(60);
  });
});

// ── TABLE_NAMES ─────────────────────────────────────────────

describe("TABLE_NAMES", () => {
  it("includes core tables", () => {
    expect(TABLE_NAMES).toContain("servers");
    expect(TABLE_NAMES).toContain("members");
    expect(TABLE_NAMES).toContain("death_records");
    expect(TABLE_NAMES).toContain("bosses");
    expect(TABLE_NAMES).toContain("spawn_notifications");
    expect(TABLE_NAMES).toContain("attendance_records");
    expect(TABLE_NAMES).toContain("items");
    expect(TABLE_NAMES).toContain("audit_log");
  });

  it("includes DKP tables", () => {
    expect(TABLE_NAMES).toContain("dkp_auctions");
    expect(TABLE_NAMES).toContain("dkp_bids");
    expect(TABLE_NAMES).toContain("dkp_distributed");
    expect(TABLE_NAMES).toContain("dkp_config");
  });

  it("includes guild-related tables", () => {
    expect(TABLE_NAMES).toContain("guilds");
    expect(TABLE_NAMES).toContain("boss_guilds");
    expect(TABLE_NAMES).toContain("activity_guilds");
  });

  it("has no duplicates", () => {
    const unique = new Set(TABLE_NAMES);
    expect(unique.size).toBe(TABLE_NAMES.length);
  });

  it("has at least 30 tables", () => {
    expect(TABLE_NAMES.length).toBeGreaterThanOrEqual(30);
  });
});

// ── SupabaseConnectionCard ──────────────────────────────────

function makeMetrics(overrides: Partial<InfraMetrics> = {}): InfraMetrics {
  return {
    tableCounts: { servers: 30, members: 5000, death_records: 12000, bosses: 39 },
    tableCount: 55,
    dbSizeBytes: 524288000,
    dbSizePretty: "500 MB",
    activeConnections: 3,
    totalConnections: 8,
    region: "🇸🇬 Singapore (ap-southeast-1)",
    ...overrides,
  };
}

describe("SupabaseConnectionCard", () => {
  it("renders project URL", () => {
    render(
      <SupabaseConnectionCard
        pings={[]}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="test-project.supabase.co"
      />
    );
    expect(screen.getByText("test-project.supabase.co")).toBeInTheDocument();
  });

  it("renders Supabase Connection heading", () => {
    render(
      <SupabaseConnectionCard
        pings={[]}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="test.supabase.co"
      />
    );
    expect(screen.getByText("Supabase Connection")).toBeInTheDocument();
  });

  it("shows loading spinner when loading", () => {
    render(
      <SupabaseConnectionCard
        pings={[]}
        pingLoading={true}
        metrics={null}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    // Loader2 renders an SVG with animate-spin
    const spinners = document.querySelectorAll(".animate-spin");
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("shows loading spinner when metrics are loading", () => {
    render(
      <SupabaseConnectionCard
        pings={[]}
        pingLoading={false}
        metrics={null}
        metricsLoading={true}
        projectUrl="t.co"
      />
    );
    const spinners = document.querySelectorAll(".animate-spin");
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("shows 'No metrics available' when metrics is null", () => {
    render(
      <SupabaseConnectionCard
        pings={[]}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    expect(screen.getByText("No metrics available")).toBeInTheDocument();
  });

  it("renders status label", () => {
    render(
      <SupabaseConnectionCard
        pings={[{ ts: Date.now(), ms: 150, ok: true }]}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("shows Degraded for 500ms ping", () => {
    render(
      <SupabaseConnectionCard
        pings={[{ ts: Date.now(), ms: 500, ok: true }]}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });

  it("shows Slow for 900ms ping", () => {
    render(
      <SupabaseConnectionCard
        pings={[{ ts: Date.now(), ms: 900, ok: true }]}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    expect(screen.getByText("Slow")).toBeInTheDocument();
  });

  it("shows Error for failed ping", () => {
    render(
      <SupabaseConnectionCard
        pings={[{ ts: Date.now(), ms: 100, ok: false }]}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows latency in ms", () => {
    render(
      <SupabaseConnectionCard
        pings={[{ ts: Date.now(), ms: 342, ok: true }]}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    // "342ms" appears in status row + avg/min/max cells (all same value with 1 ping)
    const matches = screen.getAllByText("342ms");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Avg/Min/Max for multiple pings", () => {
    const pings = [
      { ts: Date.now() - 30000, ms: 100, ok: true },
      { ts: Date.now() - 20000, ms: 300, ok: true },
      { ts: Date.now() - 10000, ms: 500, ok: true },
    ];
    render(
      <SupabaseConnectionCard
        pings={pings}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    // Avg = (100+300+500)/3 = 300ms
    expect(screen.getByText("300ms")).toBeInTheDocument();
    // Min = 100ms (appears once in the Min cell)
    expect(screen.getByText("100ms")).toBeInTheDocument();
    // Max = 500ms — also appears in status row, use getAllByText
    const maxMatches = screen.getAllByText("500ms");
    expect(maxMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders sparkline SVG with multiple pings", () => {
    const pings = [
      { ts: Date.now() - 30000, ms: 100, ok: true },
      { ts: Date.now() - 20000, ms: 200, ok: true },
      { ts: Date.now() - 10000, ms: 150, ok: true },
    ];
    const { container } = render(
      <SupabaseConnectionCard
        pings={pings}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    // Should render an SVG element for the sparkline
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("does NOT render sparkline with only 1 ping", () => {
    const { container } = render(
      <SupabaseConnectionCard
        pings={[{ ts: Date.now(), ms: 100, ok: true }]}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeNull();
  });

  describe("with metrics", () => {
    it("shows Database Overview heading", () => {
      render(
        <SupabaseConnectionCard
          pings={[]}
          pingLoading={false}
          metrics={makeMetrics()}
          metricsLoading={false}
          projectUrl="t.co"
        />
      );
      expect(screen.getByText("Database Overview")).toBeInTheDocument();
    });

    it("shows region", () => {
      render(
        <SupabaseConnectionCard
          pings={[]}
          pingLoading={false}
          metrics={makeMetrics()}
          metricsLoading={false}
          projectUrl="t.co"
        />
      );
      expect(screen.getByText("🇸🇬 Singapore (ap-southeast-1)")).toBeInTheDocument();
    });

    it("shows DB size when available", () => {
      render(
        <SupabaseConnectionCard
          pings={[]}
          pingLoading={false}
          metrics={makeMetrics({ dbSizePretty: "500 MB" })}
          metricsLoading={false}
          projectUrl="t.co"
        />
      );
      expect(screen.getByText("500 MB")).toBeInTheDocument();
      expect(screen.getByText("DB Size")).toBeInTheDocument();
    });

    it("does NOT show DB size when null", () => {
      render(
        <SupabaseConnectionCard
          pings={[]}
          pingLoading={false}
          metrics={makeMetrics({ dbSizePretty: null })}
          metricsLoading={false}
          projectUrl="t.co"
        />
      );
      expect(screen.queryByText("DB Size")).toBeNull();
    });

    it("shows total rows", () => {
      render(
        <SupabaseConnectionCard
          pings={[]}
          pingLoading={false}
          metrics={makeMetrics()}
          metricsLoading={false}
          projectUrl="t.co"
        />
      );
      // servers(30)+members(5000)+death_records(12000)+bosses(39) = 17069
      expect(screen.getByText("17,069")).toBeInTheDocument();
    });

    it("shows table count from tableCount field when available", () => {
      render(
        <SupabaseConnectionCard
          pings={[]}
          pingLoading={false}
          metrics={makeMetrics({ tableCount: 55 })}
          metricsLoading={false}
          projectUrl="t.co"
        />
      );
      expect(screen.getByText("55")).toBeInTheDocument();
    });

    it("shows X+ when tableCount is null but tableCounts has data", () => {
      const m = makeMetrics({ tableCount: null, tableCounts: { servers: 30, members: 5000, death_records: 12000, bosses: 39, items: 200 } });
      render(
        <SupabaseConnectionCard
          pings={[]}
          pingLoading={false}
          metrics={m}
          metricsLoading={false}
          projectUrl="t.co"
        />
      );
      // 5 tables tracked → "5+"
      expect(screen.getByText("5+")).toBeInTheDocument();
    });

    it("shows active and total connections when available", () => {
      render(
        <SupabaseConnectionCard
          pings={[]}
          pingLoading={false}
          metrics={makeMetrics({ activeConnections: 3, totalConnections: 8 })}
          metricsLoading={false}
          projectUrl="t.co"
        />
      );
      expect(screen.getByText("Active Conns")).toBeInTheDocument();
      expect(screen.getByText("Total Conns")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
    });

    it("does NOT show connections when null", () => {
      render(
        <SupabaseConnectionCard
          pings={[]}
          pingLoading={false}
          metrics={makeMetrics({ activeConnections: null, totalConnections: null })}
          metricsLoading={false}
          projectUrl="t.co"
        />
      );
      expect(screen.queryByText("Active Conns")).toBeNull();
      expect(screen.queryByText("Total Conns")).toBeNull();
    });
  });

  it("shows '—' for status when no pings", () => {
    render(
      <SupabaseConnectionCard
        pings={[]}
        pingLoading={false}
        metrics={null}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    // "—" appears as status label + avg/min/max cells
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows '—' for avg/min/max when no pings", () => {
    render(
      <SupabaseConnectionCard
        pings={[]}
        pingLoading={false}
        metrics={makeMetrics()}
        metricsLoading={false}
        projectUrl="t.co"
      />
    );
    const dashes = screen.getAllByText("—");
    // Should have 3 dash values (avg, min, max) + status
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });
});
