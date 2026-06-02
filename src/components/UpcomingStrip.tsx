import { useMemo } from "react";
import { useBossSpawns } from "@/hooks/useBossSpawns";
import { CountdownTimer } from "./CountdownTimer";
import { BossImage } from "./BossImage";
import { Clock } from "lucide-react";
import { guildColor } from "@/lib/constants";
import type { BossWithSpawn } from "@/types";

/**
 * Compact horizontal strip showing the next 3 upcoming bosses.
 * Dark "Priority Lane" with threat-level color coding.
 * Only shows "countdown" status — no already-spawned/alive bosses.
 */
export function UpcomingStrip({ ownerGuildName }: { ownerGuildName: (bossId: string) => string | undefined }) {
  const { spawns } = useBossSpawns();

  const upcoming = useMemo(() => {
    return spawns
      .filter((s) => s.status === "countdown")
      .slice(0, 3);
  }, [spawns]);

  if (upcoming.length === 0) {
    return (
      <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-6 text-center">
        <p className="text-[#52525b] text-sm">
          No upcoming spawns — record some deaths to start timers
        </p>
      </div>
    );
  }

  const formatTime = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-xl border border-[#27272a] bg-[#18181b] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#27272a]">
        <Clock className="w-4 h-4 text-[#71717a]" />
        <span className="text-sm font-medium text-[#fafafa]">Upcoming</span>
      </div>

      {/* 3-column strip — threat-level colors */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.04]">
        {upcoming.map((s, i) => (
          <UpcomingSlot
            key={s.boss.id}
            spawn={s}
            threatLevel={i === 0 ? "critical" : i === 1 ? "warning" : "normal"}
            formatTime={formatTime}
            guildName={ownerGuildName(s.boss.id)}
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

const threatStyles = {
  critical: { dot: "bg-red-500", label: "Now" },
  warning: { dot: "bg-amber-500", label: "Soon" },
  normal: { dot: "bg-[#52525b]", label: "Upcoming" },
} as const;

function UpcomingSlot({
  spawn,
  threatLevel,
  formatTime,
  guildName,
}: {
  spawn: BossWithSpawn;
  threatLevel: "critical" | "warning" | "normal";
  formatTime: (d: Date) => string;
  guildName?: string;
}) {
  const t = threatStyles[threatLevel];

  return (
    <div className="relative flex items-center gap-3 p-4">
      {/* Minimal monochrome avatar */}
      <BossImage bossName={spawn.boss.name} size="sm" />

      {/* Name + time */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[#fafafa] font-medium text-sm truncate">
            {spawn.boss.name}
          </span>
          {guildName && (() => { const c = guildColor(guildName); return (
            <span className="text-[11px] text-[#71717a] font-medium shrink-0">
              {guildName}
            </span>
          ); })()}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-[#52525b] font-mono">
            {spawn.nextSpawn ? formatTime(spawn.nextSpawn) : "—"}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-[#71717a]">
            <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
            {t.label}
          </span>
        </div>
      </div>

      {/* Live countdown */}
      <div className="shrink-0 text-right">
        <CountdownTimer target={spawn.nextSpawn} />
      </div>
    </div>
  );
}
