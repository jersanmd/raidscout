import type { Activity, ActivityInstance, ActivityInfo, ScheduleSlot } from "@/types";

/**
 * Calculate the next activity instance start time.
 * Recurring: calculated on-the-fly from schedule (same logic as fixed_schedule bosses).
 * One-time: fixed start_time.
 */
export function calculateActivityInfo(
  activity: Activity,
  lastInstance: ActivityInstance | null,
  now: Date = new Date()
): ActivityInfo {
  if (activity.schedule_type === "one_time") {
    // One-time: use the schedule's first slot as the fixed start
    const startTime = activity.schedule?.[0]
      ? buildSlotDate(now, activity.schedule[0].day, activity.schedule[0].time)
      : new Date(now);
    return {
      activity,
      activityInstance: { id: "", activity_id: activity.id, start_time: startTime.toISOString(), created_at: "" },
      startTime,
      status: startTime > now ? "countdown" : lastInstance?.end_time ? "completed" : "active",
    };
  }

  // Recurring: find next schedule slot
  const schedule = activity.schedule;
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

/** Build a Date for a specific day-of-week and "HH:MM" time, in the same week as `ref`. */
function buildSlotDate(ref: Date, day: number, time: string): Date {
  const d = new Date(ref);
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7));
  const [h, m] = time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
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
