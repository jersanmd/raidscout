import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimer } from "./useTimer";

describe("useTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns placeholder when target is null", () => {
    const { result } = renderHook(() => useTimer(null));

    expect(result.current.display).toBe("--:--:--");
    expect(result.current.isPast).toBe(false);
    expect(result.current.totalSeconds).toBe(0);
  });

  it("counts down correctly for a future target", () => {
    const target = new Date("2025-06-01T13:30:45Z"); // 1h 30m 45s from now
    const { result } = renderHook(() => useTimer(target));

    expect(result.current.display).toBe("01:30:45");
    expect(result.current.isPast).toBe(false);

    // Advance 45 seconds
    act(() => {
      vi.advanceTimersByTime(45_000);
    });

    expect(result.current.display).toBe("01:30:00");

    // Advance another 30 minutes
    act(() => {
      vi.advanceTimersByTime(30 * 60_000);
    });

    expect(result.current.display).toBe("01:00:00");

    // Advance 1 more hour
    act(() => {
      vi.advanceTimersByTime(60 * 60_000);
    });

    expect(result.current.display).toBe("00:00:00");
    expect(result.current.isPast).toBe(true);
  });

  it("returns zero display when target is in the past", () => {
    const target = new Date("2025-06-01T11:00:00Z"); // 1h ago
    const { result } = renderHook(() => useTimer(target));

    expect(result.current.display).toBe("01:00:00");
    expect(result.current.isPast).toBe(true);
  });

  it("pads single-digit values with leading zeros", () => {
    const target = new Date("2025-06-01T12:05:03Z"); // 5m 3s
    const { result } = renderHook(() => useTimer(target));

    expect(result.current.hours).toBe("00");
    expect(result.current.minutes).toBe("05");
    expect(result.current.seconds).toBe("03");
  });

  it("updates every second via setInterval", () => {
    const target = new Date("2025-06-01T12:00:05Z"); // 5s from now
    const { result } = renderHook(() => useTimer(target));

    expect(result.current.seconds).toBe("05");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.seconds).toBe("04");

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.display).toBe("00:00:00");
    expect(result.current.isPast).toBe(true);
  });

  it("cleans up interval on unmount", () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const target = new Date("2025-06-01T13:00:00Z");

    const { unmount } = renderHook(() => useTimer(target));
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
