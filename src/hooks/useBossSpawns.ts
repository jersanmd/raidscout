import { useMemo } from "react";
import { useBosses } from "./useBosses";
import { useDeathRecords } from "./useDeathRecords";
import type { Boss, DeathRecord, BossWithSpawn } from "@/types";
import { calculateSpawnInfo } from "@/lib/spawnCalculator";

/**
 * Combines boss data + death records into computed spawn info.
 * Recomputes when either data source changes.
 */
export function useBossSpawns(filterText: string = "", filterType: string = "all", _refreshKey?: number) {
  const { data: bosses = [], isLoading: bossesLoading } = useBosses();
  const { data: deathRecords = [], isLoading: recordsLoading } = useDeathRecords();

  const spawns = useMemo(() => {
    // deathRecords sorted DESC — reverse so latest overwrites oldest in Map
    const deathMap = new Map<string, DeathRecord>(
      [...deathRecords].reverse().map((d) => [d.boss_id, d])
    );

    let filtered = bosses;

    // Text filter
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      filtered = filtered.filter((b) => b.name.toLowerCase().includes(q));
    }

    // Type filter
    if (filterType === "fixed_hours" || filterType === "fixed_schedule") {
      filtered = filtered.filter((b) => b.spawn_type === filterType);
    }

    const now = new Date();

    const result: BossWithSpawn[] = filtered.map((boss) => {
      const info = calculateSpawnInfo(boss, deathMap.get(boss.id) ?? null, now);
      const remainingMs = info.nextSpawn
        ? info.nextSpawn.getTime() - now.getTime()
        : Number.POSITIVE_INFINITY;

      return { ...info, remainingMs };
    });

    // Sort: alive first, then countdown (soonest), then unknown
    result.sort((a, b) => {
      const order = { alive: 0, countdown: 1, unknown: 2 };
      const aOrd = order[a.status] ?? 2;
      const bOrd = order[b.status] ?? 2;
      if (aOrd !== bOrd) return aOrd - bOrd;
      if (a.status === "countdown" && b.status === "countdown") {
        return a.remainingMs - b.remainingMs;
      }
      return a.boss.name.localeCompare(b.boss.name);
    });

    return result;
  }, [bosses, deathRecords, filterText, filterType, _refreshKey]);

  return {
    spawns,
    isLoading: bossesLoading || recordsLoading,
  };
}
