import { useRef, useEffect } from "react";
import { useTimer } from "@/hooks/useTimer";

interface CountdownTimerProps {
  target: Date | null;
  bossName?: string;
  onUrgent?: (bossName: string) => void;
  onCritical?: (bossName: string) => void;
}

export function CountdownTimer({ target, bossName, onUrgent, onCritical }: CountdownTimerProps) {
  const timer = useTimer(target);
  const urgentKey = target && bossName ? `alert-urgent-${bossName}-${target.getTime()}` : null;
  const criticalKey = target && bossName ? `alert-critical-${bossName}-${target.getTime()}` : null;

  const isUrgent = !timer.isPast && timer.totalSeconds > 0 && timer.totalSeconds <= 300;
  const isCritical = !timer.isPast && timer.totalSeconds > 0 && timer.totalSeconds <= 5;

  // Cleanup stale alert keys on mount (prevent localStorage pollution)
  useEffect(() => {
    const prefix = "alert-urgent-";
    const prefix2 = "alert-critical-";
    const cutoff = Date.now() - 600_000; // 10 minutes ago
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(prefix) || key.startsWith(prefix2))) {
        const ts = Number(key.split("-").pop());
        if (ts && ts < cutoff) localStorage.removeItem(key);
      }
    }
  }, []);

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
