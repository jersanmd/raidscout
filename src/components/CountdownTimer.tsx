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
  const SpawnedKey = target && bossName ? `alert-Spawned-${bossName}-${target.getTime()}` : null;

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
    if (justSpawned && SpawnedKey && !localStorage.getItem(SpawnedKey) && bossName && onSpawned) {
      localStorage.setItem(SpawnedKey, "1");
      onSpawned(bossName);
    }
  }, [justSpawned, bossName, onSpawned, SpawnedKey]);

  if (!target) {
    return <span className="text-[#52525b] font-mono text-sm">--:--:--</span>;
  }

  if (timer.isPast) {
    return (
      <span className="text-emerald-400 font-mono font-medium text-base animate-pulse">
        Spawned
      </span>
    );
  }

  return (
    <span
      className={`font-mono font-medium tabular-nums text-base tracking-tight ${
        isCritical
          ? "text-red-500 animate-pulse"
          : isUrgent
            ? "text-red-400 animate-pulse"
            : timer.totalSeconds < 3600
              ? "text-amber-400"
              : "text-[#fafafa]"
      }`}
    >
      {timer.display}
    </span>
  );
}
