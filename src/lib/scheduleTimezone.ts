/**
 * Schedule timezone utilities.
 * All schedule times are stored in UTC (day + HH:MM).
 * Display and input convert to/from the user's preferred timezone.
 */

export interface ScheduleSlot {
  day: number; // 0=Sun, 6=Sat — UTC
  time: string; // "HH:MM" — UTC
}

/**
 * Convert a local day+time (in the given timezone) to UTC day+time.
 * Defaults to browser timezone if none provided.
 *
 * e.g., Mon 21:00 Asia/Manila (UTC+8) → Sun 13:00 UTC
 */
export function localSlotToUtc(day: number, time: string, timezone?: string): { day: number; time: string } {
  const [h, m] = time.split(":").map(Number);
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();

  // Get current date in the target timezone
  const todayInTz = now.toLocaleDateString("en-CA", { timeZone: tz }); // "2026-06-04"
  const [y, mo, d] = todayInTz.split("-").map(Number);

  // Get current day-of-week in the target timezone
  const refDay = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();

  // Days until target day
  let dayDiff = day - refDay;
  if (dayDiff < 0) dayDiff += 7;

  // Check if the target time has already passed today (in target timezone)
  const timeInTz = now.toLocaleTimeString("en-US", {
    timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit",
  });
  const [nowH, nowM] = timeInTz.split(":").map(Number);
  if (dayDiff === 0 && (nowH > h || (nowH === h && nowM >= m))) {
    dayDiff = 7; // already passed today, use next week
  }

  // Build naive UTC date (will compute true UTC via offset below)
  const naiveUtc = new Date(Date.UTC(y, mo - 1, d + dayDiff, h, m));

  // Compute timezone offset at that instant
  const utcTimeStr = naiveUtc.toLocaleTimeString("en-US", {
    timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit",
  });
  const tzTimeStr = naiveUtc.toLocaleTimeString("en-US", {
    timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit",
  });
  const [utcH, utcM] = utcTimeStr.split(":").map(Number);
  const [tzH, tzM] = tzTimeStr.split(":").map(Number);

  let offsetMin = (tzH * 60 + tzM) - (utcH * 60 + utcM);
  if (offsetMin > 720) offsetMin -= 1440;
  if (offsetMin < -720) offsetMin += 1440;

  const trueUtc = new Date(naiveUtc.getTime() - offsetMin * 60_000);

  return {
    day: trueUtc.getUTCDay(),
    time: `${String(trueUtc.getUTCHours()).padStart(2, "0")}:${String(trueUtc.getUTCMinutes()).padStart(2, "0")}`,
  };
}

/**
 * Convert a UTC day+time to local day+time in the given timezone.
 * Defaults to browser timezone if none provided.
 *
 * e.g., Sun 13:00 UTC → Mon 21:00 Asia/Manila (UTC+8)
 */
export function utcSlotToLocal(day: number, time: string, timezone?: string): { day: number; time: string } {
  const [h, m] = time.split(":").map(Number);
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();

  // Find next occurrence of this UTC day+time
  const currentUtcDay = now.getUTCDay();
  const currentUtcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const targetMinutes = h * 60 + m;

  let daysUntil = day - currentUtcDay;
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0 && targetMinutes <= currentUtcMinutes) {
    daysUntil = 7; // already passed today in UTC, use next week
  }

  const utcDate = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntil, h, m, 0, 0,
  ));

  // Convert to local time in target timezone
  const dowStr = utcDate.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
  const timeStr = utcDate.toLocaleTimeString("en-US", {
    timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit",
  });

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const localDay = dayNames.indexOf(dowStr);
  const [localH, localM] = timeStr.split(":").map(Number);

  return {
    day: localDay,
    time: `${String(localH).padStart(2, "0")}:${String(localM).padStart(2, "0")}`,
  };
}

/**
 * Format a schedule slot for display.
 */
export function formatScheduleSlot(day: number, time: string): string {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${DAYS[day]} ${time}`;
}
