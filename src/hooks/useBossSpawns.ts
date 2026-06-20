import { useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBosses } from "./useBosses";
import { useDeathRecords } from "./useDeathRecords";
import { fetchSpawnOverrides } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import type { Boss, DeathRecord, BossWithSpawn } from "@/types";
import { calculateSpawnInfo } from "@/lib/spawnCalculator";

export function useBossSpawns(filterText: string = "", filterType: string = "all", _refreshKey?: number) {
  const { data: bosses = [], isLoading: bossesLoading } = useBosses();
  const { data: deathRecords = [], isLoading: recordsLoading } = useDeathRecords();
  const serverId = useServerId();
  const queryClient = useQueryClient();

  const { data: overrides = [] } = useQuery({
    queryKey: ["spawn_overrides", serverId],
    queryFn: () => fetchSpawnOverrides(serverId!),
    staleTime: 10_000,
    enabled: !!serverId,
  });

  // Realtime subscription for boss_spawn_overrides (forcespawn)
  useEffect(() => {
    if (!serverId) return;
    const channelName = `spawn-overrides-${serverId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "boss_spawn_overrides" }, () => {
        queryClient.invalidateQueries({ queryKey: ["spawn_overrides", serverId] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "boss_spawn_overrides" }, () => {
        queryClient.invalidateQueries({ queryKey: ["spawn_overrides", serverId] });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "boss_spawn_overrides" }, () => {
        queryClient.invalidateQueries({ queryKey: ["spawn_overrides", serverId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel).catch(() => {}); };
  }, [serverId, queryClient]);

  const overrideMap = useMemo(() => {
    const map = new Map<string, { death_time: string }>();
    for (const o of overrides) map.set(o.boss_id, o);
    return map;
  }, [overrides]);

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
      const info = calculateSpawnInfo(boss, deathMap.get(boss.id) ?? null, now, overrideMap.get(boss.id));
      const remainingMs = info.nextSpawn
        ? info.nextSpawn.getTime() - now.getTime()
        : Number.POSITIVE_INFINITY;

      return { ...info, remainingMs };
    });

    // Sort: unknown first, then alive, then countdown (soonest)
    result.sort((a, b) => {
      const order = { unknown: 0, alive: 1, countdown: 2 };
      const aOrd = order[a.status] ?? 2;
      const bOrd = order[b.status] ?? 2;
      if (aOrd !== bOrd) return aOrd - bOrd;
      if (a.status === "countdown" && b.status === "countdown") {
        return a.remainingMs - b.remainingMs;
      }
      return a.boss.name.localeCompare(b.boss.name);
    });

    return result;
  }, [bosses, deathRecords, overrideMap, filterText, filterType, _refreshKey]);

  return {
    spawns,
    isLoading: bossesLoading || recordsLoading,
  };
}
