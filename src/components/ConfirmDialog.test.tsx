import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("returns null when open is false", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Test"
        message="Test message"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title and message when open", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure you want to delete this item?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("Delete Item")).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to delete this item?")).toBeInTheDocument();
  });

  it("renders Cancel and Confirm buttons", () => {
    render(
      <ConfirmDialog open={true} title="T" message="M" onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("uses custom confirmLabel", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Sign Out"
        message="Are you sure?"
        confirmLabel="Sign Out"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="T"
        message="M"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="T"
        message="M"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="T"
        message="M"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    // The backdrop is the first child div with bg-black/60
    const backdrop = document.querySelector(".bg-black\\/60") as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables buttons when loading", () => {
    render(
      <ConfirmDialog
        open={true}
        title="T"
        message="M"
        loading={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(confirmBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
  });

  it("shows spinner when loading", () => {
    render(
      <ConfirmDialog
        open={true}
        title="T"
        message="M"
        loading={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    // The Loader2 icon has animate-spin class
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("uses danger variant styling by default", () => {
    render(
      <ConfirmDialog open={true} title="T" message="M" onConfirm={() => {}} onCancel={() => {}} />
    );
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    expect(confirmBtn.className).toContain("bg-[#fafafa]");
  });

  it("uses warning variant styling when specified", () => {
    render(
      <ConfirmDialog
        open={true}
        title="T"
        message="M"
        variant="warning"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    expect(confirmBtn.className).toContain("bg-[#fafafa]");
  });
});
