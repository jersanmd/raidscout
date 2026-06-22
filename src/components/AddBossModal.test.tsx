import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddBossModal } from "./AddBossModal";

// Mock ServerContext
const mockServer = { id: "s1", name: "Test Server", role: "owner" };
vi.mock("@/contexts/ServerContext", () => ({
  useServer: () => ({ currentServer: mockServer }),
}));

// Mock fetchGuilds and setBossGuilds
vi.mock("@/lib/supabase", () => ({
  fetchGuilds: vi.fn().mockResolvedValue([
    { id: "g1", name: "Alpha" },
    { id: "g2", name: "Beta" },
  ]),
  setBossGuilds: vi.fn().mockResolvedValue(undefined),
}));

// Mock AddBossForm
vi.mock("@/components/AddBossForm", () => ({
  AddBossForm: ({ onCreated, onCancel, hideSubmitButton, formRef, onCreatedWithId }: any) => (
    <form
      ref={formRef}
      onSubmit={async (e: any) => {
        e.preventDefault();
        if (onCreatedWithId) await onCreatedWithId("new-boss-id");
        onCreated();
      }}
      data-testid="add-boss-form"
    >
      <input placeholder="Name *" />
      {hideSubmitButton ? null : <button type="submit">Add</button>}
    </form>
  ),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("AddBossModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when open is false", () => {
    const { container } = renderWithProviders(
      <AddBossModal open={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal with title when open", () => {
    renderWithProviders(<AddBossModal open={true} onClose={() => {}} />);
    expect(screen.getByText("Add Custom Boss")).toBeInTheDocument();
  });

  it("renders the AddBossForm when open", () => {
    renderWithProviders(<AddBossModal open={true} onClose={() => {}} />);
    expect(screen.getByTestId("add-boss-form")).toBeInTheDocument();
  });

  it("shows guild assignment section with modes", async () => {
    renderWithProviders(<AddBossModal open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Guild Assignment")).toBeInTheDocument();
    });
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText("Rotation (per kill)")).toBeInTheDocument();
    expect(screen.getByText("Daily (per day)")).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
  });

  it("hides guild section when no guilds exist", async () => {
    const { fetchGuilds } = await import("@/lib/supabase");
    (fetchGuilds as any).mockResolvedValueOnce([]);

    renderWithProviders(<AddBossModal open={true} onClose={() => {}} />);
    await waitFor(() => {
      // Guild Assignment text should not appear
    });
    expect(screen.queryByText("Guild Assignment")).not.toBeInTheDocument();
  });

  it("calls onClose when X button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<AddBossModal open={true} onClose={onClose} />);

    // Click the X button in the header
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons.find(b => b.querySelector(".lucide-x"));
    if (closeBtn) await user.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<AddBossModal open={true} onClose={onClose} />);

    const backdrop = document.querySelector(".bg-black\\/60") as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders Add Boss button in footer", () => {
    renderWithProviders(<AddBossModal open={true} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Add Boss" })).toBeInTheDocument();
  });

  it("renders rotation guild list by default with first guild selected", async () => {
    renderWithProviders(<AddBossModal open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Guild Assignment")).toBeInTheDocument();
    });

    // Default mode is rotation — first guild (Alpha) should be auto-selected
    await waitFor(() => {
      expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);
    });
  });

  it("renders schedule day dropdowns when mode is schedule", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddBossModal open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Guild Assignment")).toBeInTheDocument();
    });

    // Select Schedule mode
    const modeSelect = screen.getAllByRole("combobox").find(
      s => s.querySelector("option[value='schedule']")
    ) as HTMLSelectElement;
    if (modeSelect) {
      await user.selectOptions(modeSelect, "schedule");
    }

    // Should show day labels
    await waitFor(() => {
      expect(screen.getByText("Sun")).toBeInTheDocument();
      expect(screen.getByText("Mon")).toBeInTheDocument();
      expect(screen.getByText("Sat")).toBeInTheDocument();
    });
  });
});
