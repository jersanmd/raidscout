import { useState, useEffect, useRef } from "react";

/**
 * Live countdown hook. Returns the remaining time in formatted strings.
 * Updates every second.
 */
export function useTimer(target: Date | null) {
  const [now, setNow] = useState(() => new Date());
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    intervalRef.current = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  if (!target) {
    return {
      remainingMs: 0,
      isPast: false,
      hours: "00",
      minutes: "00",
      seconds: "00",
      display: "--:--:--",
      totalSeconds: 0,
    };
  }

  const remainingMs = target.getTime() - now.getTime();
  const isPast = remainingMs <= 0;
  const absMs = Math.abs(remainingMs);

  const totalSeconds = Math.floor(absMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    remainingMs,
    isPast,
    hours: pad(h),
    minutes: pad(m),
    seconds: pad(s),
    display: `${pad(h)}:${pad(m)}:${pad(s)}`,
    totalSeconds,
  };
}
