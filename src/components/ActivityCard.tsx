import type { ActivityInfo } from "@/types";
import { CountdownTimer } from "@/components/CountdownTimer";

interface ActivityCardProps {
  info: ActivityInfo;
}

export function ActivityCard({ info }: ActivityCardProps) {
  const { activity, startTime, status } = info;

  return (
    <div className="relative rounded-xl border border-blue-900/30 bg-slate-900/60 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">📅</span>
          <h3 className="text-sm font-semibold text-white truncate">{activity.name}</h3>
        </div>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
          status === "active" ? "bg-emerald-900/40 text-emerald-400 border border-emerald-800" :
          status === "completed" ? "bg-slate-800 text-slate-500" :
          "bg-blue-900/40 text-blue-400 border border-blue-800"
        }`}>
          {status === "active" ? "ACTIVE" : status === "completed" ? "DONE" : "UPCOMING"}
        </span>
      </div>

      {/* Timer */}
      {status === "countdown" && (
        <div className="space-y-1">
          <CountdownTimer target={startTime} bossName={activity.name} />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500">Starts</span>
            <span className="text-slate-400">
              {startTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      )}

      {status === "active" && (
        <p className="text-xs text-emerald-400">In progress</p>
      )}

      {status === "completed" && (
        <p className="text-xs text-slate-500">Completed</p>
      )}

      {/* Party size badge */}
      {activity.party_size && (
        <div className="mt-2 pt-2 border-t border-slate-800">
          <span className="text-[10px] text-slate-500">
            {activity.party_size} members per party
          </span>
        </div>
      )}
    </div>
  );
}
