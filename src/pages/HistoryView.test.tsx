import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HistoryView } from "@/pages/HistoryView";

// ── Mocks ───────────────────────────────────────────────────

vi.mock("@/lib/supabase", () => ({
  fetchHistoryFromSupabase: vi.fn().mockResolvedValue([]),
  deleteDeathRecord: vi.fn().mockResolvedValue(undefined),
  editDeathTime: vi.fn().mockResolvedValue(undefined),
  fetchGuilds: vi.fn().mockResolvedValue([]),
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: "u1", email: "test@example.com" },
    isViewer: false,
    userRole: "member",
    signOut: vi.fn(),
  }),
}));

vi.mock("@/contexts/ServerContext", () => ({
  useServerId: vi.fn().mockReturnValue("server-1"),
}));

// ── Helpers ─────────────────────────────────────────────────

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/history"]}>
        <HistoryView />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── Tests ───────────────────────────────────────────────────

describe("HistoryView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Death History heading", () => {
    renderWithProviders();
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("renders date range preset buttons", () => {
    renderWithProviders();
    expect(screen.getByRole("button", { name: "Last 7d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last Month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom" })).toBeInTheDocument();
  });

  it("renders the search input", () => {
    renderWithProviders();
    expect(screen.getByPlaceholderText("Search boss name...")).toBeInTheDocument();
  });

  it('shows "No history yet" when there are no entries', async () => {
    renderWithProviders();
    // Wait for loading to finish
    const noHistory = await screen.findByText("No history yet", {}, { timeout: 3000 });
    expect(noHistory).toBeInTheDocument();
  });

  it("does not show search results text initially", () => {
    renderWithProviders();
    // Should not show "No results for" when search is empty
    expect(screen.queryByText(/No results for/)).not.toBeInTheDocument();
  });
});
