import type { Activity, ActivityInstance, ActivityInfo, ScheduleSlot } from "@/types";

/**
 * Convert a local date+time in a given timezone to a UTC ISO timestamp.
 * e.g. "2026-06-06", "14:30", "Asia/Manila" → "2026-06-06T06:30:00.000Z"
 */
export function toUtcTime(dateStr: string, timeStr: string, timezone: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  const approxUtc = Date.UTC(y, mo - 1, d, h, m, 0, 0);
  const approxDate = new Date(approxUtc);
  const tzOffsetStr = approxDate.toLocaleString("en-US", { timeZone: timezone, timeZoneName: "shortOffset" });
  const offsetMatch = tzOffsetStr.match(/GMT([+-]\d+)(?::(\d+))?/);
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 0;
  const offsetMins = offsetMatch && offsetMatch[2] ? parseInt(offsetMatch[2]) : 0;
  const offsetMs = (offsetHours * 60 + (offsetHours >= 0 ? offsetMins : -offsetMins)) * 60 * 1000;
  const utcMs = Date.UTC(y, mo - 1, d, h, m, 0, 0) - offsetMs;
  return new Date(utcMs).toISOString();
}

/**
 * Calculate the next activity instance start time.
 * fixed_schedule: find next slot from weekly schedule array.
 * fixed_hours: recurring at a fixed time each day.
 * one_time: runs once at a specific time, then auto-disables.
 */
export function calculateActivityInfo(
  activity: Activity,
  lastInstance: ActivityInstance | null,
  now: Date = new Date()
): ActivityInfo {
  // Already completed one-time activity
  if (activity.schedule_type === "one_time" && lastInstance?.end_time) {
    return {
      activity,
      activityInstance: lastInstance,
      startTime: new Date(lastInstance.end_time),
      status: "completed",
    };
  }

  // one_time or fixed_hours: schedule is a "HH:MM" string or {time, start_date} object
  if (activity.schedule_type === "one_time" || activity.schedule_type === "fixed_hours") {
    const raw = activity.schedule;
    const schedObj = (typeof raw === "object" && raw !== null && !Array.isArray(raw) && "time" in raw) ? raw as { time: string; start_date?: string; timezone?: string; utc_start?: string } : null;
    const timeStr = schedObj ? schedObj.time : (typeof raw === "string" ? raw : null);
    const startDateStr = schedObj?.start_date ?? null;
    const timezone = schedObj?.timezone ?? null;
    const utcStart = schedObj?.utc_start ?? null;
    const recurMs = (activity.duration_minutes ?? 0) * 60_000;

    let startTime: Date;
    startTime = buildTimeDate(now, timeStr, startDateStr, utcStart, timezone);

    // For fixed_hours with start_date: first occurrence = start_date + time (no advance).
    // After first finish, advance by recurrence interval to find next occurrence.
    if (activity.schedule_type === "fixed_hours") {
      const effectiveRecurMs = recurMs > 0 ? recurMs : (startDateStr ? 24 * 60 * 60_000 : 0);
      const hasBeenFinished = !!lastInstance?.end_time;

      // If started but never finished, stay on the current occurrence
      if (!hasBeenFinished && lastInstance?.start_time && effectiveRecurMs > 0) {
        const st = new Date(lastInstance.start_time);
        return {
          activity,
          activityInstance: lastInstance,
          startTime: st,
          status: st > now ? "countdown" : "active",
        };
      }

      if (hasBeenFinished && effectiveRecurMs > 0) {
        // After finish: advance from finish time (or base time) by recurrence to find next upcoming
        const baseTime = lastInstance.end_time ? new Date(lastInstance.end_time) : startTime;
        const elapsed = now.getTime() - baseTime.getTime();
        const intervals = Math.max(1, Math.ceil(elapsed / effectiveRecurMs));
        startTime = new Date(baseTime.getTime() + intervals * effectiveRecurMs);
        if (startTime.getTime() <= now.getTime()) {
          startTime = new Date(startTime.getTime() + effectiveRecurMs);
        }
        return {
          activity,
          activityInstance: { id: "", activity_id: activity.id, start_time: startTime.toISOString(), created_at: "" },
          startTime,
          status: "countdown",
        };
      }

      if (effectiveRecurMs > 0) {
        // First occurrence: use base time directly (countdown if future, active if now)
        return {
          activity,
          activityInstance: { id: "", activity_id: activity.id, start_time: startTime.toISOString(), created_at: "" },
          startTime,
          status: startTime > now ? "countdown" : "active",
        };
      }
    }

    return {
      activity,
      activityInstance: { id: "", activity_id: activity.id, start_time: startTime.toISOString(), created_at: "" },
      startTime,
      status: activity.schedule_type === "one_time"
        ? (startTime > now ? "countdown" : (lastInstance?.end_time ? "completed" : "active"))
        : startTime > now ? "countdown" : "active",
    };
  }

  // fixed_schedule: find next slot from weekly schedule array
  const schedule = Array.isArray(activity.schedule) ? activity.schedule : null;
  if (!schedule || schedule.length === 0) {
    return {
      activity,
      activityInstance: { id: "", activity_id: activity.id, start_time: now.toISOString(), created_at: "" },
      startTime: now,
      status: "active",
    };
  }

  // If the last instance was started but never finished, stay on that slot
  // (requires explicit "Finish" before advancing to the next schedule)
  if (lastInstance?.start_time && !lastInstance.end_time) {
    const startTime = new Date(lastInstance.start_time);
    return {
      activity,
      activityInstance: lastInstance,
      startTime,
      status: startTime > now ? "countdown" : "active",
    };
  }

  // Check if we're currently within the most recent schedule slot's active window.
  // If the slot has started but there's no finished instance for it, show "active".
  const sortedSlots = [...schedule].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });
  const recentSlot = findMostRecentSlot(sortedSlots, now);
  if (recentSlot && lastInstance) {
    // Only show "active" within a past slot if there's an instance (activity was actually started).
    // Without an instance, a newly created activity should show countdown to the next slot.
    const nextSlotAfterRecent = findNextScheduleSlot(schedule, new Date(recentSlot.getTime() + 60_000));
    const maxActiveWindow = Math.min(nextSlotAfterRecent.getTime() - recentSlot.getTime() - 3600_000, 4 * 3600_000);
    const activeUntil = new Date(recentSlot.getTime() + maxActiveWindow);
    const wasFinished = lastInstance?.end_time && new Date(lastInstance.end_time) >= recentSlot;
    if (!wasFinished && now >= recentSlot && now < activeUntil) {
      return {
        activity,
        activityInstance: { id: "", activity_id: activity.id, start_time: recentSlot.toISOString(), created_at: "" },
        startTime: recentSlot,
        status: "active",
      };
    }
  }

  const nextSlot = findNextScheduleSlot(schedule, lastInstance?.end_time ? new Date(lastInstance.end_time) : now);
  return {
    activity,
    activityInstance: { id: "", activity_id: activity.id, start_time: nextSlot.toISOString(), created_at: "" },
    startTime: nextSlot,
    status: nextSlot > now ? "countdown" : "active",
  };
}

