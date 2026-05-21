import type { Boss, DeathRecord, SpawnInfo, SpawnStatus, ScheduleSlot } from "@/types";

/**
 * Calculate the next spawn time for a boss given optional death data.
 *
 * Fixed-hours bosses: nextSpawn = death_time + respawn_hours.
 *   If no death record → status "unknown".
 *   If nextSpawn is in the past → status "alive" (boss has spawned).
 *   Otherwise → status "countdown" (timer ticking).
 *
 * Fixed-schedule bosses: find the next schedule slot ≥ now.
 *   Always returns a valid nextSpawn.
 */
export function calculateSpawnInfo(
  boss: Boss,
  deathRecord: DeathRecord | null,
  now: Date = new Date()
): SpawnInfo {
  if (boss.spawn_type === "fixed_hours") {
    return calculateFixedHoursSpawn(boss, deathRecord, now);
  }
  return calculateFixedScheduleSpawn(boss, deathRecord, now);
}

function calculateFixedHoursSpawn(
  boss: Boss,
  deathRecord: DeathRecord | null,
  now: Date
): SpawnInfo {
  if (!deathRecord || boss.respawn_hours === null) {
    // No death recorded yet — boss is alive by default
    return { boss, nextSpawn: now, status: "alive", deathRecord: null };
  }

  const deathTime = new Date(deathRecord.death_time);
  const nextSpawn = new Date(deathTime.getTime() + boss.respawn_hours * 3600_000);

  const status: SpawnStatus = nextSpawn <= now ? "alive" : "countdown";

  return { boss, nextSpawn, status, deathRecord };
}

/** How long a schedule boss stays "alive" after its spawn time (in hours) */
const ALIVE_WINDOW_HOURS = 2;

function calculateFixedScheduleSpawn(boss: Boss, deathRecord: DeathRecord | null, now: Date): SpawnInfo {
  if (!boss.schedule || boss.schedule.length === 0) {
    return { boss, nextSpawn: null, status: "unknown", deathRecord: null };
  }

  // Check if the boss is currently alive: find the most recent schedule slot
  // and see if we're within ALIVE_WINDOW_HOURS of it
  const recentSlot = findMostRecentSlot(boss.schedule, now);
  if (recentSlot) {
    const slotTime = buildDate(now, recentSlot.day, recentSlot.time);
    const aliveUntil = new Date(slotTime.getTime() + ALIVE_WINDOW_HOURS * 3600_000);

    // If boss was killed AFTER this slot, it's no longer alive
    const wasKilledAfterSlot =
      deathRecord && new Date(deathRecord.death_time) >= slotTime;

    if (!wasKilledAfterSlot && now >= slotTime && now < aliveUntil) {
      // Boss is currently alive — show next spawn after the alive window
      const nextSpawn = findNextScheduleSlot(boss.schedule, new Date(aliveUntil.getTime() + 60_000));
      return { boss, nextSpawn, status: "alive", deathRecord: null };
    }
  }

  const nextSpawn = findNextScheduleSlot(boss.schedule, now);
  return { boss, nextSpawn, status: "countdown", deathRecord: null };
}

/**
 * Find the most recent schedule slot that has already occurred today/this week.
 * Returns null if no slot has occurred yet (all are in the future).
 */
function findMostRecentSlot(schedule: ScheduleSlot[], now: Date): ScheduleSlot | null {
  if (!now) return null;
  if (!now) return null;
  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let best: ScheduleSlot | null = null;
  let bestMinutes = -1;

  for (const slot of schedule) {
    const slotMinutes = timeToMinutes(slot.time);
    // Slot is "past" if it's earlier today, or on a previous day this week
    const isPast =
      (slot.day === currentDay && slotMinutes <= currentMinutes) ||
      (slot.day < currentDay);

    if (isPast) {
      // Weight: more recent = higher score (day * 1440 + minutes)
      const score = slot.day * 1440 + slotMinutes;
      if (score > bestMinutes) {
        bestMinutes = score;
        best = slot;
      }
    }
  }

  // If no slot today/earlier, check if the last slot from previous week applies
  // (e.g., Sunday at 1am, and the boss spawned Saturday at 22:00)
  if (!best) {
    let maxDay = -1;
    let maxMinutes = -1;
    for (const slot of schedule) {
      const score = slot.day * 1440 + timeToMinutes(slot.time);
      if (score > maxMinutes) {
        maxMinutes = score;
        maxDay = slot.day;
        best = slot;
      }
    }
    // This was the last slot of the previous week
    if (best) {
      const slotTime = new Date(now);
      const daysBack = (currentDay - best.day + 7) % 7;
      slotTime.setDate(slotTime.getDate() - (daysBack === 0 ? 7 : daysBack));
      slotTime.setHours(
        Math.floor(timeToMinutes(best.time) / 60),
        timeToMinutes(best.time) % 60,
        0, 0
      );
      const aliveUntil = new Date(slotTime.getTime() + ALIVE_WINDOW_HOURS * 3600_000);
      if (now < aliveUntil) {
        return best; // Still alive from last week's slot
      }
    }
    return null;
  }

  return best;
}

