import type { BossGuild, Guild, DeathRecord, SpawnInfo } from "@/types";
import { guildColor } from "@/lib/constants";

// ── Types ───────────────────────────────────────────────────

export interface RotationInfo {
  guilds: { name: string; color: { bg: string; text: string; border: string } }[];
  currentIndex: number;
  mode: string;
}

// ── Owner Guild Name ────────────────────────────────────────

/**
 * Get the display name of the guild that currently "owns" a boss.
 * Handles three modes: schedule (day-of-week), daily (day-crossing),
 * and rotation (per-kill counter).
 */
export function getOwnerGuildName(
  bossId: string,
  bossGuilds: BossGuild[],
  guilds: Guild[],
  deathRecords: DeathRecord[],
  spawns: SpawnInfo[],
  /** Optional: override day-of-week for schedule mode (0=Sun..6=Sat). Used by weekly grid. */
  dayOfWeek?: number,
  /** Server timezone for daily rotation day-boundary calculation. Defaults to UTC. */
  timezone?: string,
): string | undefined {
  const bgs = bossGuilds.filter(bg => bg.boss_id === bossId);
  if (bgs.length === 0) return undefined;

  // ── Schedule mode: guild based on day of week ──
  const scheduleEntries = bgs.filter(bg => bg.day_of_week !== null);
  if (scheduleEntries.length > 0) {
    const dow = dayOfWeek ?? (() => {
      const spawn = spawns.find(s => s.boss.id === bossId);
      const spawnDate = spawn?.status === "alive" ? new Date() : (spawn?.nextSpawn ?? new Date());
      return spawnDate.getDay();
    })();
    const match = scheduleEntries.find(bg => bg.day_of_week === dow);
    if (match) return guilds.find(g => g.id === match.guild_id)?.name;
  }

  // ── Daily mode: advance guild when spawn crosses into a new day ──
  const dailyEntries = bgs
    .filter(bg => bg.mode === "daily")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (dailyEntries.length > 0) {
    const name = getDailyOwnerGuild(bossId, dailyEntries, guilds, deathRecords, spawns, timezone || "UTC");
    if (name) return name;
    return guilds.find(g => g.id === dailyEntries[0].guild_id)?.name;
  }

  // ── Rotation mode: use rotation_counter ──
  const rotationEntries = bgs
    .filter(bg => bg.sort_order !== null && bg.sort_order > 0 && bg.mode !== "daily")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (rotationEntries.length > 0) {
    const bossData = spawns.find(s => s.boss.id === bossId)?.boss;
    const counter = bossData?.rotation_counter ?? 1;
    const idx = safeMod(counter - 1, rotationEntries.length);
    return guilds.find(g => g.id === rotationEntries[idx].guild_id)?.name;
  }

  return undefined;
}

// ── Rotation Info (for UI dropdowns) ────────────────────────

/**
 * Compute rotation info for a boss — guild names, current index, and mode.
 * Used to render rotation buttons/dropdowns on boss cards.
 */
export function getRotationInfo(
  bossId: string,
  bossGuilds: BossGuild[],
  guilds: Guild[],
  deathRecords: DeathRecord[],
  spawns: SpawnInfo[],
  /** Server timezone for daily rotation day-boundary calculation. Defaults to UTC. */
  timezone?: string,
): RotationInfo | null {
  const bgs = bossGuilds.filter(bg => bg.boss_id === bossId);
  if (bgs.length === 0) return null;

  const bossData = spawns.find(s => s.boss.id === bossId)?.boss;
  const adjustment = bossData?.rotation_adjustment ?? 0;

  // ── Per-kill rotation mode ──
  const rotationEntries = bgs
    .filter(bg => bg.sort_order !== null && bg.sort_order > 0 && bg.mode !== "daily")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (rotationEntries.length > 1) {
    const counter = bossData?.rotation_counter ?? 1;
    const idx = safeMod(counter - 1, rotationEntries.length);
    return {
      guilds: rotationEntries.map(bg => ({
        name: guilds.find(g => g.id === bg.guild_id)?.name ?? "?",
        color: guildColor(guilds.find(g => g.id === bg.guild_id)?.name ?? "?"),
      })),
      currentIndex: idx,
      mode: "per kill",
    };
  }

  // ── Daily mode ──
  const dailyEntries = bgs
    .filter(bg => bg.mode === "daily")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (dailyEntries.length > 1) {
    const idx = getDailyRotationIndex(bossId, dailyEntries, deathRecords, adjustment, spawns, timezone || "UTC");
    return {
      guilds: dailyEntries.map(bg => ({
        name: guilds.find(g => g.id === bg.guild_id)?.name ?? "?",
        color: guildColor(guilds.find(g => g.id === bg.guild_id)?.name ?? "?"),
      })),
      currentIndex: idx,
      mode: "daily",
    };
  }

  return null;
}

// ── Helpers ─────────────────────────────────────────────────

/** Safe modulo — always returns 0..(n-1), even for negative numbers */
export function safeMod(value: number, n: number): number {
  return ((value % n) + n) % n;
}