/** Find the most recent schedule slot before `now` (within the past 7 days). */
function findMostRecentSlot(schedule: ScheduleSlot[], now: Date): Date | null {
  let recent: Date | null = null;
  for (let d = 0; d <= 7; d++) {
    const check = new Date(now);
    check.setUTCDate(check.getUTCDate() - d);
    for (const slot of schedule) {
      const sm = timeToMinutes(slot.time);
      const slotDate = new Date(check);
      slotDate.setUTCDate(slotDate.getUTCDate() - slotDate.getUTCDay() + slot.day);
      slotDate.setUTCHours(Math.floor(sm / 60), sm % 60, 0, 0);
      if (slotDate <= now && (!recent || slotDate > recent)) {
        recent = slotDate;
      }
    }
  }
  return recent;
}

/** Build a Date from schedule data — prefers utc_start (ISO), falls back to time+start_date+timezone. */
function buildTimeDate(now: Date, timeStr: string | null, startDateStr?: string | null, utcStart?: string | null, timezone?: string | null): Date {
  // New format: UTC ISO string stored directly
  if (utcStart) return new Date(utcStart);
  
  // Old format: time + date + timezone
  if (!timeStr) return now;
  const [h, m] = timeStr.split(":").map(Number);
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  let y: number, mo: number, day: number;
  if (startDateStr) {
    [y, mo, day] = startDateStr.split("-").map(Number);
  } else {
    const todayTz = now.toLocaleDateString("en-CA", { timeZone: tz });
    [y, mo, day] = todayTz.split("-").map(Number);
  }

  // Compute UTC timestamp for the local time in the target timezone
  const approxUtc = Date.UTC(y, mo - 1, day, h, m, 0, 0);
  const approxDate = new Date(approxUtc);
  const tzOffsetStr = approxDate.toLocaleString("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
  const offsetMatch = tzOffsetStr.match(/GMT([+-]\d+)(?::(\d+))?/);
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 0;
  const offsetMins = offsetMatch && offsetMatch[2] ? parseInt(offsetMatch[2]) : 0;
  const offsetMs = (offsetHours * 60 + (offsetHours >= 0 ? offsetMins : -offsetMins)) * 60 * 1000;
  const utcMs = Date.UTC(y, mo - 1, day, h, m, 0, 0) - offsetMs;
  const result = new Date(utcMs);
  
  if (!startDateStr && result.getTime() <= now.getTime()) {
    result.setTime(result.getTime() + 24 * 60 * 60 * 1000);
  }
  return result;
}

/** Find next schedule slot after `after` (like spawnCalculator's findNextScheduleSlot). */
function findNextScheduleSlot(schedule: ScheduleSlot[], after: Date): Date {
  const currentDay = after.getUTCDay();
  const currentMinutes = after.getUTCHours() * 60 + after.getUTCMinutes();

  const sorted = [...schedule].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });

  for (const slot of sorted) {
    const sm = timeToMinutes(slot.time);
    if (slot.day > currentDay || (slot.day === currentDay && sm > currentMinutes)) {
      const d = new Date(after);
      d.setUTCDate(d.getUTCDate() + (slot.day - currentDay));
      d.setUTCHours(Math.floor(sm / 60), sm % 60, 0, 0);
      return d;
    }
  }

  // Wrap to next week
  const first = sorted[0];
  const d = new Date(after);
  d.setUTCDate(d.getUTCDate() + (7 - currentDay + first.day));
  const sm = timeToMinutes(first.time);
  d.setUTCHours(Math.floor(sm / 60), sm % 60, 0, 0);
  return d;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Get all upcoming activity instances within the next `days` days.
 */
export function getUpcomingActivities(
  activities: Activity[],
  lastInstances: Map<string, ActivityInstance>,
  days: number,
  now: Date = new Date()
): ActivityInfo[] {
  const cutoff = new Date(now.getTime() + days * 86_400_000);
  const result: ActivityInfo[] = [];

  for (const activity of activities) {
    if (!activity.is_enabled) continue;
    const info = calculateActivityInfo(activity, lastInstances.get(activity.id) ?? null, now);
    if (info.startTime <= cutoff) {
      result.push(info);
    }
  }

  result.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  return result;
}
