// Spawn calculation utilities

export function addHours(d: Date, h: number) { return new Date(d.getTime() + h * 3600_000); }

export function formatRelative(unix: number): string {
  const diff = unix * 1000 - Date.now();
  if (diff <= 0) return "now";
  const mins = Math.floor(diff / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `in ${h}h ${m}m`;
  if (h > 0) return `in ${h}h`;
  return `in ${m}m`;
}

export function safeMod(v: number, n: number) { return ((v % n) + n) % n; }

/**
 * A scheduled boss's current spawn window: its latest slot at or before `now`,
 * and when that spawn stops counting as alive -- an hour before the next slot
 * or 24h after this one, whichever comes first. Null if no slot in the past week.
 */
export function scheduledSpawnWindow(
  schedule: { day: number; time: string }[], now: Date, tz: string,
): { recentSlot: Date; aliveUntil: Date } | null {
  let recentSlot: Date | null = null;
  for (let d = 0; d <= 7; d++) {
    const check = new Date(now);
    check.setDate(check.getDate() - d);
    for (const slot of schedule) {
      const c = scheduleSlotToUTC(tz, check, slot.day, slot.time);
      if (c <= now && (!recentSlot || c > recentSlot)) recentSlot = c;
    }
  }
  if (!recentSlot) return null;
  const nextSlot = findNextScheduleSlot(schedule, new Date(recentSlot.getTime() + 60_000), tz);
  const aliveUntil = new Date(Math.min(nextSlot.getTime() - 3600_000, recentSlot.getTime() + 24 * 3600_000));
  return { recentSlot, aliveUntil };
}

/**
 * Whether the boss is not alive only because its current spawn was already
 * killed -- so un-doing that kill would make it alive again.
 * Scheduled bosses: the last death is inside the still-open spawn window.
 * Timer bosses: the last death's respawn hasn't elapsed -- unless a force-spawn
 * override drives the timer, in which case it isn't a kill holding it back.
 */
export function killedThisWindow(
  boss: { spawn_type: string; respawn_hours?: number | null },
  lastDeathTime: string | null | undefined,
  opts: { now: Date; recentSlot?: Date | null; aliveUntil?: Date | null; overrideDeathTime?: string | null },
): boolean {
  if (!lastDeathTime) return false;
  const deathMs = new Date(lastDeathTime).getTime();
  if (boss.spawn_type === "fixed_schedule") {
    return !!opts.recentSlot && !!opts.aliveUntil
      && deathMs >= opts.recentSlot.getTime() && opts.now < opts.aliveUntil;
  }
  if (boss.spawn_type === "fixed_hours") {
    return !opts.overrideDeathTime && deathMs + (boss.respawn_hours ?? 0) * 3600_000 > opts.now.getTime();
  }
  return false;
}

/**
 * Reply to !kill when the boss already has a kill in its current spawn window.
 * recordedOnWebsite: the death row carries a user_id, i.e. a signed-in website
 * user marked it -- the case Discord members can't see, so without it "not
 * alive" reads as a bot error while the boss stands in game. (Viewer-link kills
 * have no user_id either, so they get no source rather than a wrong one.)
 * The editkilltime hint carries the kill's own date in server time: without a
 * date the command assumes today and would move an older kill to the wrong day.
 */
export function formatAlreadyDeadReply(
  bossName: string, killedAt: Date, recordedOnWebsite: boolean, prefix: string, serverTz: string,
): string {
  const unix = Math.floor(killedAt.getTime() / 1000);
  const where = recordedOnWebsite ? " on the website" : "";
  const killDate = killedAt.toLocaleDateString("en-CA", { timeZone: serverTz });
  return `⏳ **${bossName}** was already marked dead${where} at <t:${unix}:t> (<t:${unix}:R>).\n` +
    `-# Wrong time? Use \`${prefix}editkilltime ${bossName} HH:MM ${killDate}\` (server time), or edit it on the website's History page.`;
}

export function computeOwnerGuild(
  boss: any, bossGuilds: any[], guilds: any[], lastDeath: any, spawn: Date, tz: string
): string | undefined {
  const bgs = bossGuilds.filter((bg: any) => bg.boss_id === boss.id && bg.sort_order !== -1);
  if (bgs.length === 0) return undefined;

  const scheduleEntries = bgs.filter((bg: any) => bg.day_of_week !== null);
  if (scheduleEntries.length > 0) {
    const dow = spawn.getDay();
    const match = scheduleEntries.find((bg: any) => bg.day_of_week === dow);
    if (match) return guilds.find((g: any) => g.id === match.guild_id)?.name;
  }

  const dailyEntries = bgs
    .filter((bg: any) => bg.mode === "daily")
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (dailyEntries.length > 0) {
    if (!lastDeath || lastDeath.is_initial_spawn) {
      return guilds.find((g: any) => g.id === dailyEntries[0].guild_id)?.name;
    }
    const respawnHours = boss.respawn_hours ?? 0;
    const deathDate = new Date(lastDeath.death_time);
    // Use the effective spawn time (passed in, includes force-spawn overrides)
    const spawnDate = spawn;
    const lastGuildId = lastDeath.owner_guild_id;
    const sameDay = deathDate.toLocaleDateString("en-CA", { timeZone: tz }) === spawnDate.toLocaleDateString("en-CA", { timeZone: tz });
    if (sameDay) {
      return lastGuildId
        ? guilds.find((g: any) => g.id === lastGuildId)?.name
        : guilds.find((g: any) => g.id === dailyEntries[0].guild_id)?.name;
    }
    if (!lastGuildId) {
      const idx = safeMod(1, dailyEntries.length);
      return guilds.find((g: any) => g.id === dailyEntries[idx].guild_id)?.name;
    }
    const lastIdx = dailyEntries.findIndex((bg: any) => bg.guild_id === lastGuildId);
    const nextIdx = safeMod((lastIdx >= 0 ? lastIdx + 1 : 0), dailyEntries.length);
    return guilds.find((g: any) => g.id === dailyEntries[nextIdx].guild_id)?.name;
  }

  const rotationEntries = bgs
    .filter((bg: any) => bg.sort_order !== null && bg.sort_order > 0 && bg.mode !== "daily" && bg.day_of_week === null)
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (rotationEntries.length > 0) {
    const counter = boss.rotation_counter ?? 1;
    const idx = safeMod(counter - 1, rotationEntries.length);
    return guilds.find((g: any) => g.id === rotationEntries[idx].guild_id)?.name;
  }

  return undefined;
}

export function getScheduleTz(_boss: any, _serverTz: string): string {
  // All schedule times are now stored in UTC (legacy Manila times were migrated).
  return "UTC";
}

export function scheduleSlotToUTC(tz: string, refDate: Date, day: number, time: string): Date {
  const localDateStr = refDate.toLocaleDateString("en-CA", { timeZone: tz });
  const [y, mo, d] = localDateStr.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);

  const refDay = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  let dayDiff = day - refDay;
  if (dayDiff < -3) dayDiff += 7;
  if (dayDiff > 3) dayDiff -= 7;

  const targetLocal = new Date(Date.UTC(y, mo - 1, d + dayDiff, h, m));

  const utcStr = targetLocal.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit" });
  const tzStr = targetLocal.toLocaleTimeString("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" });
  const [utcH, utcM] = utcStr.split(":").map(Number);
  const [tzH, tzM] = tzStr.split(":").map(Number);
  const offsetMin = (tzH * 60 + tzM) - (utcH * 60 + utcM);
  const adjustedOffset = offsetMin > 720 ? offsetMin - 1440 : offsetMin < -720 ? offsetMin + 1440 : offsetMin;

  return new Date(targetLocal.getTime() - adjustedOffset * 60_000);
}

export function findNextScheduleSlot(schedule: { day: number; time: string }[], after: Date, tz: string): Date {
  let earliest: Date | null = null;
  for (let d = 0; d <= 7; d++) {
    const check = new Date(after);
    check.setDate(check.getDate() + d);
    for (const slot of schedule) {
      const c = scheduleSlotToUTC(tz, check, slot.day, slot.time);
      if (c > after && (!earliest || c < earliest)) earliest = c;
    }
  }
  return earliest ?? after;
}
