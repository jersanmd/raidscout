import type { ActivityInfo } from "@/types";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Timer, Calendar, Users, Star } from "lucide-react";

interface ActivityCardProps {
  info: ActivityInfo;
}

export function ActivityCard({ info }: ActivityCardProps) {
  const { activity, startTime, status } = info;

  return (
    <div className="relative rounded-xl border border-[#27272a] border-l-[#27272a] border-l-2 bg-[#18181b] p-3 sm:p-4 transition-all duration-300 backdrop-blur-sm hover:border-[#52525b] hover:-translate-y-0.5">
      <div className="flex gap-3 sm:gap-4 relative z-[1]">
        {/* Left: image or placeholder */}
        {activity.image_url ? (
          <img alt={activity.name} className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover border border-[#27272a] shrink-0" src={activity.image_url} />
        ) : (
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#09090b] border border-[#27272a] flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-[#52525b]" />
          </div>
        )}

        {/* Right: content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Name row */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <h3 className="font-bold text-[#fafafa] truncate text-xs sm:text-sm tracking-wide">
              {activity.name}
            </h3>
            <span title={activity.schedule_type === "fixed_hours" ? "Fixed hours" : activity.schedule_type === "fixed_schedule" ? "Fixed schedule" : "One time"}>
              {activity.schedule_type === "fixed_hours" ? (
                <Timer className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0" />
              ) : (
                <Calendar className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0" />
              )}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 tracking-wider text-[#71717a]">
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                activity.schedule_type === "fixed_hours" ? "bg-emerald-500" :
                activity.schedule_type === "fixed_schedule" ? "bg-violet-500" : "bg-amber-500"
              }`} />
              Activity
            </span>
            {(activity as any).category && (
              <span className="text-[10px] text-[#52525b] font-mono truncate max-w-[120px]">{(activity as any).category}</span>
            )}
          </div>

          {/* Timer area */}
          <div className="space-y-1">
            {status === "countdown" ? (
              <>
                <CountdownTimer target={startTime} bossName={activity.name} />
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-[#71717a] font-mono uppercase tracking-wider">
                    {activity.schedule_type === "fixed_hours" ? "NEXT" : "STARTS"}
                  </span>
                  <span className="text-[#a1a1aa] font-mono">
                    {startTime.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, {startTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </>
            ) : status === "active" ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-[#a1a1aa] font-mono font-medium text-base animate-pulse">In Progress</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-[#71717a] font-mono uppercase tracking-wider">ACTIVE</span>
                  <span className="text-[#a1a1aa] font-mono">
                    Started {startTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </>
            ) : status === "completed" ? (
              <>
                <div className="text-[11px] text-[#52525b] font-mono">Completed</div>
              </>
            ) : (
              <div className="text-[11px] text-[#a1a1aa] font-mono">
                {activity.schedule_type === "fixed_hours" ? "Fixed Hours" : activity.schedule_type === "fixed_schedule" ? "Fixed Schedule" : "One Time"}
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-2 text-[10px] text-[#52525b] font-mono">
            {activity.party_size && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />{activity.party_size}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3" />{activity.points_per_participant}pt
            </span>
            {activity.duration_minutes && (
              <span>{activity.duration_minutes}m recur</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
