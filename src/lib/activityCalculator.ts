import type { Activity, ActivityInstance, ActivityInfo, ScheduleSlot } from "@/types";

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
      activityInstance: { id: "", activity_id: activity.id, start_time: now.toISOString(), created_at: "" },
      startTime: now,
      status: "completed",
    };
  }

  // one_time or fixed_hours: schedule is a "HH:MM" string or {time, start_date} object
  if (activity.schedule_type === "one_time" || activity.schedule_type === "fixed_hours") {
    const raw = activity.schedule;
    const schedObj = (typeof raw === "object" && raw !== null && !Array.isArray(raw) && "time" in raw) ? raw as { time: string; start_date?: string } : null;
    const timeStr = schedObj ? schedObj.time : (typeof raw === "string" ? raw : null);
    const startDateStr = schedObj?.start_date ?? null;
    const recurMs = (activity.duration_minutes ?? 0) * 60_000;

    let startTime: Date;
    if (startDateStr) {
      // Build the initial start time from the configured start_date + time
      startTime = buildTimeDate(now, timeStr, startDateStr);
    } else {
      startTime = buildTimeDate(now, timeStr);
    }

    // For fixed_hours with start_date: first occurrence = start_date + time (no advance).
    // After first finish, advance by recurrence interval to find next occurrence.
    if (activity.schedule_type === "fixed_hours") {
      const effectiveRecurMs = recurMs > 0 ? recurMs : (startDateStr ? 24 * 60 * 60_000 : 0);
      const hasBeenFinished = !!lastInstance?.end_time;

      if (hasBeenFinished && effectiveRecurMs > 0) {
        // After finish: advance from finish time (or base time) by recurrence to find next upcoming
        const baseTime = lastInstance.end_time ? new Date(lastInstance.end_time) : startTime;
        const elapsed = now.getTime() - baseTime.getTime();
        const intervals = Math.ceil(elapsed / effectiveRecurMs);
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

  const nextSlot = findNextScheduleSlot(schedule, lastInstance?.end_time ? new Date(lastInstance.end_time) : now);
  return {
    activity,
    activityInstance: { id: "", activity_id: activity.id, start_time: nextSlot.toISOString(), created_at: "" },
    startTime: nextSlot,
    status: nextSlot > now ? "countdown" : "active",
  };
}

/** Build a Date from a "HH:MM" time string and optional start date. */
function buildTimeDate(now: Date, timeStr: string | null, startDateStr?: string | null): Date {
  if (!timeStr) return now;
  const [h, m] = timeStr.split(":").map(Number);
  
  // Use the configured start date if available, otherwise use today
  let d: Date;
  if (startDateStr) {
    const [y, mo, day] = startDateStr.split("-").map(Number);
    d = new Date(y, mo - 1, day, h, m, 0, 0);
  } else {
    d = new Date(now);
    d.setHours(h, m, 0, 0);
    // If already past today, move to tomorrow
    if (d.getTime() <= now.getTime()) {
      d.setDate(d.getDate() + 1);
    }
  }
  return d;
}

/** Find next schedule slot after `after` (like spawnCalculator's findNextScheduleSlot). */
function findNextScheduleSlot(schedule: ScheduleSlot[], after: Date): Date {
  const currentDay = after.getDay();
  const currentMinutes = after.getHours() * 60 + after.getMinutes();

  const sorted = [...schedule].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });

  for (const slot of sorted) {
    const sm = timeToMinutes(slot.time);
    if (slot.day > currentDay || (slot.day === currentDay && sm > currentMinutes)) {
      const d = new Date(after);
      d.setDate(d.getDate() + (slot.day - currentDay));
      d.setHours(Math.floor(sm / 60), sm % 60, 0, 0);
      return d;
    }
  }

  // Wrap to next week
  const first = sorted[0];
  const d = new Date(after);
  d.setDate(d.getDate() + (7 - currentDay + first.day));
  const sm = timeToMinutes(first.time);
  d.setHours(Math.floor(sm / 60), sm % 60, 0, 0);
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
