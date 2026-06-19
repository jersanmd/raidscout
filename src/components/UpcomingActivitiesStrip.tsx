import { useActivities } from "@/hooks/useActivities";
import { getUpcomingActivities } from "@/lib/activityCalculator";
import { useMemo } from "react";
import { useTimer } from "@/hooks/useTimer";
import { CountdownTimer } from "./CountdownTimer";
import { Clock, Shield } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerId } from "@/contexts/ServerContext";
import { supabase } from "@/lib/supabase";
import { guildColor } from "@/lib/constants";
import type { ActivityGuild, Guild } from "@/types";

export function UpcomingActivitiesStrip() {
  const { activities, activityInstances } = useActivities();
  const serverId = useServerId();

  // Fetch guilds and activity guilds for badge display
  const { data: guilds = [] } = useQuery({
    queryKey: ["guilds", serverId],
    queryFn: async () => {
      if (!serverId) return [];
      const { data } = await supabase.from("guilds").select("id, name").eq("server_id", serverId);
      return (data || []) as Guild[];
    },
    enabled: !!serverId,
  });

  const { data: activityGuilds = [] } = useQuery({
    queryKey: ["activity_guilds", serverId],
    queryFn: async () => {
      if (!serverId) return [];
      const { data } = await supabase.from("activity_guilds").select("*");
      return (data || []) as ActivityGuild[];
    },
    enabled: !!serverId,
  });

  const getActivityOwnerGuilds = (activityId: string): string[] => {
    const ags = activityGuilds
      .filter(ag => ag.activity_id === activityId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (ags.length === 0) return [];
    // Mode "all" — show all assigned guild badges
    if (ags[0].mode === "all") {
      return ags.map(ag => guilds.find(g => g.id === ag.guild_id)?.name).filter(Boolean) as string[];
    }
    // Other modes — single guild
    const name = guilds.find(g => g.id === ags[0].guild_id)?.name;
    return name ? [name] : [];
  };

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
            ownerGuildNames={getActivityOwnerGuilds(info.activity.id)}
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
  ownerGuildNames,
}: {
  activity: { id: string; name: string; image_url?: string | null };
  startTime: Date;
  formatTime: (d: Date) => string;
  ownerGuildNames?: string[];
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
        {ownerGuildNames && ownerGuildNames.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-1">
            {ownerGuildNames.map((guildName) => {
              const c = guildColor(guildName);
              return (
                <span key={guildName} className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
                  <Shield className="w-2.5 h-2.5" />
                  {guildName}
                </span>
              );
            })}
          </div>
        )}
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
