/**
 * Schedule timezone utilities.
 * All schedule times are stored in UTC (day + HH:MM).
 * Display converts to the viewer's browser timezone.
 */

export interface ScheduleSlot {
  day: number; // 0=Sun, 6=Sat — UTC
  time: string; // "HH:MM" — UTC
}

/**
 * Convert a local day+time to UTC day+time.
 * e.g., Mon 21:00 Asia/Manila (UTC+8) → Sun 13:00 UTC
 */
export function localSlotToUtc(day: number, time: string, timezone?: string): { day: number; time: string } {
  const [h, m] = time.split(":").map(Number);
  // Build a reference date: find the next occurrence of this day-of-week
  const now = new Date();
  const target = new Date(now);
  const currentDay = now.getDay();
  let daysUntil = day - currentDay;
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0 && (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m))) {
    daysUntil = 7; // already past today, use next week
  }
  target.setDate(now.getDate() + daysUntil);
  target.setHours(h, m, 0, 0);

  const utcDay = target.getUTCDay();
  const utcHours = String(target.getUTCHours()).padStart(2, "0");
  const utcMinutes = String(target.getUTCMinutes()).padStart(2, "0");

  return { day: utcDay, time: `${utcHours}:${utcMinutes}` };
}

/**
 * Convert a UTC day+time to local day+time.
 * e.g., Sun 13:00 UTC → Mon 21:00 Asia/Manila (UTC+8)
 */
export function utcSlotToLocal(day: number, time: string): { day: number; time: string } {
  const [h, m] = time.split(":").map(Number);
  // Build a reference date: find the next occurrence of this UTC day-of-week
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0));
  const currentUtcDay = now.getUTCDay();
  let daysUntil = day - currentUtcDay;
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0 && target.getTime() <= now.getTime()) {
    daysUntil = 7;
  }
  target.setUTCDate(target.getUTCDate() + daysUntil);

  const localDay = target.getDay();
  const localHours = String(target.getHours()).padStart(2, "0");
  const localMinutes = String(target.getMinutes()).padStart(2, "0");

  return { day: localDay, time: `${localHours}:${localMinutes}` };
}

/**
 * Format a schedule slot for display.
 */
export function formatScheduleSlot(day: number, time: string): string {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${DAYS[day]} ${time}`;
}
