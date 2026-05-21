import { useTimer } from "@/hooks/useTimer";

interface CountdownTimerProps {
  target: Date | null;
}

export function CountdownTimer({ target }: CountdownTimerProps) {
  const timer = useTimer(target);

  if (!target) {
    return <span className="text-slate-500 font-mono">--:--:--</span>;
  }

  if (timer.isPast) {
    return (
      <span className="text-green-400 font-mono font-bold text-lg animate-pulse">
        ALIVE
      </span>
    );
  }

  const isUrgent = !timer.isPast && timer.totalSeconds < 300; // < 5 min

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
