import { useEffect, useRef, useCallback } from "react";
import { useServerId } from "@/contexts/ServerContext";

type SpawnListener = (bossName: string) => void;
const listeners = new Set<SpawnListener>();

export function emitSpawnAlert(bossName: string) {
  listeners.forEach(fn => fn(bossName));
}

/**
 * Hook to listen for spawn alerts and provide a function to emit them.
 * Works within the same browser session — all open tabs/components.
 */
export function useSpawnAlerts(onSpawnAlert: (bossName: string) => void) {
  const onSpawnRef = useRef(onSpawnAlert);
  onSpawnRef.current = onSpawnAlert;

  useEffect(() => {
    const handler = (bossName: string) => onSpawnRef.current(bossName);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const alertSpawn = useCallback((bossName: string) => {
    emitSpawnAlert(bossName);
  }, []);

  return { alertSpawn };
}
