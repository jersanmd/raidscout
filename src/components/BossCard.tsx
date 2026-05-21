import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { CountdownTimer } from "./CountdownTimer";
import { DeathRecordModal } from "./DeathRecordModal";
import { NotificationToggle } from "./NotificationToggle";
import { BossImage } from "./BossImage";
import { Clock, Repeat, Timer, Skull, CheckSquare, Square, Shield } from "lucide-react";
import { guildColor } from "@/lib/constants";
import type { BossWithSpawn } from "@/types";

interface BossCardProps {
  spawn: BossWithSpawn;
  onRecordDeath: (bossId: string, deathTime: Date, rallyImages: File[], attendeeIds: string[]) => void;
  compact?: boolean;
  multiMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (bossId: string) => void;
  ownerGuildName?: string;
}

export function BossCard({ spawn, onRecordDeath, compact = false, multiMode = false, selected = false, onToggleSelect, ownerGuildName }: BossCardProps) {
  const { isViewer } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const { boss, status, nextSpawn } = spawn;

  const statusConfig = {
    unknown: {
      bg: "bg-slate-800",
      border: "border-slate-700",
      badge: "bg-slate-700 text-slate-300",
      badgeText: "Unknown",
    },
    alive: {
      bg: "bg-emerald-900/20",
      border: "border-emerald-800",
      badge: "bg-emerald-900/50 text-emerald-400",
      badgeText: "ALIVE",
    },
    countdown: {
      bg: "bg-slate-800",
      border: "border-slate-700",
      badge: "bg-amber-900/50 text-amber-400",
      badgeText: "Timer",
    },
  }[status];

  const formatDateTime = (d: Date) =>
    d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div
        onClick={() => multiMode && onToggleSelect?.(boss.id)}
        className={`relative rounded-xl border ${statusConfig.border} ${statusConfig.bg} p-4 transition ${
          multiMode ? "cursor-pointer" : ""
        } hover:border-slate-600 ${
          selected ? "ring-2 ring-blue-500 border-blue-500" : ""
        }`}
      >
        {multiMode && (
          <div className="absolute top-3 right-3 z-10">
            {selected ? (
              <CheckSquare className="w-5 h-5 text-blue-400" />
            ) : (
              <Square className="w-5 h-5 text-slate-600" />
            )}
          </div>
        )}
        <div className="flex gap-4">
          {/* Large boss image */}
          <BossImage bossName={boss.name} size="lg" />

          {/* Right side: all info */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Top row: name + type icon + countdown */}
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white truncate">{boss.name}</h3>
              {ownerGuildName && (() => { const c = guildColor(ownerGuildName); return (
                <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
                  <Shield className="w-3 h-3" />
                  {ownerGuildName}
                </span>
              ); })()}
              {boss.spawn_type === "fixed_schedule" ? (
                <span title="Fixed schedule"><Repeat className="w-3.5 h-3.5 text-blue-400 shrink-0" /></span>
              ) : (
                <span title="Fixed hours"><Timer className="w-3.5 h-3.5 text-orange-400 shrink-0" /></span>
              )}
              {!compact && nextSpawn && (
                <CountdownTimer target={nextSpawn} />
              )}
            </div>

            {/* Spawn info */}
            {nextSpawn ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">
                  {status === "alive" ? "Spawned" : "Spawning"}
                </span>
                <span className="text-slate-300">
                  {formatDateTime(nextSpawn)}
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusConfig.badge}`}>
                  {statusConfig.badgeText}
                </span>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Record a death to start the timer</p>
            )}

            {/* Respawn / schedule info */}
            {boss.respawn_hours && (
              <p className="text-xs text-slate-600">
                +{boss.respawn_hours}h respawn
              </p>
            )}
            {boss.schedule && (
              <p className="text-xs text-slate-600">
                {boss.schedule
                  .map(
                    (s) =>
                      `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][s.day]} ${s.time}`
                  )
                  .join("  ·  ")}
              </p>
            )}

            {/* Actions */}
            {!compact && !multiMode && !isViewer && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm font-medium hover:bg-red-900/50 transition"
                >
                  <Skull className="w-3.5 h-3.5" />
                  Mark as Died
                </button>
                <NotificationToggle bossId={boss.id} bossName={boss.name} />
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <DeathRecordModal
          boss={boss}
          onClose={() => setShowModal(false)}
          onSubmit={(dt, imgs, ids) => {
            onRecordDeath(boss.id, dt, imgs, ids);
            setShowModal(false);
          }}
        />
      )}
    </>
  );
}
