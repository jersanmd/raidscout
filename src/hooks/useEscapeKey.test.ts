import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { useEscapeKey } from "./useEscapeKey";

describe("useEscapeKey", () => {
  it("calls the callback when Escape key is pressed", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("does not call the callback for non-Escape keys", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape));

    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "a" });
    fireEvent.keyDown(document, { key: "Backspace" });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it("does not call the callback when disabled", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape, false));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it("calls preventDefault on the Escape event", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape));

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    const preventDefault = vi.spyOn(event, "preventDefault");
    document.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("cleans up event listener on unmount", () => {
    const onEscape = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(onEscape));

    unmount();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it("updates callback when it changes without re-adding duplicate listeners", () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ cb }) => useEscapeKey(cb),
      { initialProps: { cb: first } }
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ cb: second });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).toHaveBeenCalledTimes(1); // old callback not called again
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("switches from disabled to enabled correctly", () => {
    const onEscape = vi.fn();

    const { rerender } = renderHook(
      ({ enabled }) => useEscapeKey(onEscape, enabled),
      { initialProps: { enabled: false } }
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onEscape).not.toHaveBeenCalled();

    rerender({ enabled: true });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("supports two-step Escape: fullscreen close → modal close", () => {
    // Simulates the pattern used in DeathRecordModal / ParticipantModal:
    // When a fullscreen image is open, first Escape closes the image,
    // second Escape closes the modal.

    const closeFullscreen = vi.fn();
    const closeModal = vi.fn();

    let fullscreenOpen = true;

    const { rerender } = renderHook(
      ({ fsOpen }: { fsOpen: boolean }) => {
        useEscapeKey(() => {
          if (fsOpen) {
            closeFullscreen();
          } else {
            closeModal();
          }
        });
      },
      { initialProps: { fsOpen: true } }
    );

    // Step 1: fullscreen is open → Escape closes fullscreen only
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeFullscreen).toHaveBeenCalledTimes(1);
    expect(closeModal).not.toHaveBeenCalled();

    // Simulate state change: fullscreen closed
    fullscreenOpen = false;
    rerender({ fsOpen: false });

    // Step 2: fullscreen closed → Escape closes modal
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeFullscreen).toHaveBeenCalledTimes(1); // no additional calls
    expect(closeModal).toHaveBeenCalledTimes(1);
  });
});
