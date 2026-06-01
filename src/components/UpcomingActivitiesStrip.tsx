import { useActivities } from "@/hooks/useActivities";
import { getUpcomingActivities } from "@/lib/activityCalculator";
import { useMemo } from "react";

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
    return getUpcomingActivities(activities, lastMap, 1).slice(0, 3);
  }, [activities, activityInstances]);

  if (upcoming.length === 0) return null;

  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Upcoming Activities</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {upcoming.map((info) => (
          <div
            key={info.activity.id}
            className="flex items-center gap-1.5 shrink-0 bg-slate-800/50 border border-blue-900/30 rounded-lg px-2.5 py-1.5"
          >
            <span className="text-xs">📅</span>
            <span className="text-xs text-blue-300 font-medium truncate max-w-[120px]">
              {info.activity.name}
            </span>
            <span className="text-[10px] text-slate-500">
              {info.startTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