/**
 * Find the next upcoming schedule slot from `now`.
 * If all slots this week have passed, returns next week's first slot.
 */
export function findNextScheduleSlot(schedule: ScheduleSlot[], now: Date): Date {
  const currentDay = now.getDay(); // 0-6
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Sort by (day, time) to find the next slot
  const sorted = [...schedule].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });

  // First try: find a slot later this week
  for (const slot of sorted) {
    const slotMinutes = timeToMinutes(slot.time);
    if (slot.day > currentDay || (slot.day === currentDay && slotMinutes > currentMinutes)) {
      return buildDate(now, slot.day, slot.time);
    }
  }

  // No slots left this week — wrap to next week's first slot
  const first = sorted[0];
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + (7 - currentDay + first.day));
  return buildDate(nextWeek, first.day, first.time);
}

/**
 * Get all spawns within the next `days` days, sorted chronologically.
 */
export function getUpcomingSpawns(
  bosses: Boss[],
  deathRecords: DeathRecord[],
  days: number,
  now: Date = new Date()
): SpawnInfo[] {
  const deathMap = new Map(deathRecords.map((d) => [d.boss_id, d]));
  const cutoff = new Date(now.getTime() + days * 86_400_000);

  const spawns: SpawnInfo[] = [];

  for (const boss of bosses) {
    const info = calculateSpawnInfo(boss, deathMap.get(boss.id) ?? null, now);

    if (boss.spawn_type === "fixed_schedule") {
      // Include if next spawn is within the window
      if (info.nextSpawn && info.nextSpawn <= cutoff) {
        spawns.push(info);
        // Also check if there's a second spawn within the window
        if (boss.schedule && boss.schedule.length > 1) {
          // Recalculate starting from right after the first spawn
          const afterFirst = new Date(info.nextSpawn.getTime() + 60_000);
          const secondInfo = calculateSpawnInfo(boss, null, afterFirst);
          if (secondInfo.nextSpawn && secondInfo.nextSpawn <= cutoff) {
            spawns.push(secondInfo);
          }
        }
      }
    } else {
      if (info.nextSpawn && info.nextSpawn <= cutoff) {
        spawns.push(info);
      }
    }
  }

  return spawns.sort((a, b) => {
    if (!a.nextSpawn) return 1;
    if (!b.nextSpawn) return -1;
    return a.nextSpawn.getTime() - b.nextSpawn.getTime();
  });
}

/**
 * Filter bosses to only those spawning within `hours` hours.
 */
export function filterByWindow(
  bosses: Boss[],
  deathRecords: DeathRecord[],
  hours: number,
  now: Date = new Date()
): Boss[] {
  const deathMap = new Map(deathRecords.map((d) => [d.boss_id, d]));
  const cutoff = new Date(now.getTime() + hours * 3600_000);

  return bosses.filter((boss) => {
    const info = calculateSpawnInfo(boss, deathMap.get(boss.id) ?? null, now);
    return info.nextSpawn !== null && info.nextSpawn <= cutoff && info.status !== "alive";
  });
}

// ── Helpers ─────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function buildDate(baseDate: Date, targetDay: number, time: string): Date {
  const d = new Date(baseDate);
  const currentDay = d.getDay();
  let dayDiff = targetDay - currentDay;
  if (dayDiff < 0) dayDiff += 7;
  if (dayDiff === 0) {
    // Same day — keep today
  }
  d.setDate(d.getDate() + dayDiff);

  const [h, m] = time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export { timeToMinutes, buildDate };
