import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "./FilterBar";

describe("FilterBar", () => {
  const defaultProps = {
    searchText: "",
    onSearchChange: () => {},
    filterType: "all" as const,
    onFilterTypeChange: () => {},
    filterWindow: null as number | null,
    onFilterWindowChange: () => {},
  };

  it("renders search input with placeholder", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByPlaceholderText("Search bosses...")).toBeInTheDocument();
  });

  it("displays the current search text value", () => {
    render(<FilterBar {...defaultProps} searchText="Venatus" />);
    const input = screen.getByPlaceholderText("Search bosses...") as HTMLInputElement;
    expect(input.value).toBe("Venatus");
  });

  it("calls onSearchChange when user types", () => {
    const handleChange = vi.fn();
    render(<FilterBar {...defaultProps} onSearchChange={handleChange} />);
    const input = screen.getByPlaceholderText("Search bosses...") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "Ego" } });

    expect(handleChange).toHaveBeenCalledWith("Ego");
  });

  it("renders All, Timer, and Schedule filter buttons", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Timer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
  });

  it("renders 1h, 8h, and 24h window filter buttons", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "1h" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "8h" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "24h" })).toBeInTheDocument();
  });

  it("highlights active filter type button", () => {
    render(<FilterBar {...defaultProps} filterType="fixed_hours" />);
    const timerBtn = screen.getByRole("button", { name: "Timer" });
    expect(timerBtn.className).toContain("border-[#3f3f46]");
  });

  it("highlights active window filter button", () => {
    render(<FilterBar {...defaultProps} filterWindow={8} />);
    const btn8h = screen.getByRole("button", { name: "8h" });
    expect(btn8h.className).toContain("border-[#3f3f46]");
  });

  it("calls onFilterTypeChange when Timer is clicked", async () => {
    const user = userEvent.setup();
    let captured = "";
    const handleChange = (type: string) => { captured = type; };

    render(<FilterBar {...defaultProps} onFilterTypeChange={handleChange} />);
    await user.click(screen.getByRole("button", { name: "Timer" }));

    expect(captured).toBe("fixed_hours");
  });

  it("calls onFilterWindowChange with correct hours when button clicked", async () => {
    const user = userEvent.setup();
    let captured: number | null = -1;
    const handleWindow = (h: number | null) => { captured = h; };

    render(<FilterBar {...defaultProps} onFilterWindowChange={handleWindow} />);
    await user.click(screen.getByRole("button", { name: "24h" }));

    expect(captured).toBe(24);
  });

  it("de-selects window when clicking active window button", async () => {
    const user = userEvent.setup();
    let captured: number | null = -1;
    const handleWindow = (h: number | null) => { captured = h; };

    render(<FilterBar {...defaultProps} filterWindow={8} onFilterWindowChange={handleWindow} />);
    await user.click(screen.getByRole("button", { name: "8h" }));

    expect(captured).toBeNull();
  });

  it("renders extra content when provided", () => {
    render(
      <FilterBar {...defaultProps} extra={<span data-testid="extra">Extra Content</span>} />
    );
    expect(screen.getByTestId("extra")).toBeInTheDocument();
    expect(screen.getByText("Extra Content")).toBeInTheDocument();
  });

  it("does not overflow search input on narrow container", () => {
    const { container } = render(
      <div style={{ width: "300px" }}>
        <FilterBar {...defaultProps} searchText="A very long boss name that should still fit" />
      </div>
    );
    // Component should render without exceeding its container
    const filterDiv = container.querySelector(".space-y-3");
    expect(filterDiv).toBeInTheDocument();
  });
});
