import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "raidscout-user-timezone";
const CHANGE_EVENT = "raidscout-tz-change";

/** Detect the user's browser timezone */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** Get the stored timezone, or fall back to the provided default (browser detection if none) */
export function getUserTimezone(fallback?: string): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch { /* localStorage unavailable */ }
  return fallback || detectTimezone();
}

/** Save and retrieve the user's preferred timezone.
 *  @param defaultTimezone — fallback when nothing is saved (defaults to browser detection) */
export function useUserTimezone(defaultTimezone?: string) {
  const [timezone, setTimezoneState] = useState(() => getUserTimezone(defaultTimezone));

  // Listen for changes from other instances (same tab + cross tab)
  useEffect(() => {
    const handler = () => setTimezoneState(getUserTimezone());
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) handler();
    });
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener("storage", handler as any);
    };
  }, []);

  const setTimezone = useCallback((tz: string) => {
    setTimezoneState(tz);
    try {
      localStorage.setItem(STORAGE_KEY, tz);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch { /* ignore */ }
  }, []);

  const resetToDetected = useCallback(() => {
    const detected = detectTimezone();
    setTimezone(detected);
  }, [setTimezone]);

  return { timezone, setTimezone, resetToDetected };
}

/**
 * Format a UTC Date for display in the user's timezone.
 */
export function formatInTimezone(date: Date | string, timezone: string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const defaults: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
    ...options,
  };
  return d.toLocaleString(undefined, defaults);
}

/**
 * Convert a UTC ISO string to a Date adjusted to the given timezone.
 */
export function toZonedTime(isoString: string, timezone: string): Date {
  return new Date(isoString);
  // Date objects are UTC internally; formatting with timeZone option handles display
}

/**
 * Convert an APP_VERSION string like "2026.06.21.0730" (UTC) to the given timezone.
 * Returns e.g. "2026.06.21.1530" for Asia/Manila (+8).
 */
export function formatVersionInTimezone(version: string, timezone: string): string {
  const m = version.match(/^(\d{4})\.(\d{2})\.(\d{2})\.(\d{2})(\d{2})$/);
  if (!m) return version;
  const [, y, mo, d, h, mi] = m;
  const utcDate = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
  const local = utcDate.toLocaleString("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // "06/21/2026, 15:30" → "2026.06.21.1530"
  const [datePart, timePart] = local.split(", ");
  const [mm2, dd, yyyy] = datePart.split("/");
  const [hh, mimi] = timePart.split(":");
  return `${yyyy}.${mm2}.${dd}.${hh}${mimi}`;
}
