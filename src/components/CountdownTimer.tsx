import { useRef, useEffect } from "react";
import { useTimer } from "@/hooks/useTimer";

interface CountdownTimerProps {
  target: Date | null;
  bossName?: string;
  onUrgent?: (bossName: string) => void;
  onCritical?: (bossName: string) => void;
  onSpawned?: (bossName: string) => void;
}

export function CountdownTimer({ target, bossName, onUrgent, onCritical, onSpawned }: CountdownTimerProps) {
  const timer = useTimer(target);
  const urgentKey = target && bossName ? `alert-urgent-${bossName}-${target.getTime()}` : null;
  const criticalKey = target && bossName ? `alert-critical-${bossName}-${target.getTime()}` : null;
  const spawnedKey = target && bossName ? `alert-spawned-${bossName}-${target.getTime()}` : null;

  const isUrgent = !timer.isPast && timer.totalSeconds > 0 && timer.totalSeconds <= 300;
  const isCritical = !timer.isPast && timer.totalSeconds > 0 && timer.totalSeconds <= 5;
  const justSpawned = timer.isPast && timer.totalSeconds === 0;

  useEffect(() => {
    if (isUrgent && urgentKey && !localStorage.getItem(urgentKey) && bossName && onUrgent) {
      localStorage.setItem(urgentKey, "1");
      onUrgent(bossName);
    }
  }, [isUrgent, bossName, onUrgent, urgentKey]);

  useEffect(() => {
    if (isCritical && criticalKey && !localStorage.getItem(criticalKey) && bossName && onCritical) {
      localStorage.setItem(criticalKey, "1");
      onCritical(bossName);
    }
  }, [isCritical, bossName, onCritical, criticalKey]);

  useEffect(() => {
    if (justSpawned && spawnedKey && !localStorage.getItem(spawnedKey) && bossName && onSpawned) {
      localStorage.setItem(spawnedKey, "1");
      onSpawned(bossName);
    }
  }, [justSpawned, bossName, onSpawned, spawnedKey]);

  if (!target) {
    return <span className="text-slate-500 font-mono">--:--:--</span>;
  }

  if (timer.isPast) {
    return (
      <span className="text-green-400 font-mono font-bold text-lg animate-pulse">
        SPAWNED
      </span>
    );
  }

  return (
    <span
      className={`font-mono font-bold tabular-nums ${
        isUrgent
          ? "text-red-400 animate-pulse text-lg"
          : timer.totalSeconds < 3600
            ? "text-amber-400"
            : "text-slate-200"
      }`}
    >
      {timer.display}
    </span>
  );
}
