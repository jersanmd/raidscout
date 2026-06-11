// @ts-nocheck
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

export function getScheduleTz(boss: any, serverTz: string): string {
  // Seed bosses without template_id were created with Manila-local times.
  // Custom bosses (template_id set) are stored in UTC via localSlotToUtc.
  return boss.template_id ? "UTC" : "Asia/Manila";
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
  const now = new Date();
  for (let d = 0; d <= 7; d++) {
    const check = new Date(now);
    check.setDate(check.getDate() + d);
    for (const slot of schedule) {
      const c = scheduleSlotToUTC(tz, check, slot.day, slot.time);
      if (c > after && (!earliest || c < earliest)) earliest = c;
    }
  }
  return earliest ?? after;
}
