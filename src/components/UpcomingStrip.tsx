import { useMemo } from "react";
import { useBossSpawns } from "@/hooks/useBossSpawns";
import { CountdownTimer } from "./CountdownTimer";
import { BossImage } from "./BossImage";
import { Clock, Shield } from "lucide-react";
import { guildColor } from "@/lib/constants";
import type { BossWithSpawn } from "@/types";

/**
 * Compact horizontal strip showing the next 3 upcoming bosses.
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
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-center">
        <p className="text-slate-500 text-sm">
          No upcoming spawns — record some deaths to start timers
        </p>
      </div>
    );
  }

  const formatTime = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/80">
        <Clock className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold text-white">Upcoming</span>
      </div>

      {/* 3-column strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
        {upcoming.map((s, i) => (
          <UpcomingSlot
            key={s.boss.id}
            spawn={s}
            isFirst={i === 0}
            formatTime={formatTime}
            guildName={ownerGuildName(s.boss.id)}
          />
        ))}
        {/* Fill empty slots so the strip always has 3 columns */}
        {Array.from({ length: Math.max(0, 3 - upcoming.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center justify-center p-4 text-slate-600 text-sm"
          >
            —
          </div>
        ))}
      </div>
    </div>
  );
}

function UpcomingSlot({
  spawn,
  isFirst,
  formatTime,
  guildName,
}: {
  spawn: BossWithSpawn;
  isFirst: boolean;
  formatTime: (d: Date) => string;
  guildName?: string;
}) {
  return (
    <div
      className={`relative flex items-center gap-3 p-4 ${
        isFirst ? "bg-amber-900/10" : ""
      }`}
    >
      {/* Boss image */}
      <BossImage bossName={spawn.boss.name} size="md" />

      {/* Name + time */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-white font-semibold text-sm truncate">
            {spawn.boss.name}
          </span>
          {guildName && (() => { const c = guildColor(guildName); return (
            <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
              <Shield className="w-3 h-3" />
              {guildName}
            </span>
          ); })()}
          {isFirst && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-900/50 text-amber-400 shrink-0">
              NEXT
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {spawn.nextSpawn ? formatTime(spawn.nextSpawn) : "—"}
        </div>
      </div>

      {/* Live countdown */}
      <div className="shrink-0 text-right">
        <CountdownTimer target={spawn.nextSpawn} />
      </div>
    </div>
  );
}