/** Get the guild name for daily mode owner calculation */
function getDailyOwnerGuild(
  bossId: string,
  dailyEntries: BossGuild[],
  guilds: Guild[],
  deathRecords: DeathRecord[],
  spawns: SpawnInfo[],
  timezone: string,
): string | undefined {
  const lastDeath = deathRecords
    .filter(dr => dr.boss_id === bossId && !(dr as any).is_initial_spawn)
    .sort((a, b) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];

  if (!lastDeath) {
    return guilds.find(g => g.id === dailyEntries[0].guild_id)?.name;
  }

  const bossData = spawns.find(s => s.boss.id === bossId)?.boss;
  const respawnHours = bossData?.respawn_hours ?? 0;
  const deathDate = new Date(lastDeath.death_time);
  const spawnDate = new Date(deathDate.getTime() + respawnHours * 3600000);

  // Same-day death + spawn → same guild keeps the boss (uses server timezone for day boundary)
  if (deathDate.toLocaleDateString("en-CA", { timeZone: timezone }) === spawnDate.toLocaleDateString("en-CA", { timeZone: timezone })) {
    const lastGuildId = (lastDeath as any).owner_guild_id;
    return lastGuildId
      ? guilds.find(g => g.id === lastGuildId)?.name
      : guilds.find(g => g.id === dailyEntries[0].guild_id)?.name;
  }

  // Different day → advance rotation
  const lastGuildId = (lastDeath as any).owner_guild_id;
  if (!lastGuildId) {
    const adjustment = bossData?.rotation_adjustment ?? 0;
    let idx = safeMod(1 + adjustment, dailyEntries.length);
    return guilds.find(g => g.id === dailyEntries[idx].guild_id)?.name;
  }

  const lastIdx = dailyEntries.findIndex(bg => bg.guild_id === lastGuildId);
  const adjustment = bossData?.rotation_adjustment ?? 0;
  let nextIdx = safeMod((lastIdx >= 0 ? lastIdx + 1 : 0) + adjustment, dailyEntries.length);
  return guilds.find(g => g.id === dailyEntries[nextIdx].guild_id)?.name;
}

/** Get the current rotation index for daily mode */
function getDailyRotationIndex(
  bossId: string,
  dailyEntries: BossGuild[],
  deathRecords: DeathRecord[],
  adjustment: number,
  spawns: SpawnInfo[],
  timezone: string,
): number {
  const lastDeath = deathRecords
    .filter(dr => dr.boss_id === bossId && !(dr as any).is_initial_spawn)
    .sort((a, b) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];
  const lastGuildId = lastDeath ? (lastDeath as any).owner_guild_id : null;
  const lastIdx = lastGuildId
    ? dailyEntries.findIndex(bg => bg.guild_id === lastGuildId)
    : -1;

  let idx: number;
  if (lastDeath && lastGuildId) {
    const bossData = spawns.find(s => s.boss.id === bossId)?.boss;
    const respawnHours = bossData?.respawn_hours ?? 0;
    const deathDate = new Date(lastDeath.death_time);
    const spawnDate = new Date(deathDate.getTime() + respawnHours * 3600000);

    if (deathDate.toLocaleDateString("en-CA", { timeZone: timezone }) === spawnDate.toLocaleDateString("en-CA", { timeZone: timezone })) {
      // Same day — same guild keeps the boss
      idx = lastIdx;
    } else {
      // Different day — advance rotation
      idx = safeMod(lastIdx + 1 + adjustment, dailyEntries.length);
    }
  } else {
    idx = safeMod(1 + adjustment, dailyEntries.length);
  }

  return safeMod(idx, dailyEntries.length);
}

// ── Activity Guild Rotation ─────────────────────────────────

import type { ActivityGuild } from "@/types";

/**
 * Get the guild(s) that own an activity based on rotation mode.
 * Returns single guild name for rotation/daily/schedule, or string[] for "all" mode.
 */
export function getActivityOwnerGuild(
  activityId: string,
  activityGuilds: ActivityGuild[],
  guilds: Guild[],
  /** Number of completed instances for rotation mode */
  instanceCount: number = 0,
  /** Server timezone for daily mode day-boundary */
  timezone: string = "UTC",
): string | string[] | undefined {
  const ags = activityGuilds.filter(ag => ag.activity_id === activityId);
  if (ags.length === 0) return undefined;

  const mode = ags[0].mode;

  // ── All guilds ──
  if (mode === "all") {
    return ags.map(ag => guilds.find(g => g.id === ag.guild_id)?.name).filter(Boolean) as string[];
  }

  // ── Schedule mode ──
  if (mode === "schedule") {
    const now = new Date();
    const dow = now.toLocaleString("en-US", { timeZone: timezone, weekday: "short" });
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayNum = dayMap[dow];
    const match = ags.find(ag => ag.day_of_week === dayNum);
    return match ? guilds.find(g => g.id === match.guild_id)?.name : undefined;
  }

  // ── Daily mode ──
  if (mode === "daily") {
    const entries = ags.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const dayIndex = Math.floor(Date.now() / 86400000);
    const idx = safeMod(dayIndex, entries.length);
    return guilds.find(g => g.id === entries[idx].guild_id)?.name;
  }

  // ── Rotation mode (per finish) ──
  const entries = ags.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const idx = safeMod(instanceCount, entries.length);
  return guilds.find(g => g.id === entries[idx].guild_id)?.name;
}
