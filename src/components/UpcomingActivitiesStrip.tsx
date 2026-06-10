import { useActivities } from "@/hooks/useActivities";
import { getUpcomingActivities } from "@/lib/activityCalculator";
import { useMemo } from "react";
import { useTimer } from "@/hooks/useTimer";
import { CountdownTimer } from "./CountdownTimer";
import { Clock } from "lucide-react";

export function UpcomingActivitiesStrip() {
  const { activities, activityInstances } = useActivities();

  const upcoming = useMemo(() => {
    if (activities.length === 0) return [];
    const lastMap = new Map<string, any>();
    for (const ai of activityInstances) {
      if (!lastMap.has(ai.activity_id)) {
        lastMap.set(ai.activity_id, ai);
      }
    }
    return getUpcomingActivities(activities, lastMap, 365).slice(0, 3);
  }, [activities, activityInstances]);

  if (upcoming.length === 0) return null;

  const formatTime = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-xl border border-[#27272a] bg-[#18181b] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#27272a]">
        <Clock className="w-4 h-4 text-[#71717a]" />
        <span className="text-sm font-medium text-[#fafafa]">Upcoming Activities</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.04]">
        {upcoming.map((info) => (
          <UpcomingActivitySlot
            key={info.activity.id}
            activity={info.activity}
            startTime={info.startTime}
            formatTime={formatTime}
          />
        ))}
        {Array.from({ length: Math.max(0, 3 - upcoming.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="flex items-center justify-center p-6 text-[#3f3f46] text-sm font-mono">
            —
          </div>
        ))}
      </div>
    </div>
  );
}

function UpcomingActivitySlot({
  activity,
  startTime,
  formatTime,
}: {
  activity: { id: string; name: string; image_url?: string | null };
  startTime: Date;
  formatTime: (d: Date) => string;
}) {
  const timer = useTimer(startTime);
  const threatLevel: "critical" | "warning" | "normal" = timer.isPast
    ? "normal"
    : timer.totalSeconds <= 300
      ? "critical"
      : timer.totalSeconds <= 3600
        ? "warning"
        : "normal";

  return (
    <div className={`relative flex items-center gap-3 p-4 ${threatLevel === "critical" ? "boss-card-urgent" : threatLevel === "warning" ? "boss-card-warning" : ""}`}>
      {activity.image_url ? (
        <img src={activity.image_url} alt={activity.name} className="w-8 h-8 rounded-xl object-cover border border-[#27272a] shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-xl bg-[#09090b] border border-[#27272a] flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4 text-[#52525b]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-medium text-sm truncate ${threatLevel === "critical" ? "text-red-400" : threatLevel === "warning" ? "text-amber-400" : "text-[#fafafa]"}`}>
            {activity.name}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-[#52525b] font-mono">{formatTime(startTime)}</span>
          <span className={`inline-flex items-center gap-1 text-[10px] ${threatLevel === "critical" ? "text-red-400" : threatLevel === "warning" ? "text-amber-400" : "text-[#71717a]"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${threatLevel === "critical" ? "bg-red-500" : threatLevel === "warning" ? "bg-amber-500" : "bg-[#52525b]"}`} />
            {threatLevel === "critical" ? "Now" : threatLevel === "warning" ? "Soon" : "Upcoming"}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <CountdownTimer target={startTime} bossName={activity.name} />
      </div>
    </div>
  );
}
