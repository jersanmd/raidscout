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

  // one_time or fixed_hours: schedule is a "HH:MM" string
  if (activity.schedule_type === "one_time" || activity.schedule_type === "fixed_hours") {
    const timeStr = typeof activity.schedule === "string" ? activity.schedule : null;
    const startTime = buildTimeDate(now, timeStr);
    return {
      activity,
      activityInstance: { id: "", activity_id: activity.id, start_time: startTime.toISOString(), created_at: "" },
      startTime,
      status: activity.schedule_type === "one_time" ? (startTime > now ? "countdown" : "active") : "active",
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

/** Build a Date from a "HH:MM" time string, using today (or tomorrow if already past). */
function buildTimeDate(now: Date, timeStr: string | null): Date {
  if (!timeStr) return now;
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  // If already past today, move to tomorrow
  if (d.getTime() <= now.getTime()) {
    d.setDate(d.getDate() + 1);
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
