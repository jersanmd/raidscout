import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useServer, useHasPermission } from "@/contexts/ServerContext";
import { CountdownTimer } from "./CountdownTimer";
import { DeathRecordModal } from "./DeathRecordModal";
import { BossImage } from "./BossImage";
import { Repeat, Timer, Skull, CheckSquare, Square, Shield, Pencil, X } from "lucide-react";
import { useUserTimezone, formatInTimezone } from "@/hooks/useUserTimezone";
import { useTimer } from "@/hooks/useTimer";
import { guildColor } from "@/lib/constants";
import type { BossWithSpawn } from "@/types";

interface BossCardProps {
  spawn: BossWithSpawn;
  onRecordDeath: (bossId: string, deathTime: Date, rallyImages: File[], attendeeIds: string[]) => void;
  onSetSpawnDate?: (bossId: string, spawnDate: Date) => void;
  onUrgentSpawn?: (bossName: string) => void;
  onCriticalSpawn?: (bossName: string) => void;
  onSpawned?: (bossName: string) => void;
  compact?: boolean;
  multiMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (bossId: string) => void;
  ownerGuildName?: string;
  /** Guild rotation — ordered list of guild names with colors */
  rotationGuilds?: { name: string; color: { bg: string; text: string; border: string } }[];
  /** Current rotation index */
  rotationCurrentIndex?: number;
  /** Rotation mode label ("rotation" or "daily") */
  rotationMode?: string;
  /** Called when user clicks a guild to set rotation to that index */
  onSetRotation?: (targetIndex: number) => void;
  /** Whether viewers are allowed to edit spawn time */
  viewerCanEdit?: boolean;
  /** Whether viewers are allowed to mark as died */
  viewerCanMarkDied?: boolean;
  /** Whether this boss has any guild assignments at all */
  hasGuilds?: boolean;
  justKilled?: boolean;
}

export function BossCard({ spawn, onRecordDeath, onSetSpawnDate, onUrgentSpawn, onCriticalSpawn, onSpawned, compact = false, multiMode = false, selected = false, onToggleSelect, ownerGuildName, rotationGuilds, rotationCurrentIndex, rotationMode, onSetRotation, viewerCanEdit, viewerCanMarkDied, hasGuilds, justKilled }: BossCardProps) {
  const { isViewer } = useAuth();
  const { currentServer } = useServer();
  const { timezone: tz } = useUserTimezone();
  const [showModal, setShowModal] = useState(false);
  const [showEditSpawnModal, setShowEditSpawnModal] = useState(false);
  const [editSpawnDate, setEditSpawnDate] = useState("");
  const [optimisticOwner, setOptimisticOwner] = useState<string | null>(null);

  // Clear optimistic override once the parent prop catches up
  useEffect(() => {
    if (optimisticOwner && ownerGuildName === optimisticOwner) {
      setOptimisticOwner(null);
    }
  }, [ownerGuildName, optimisticOwner]);

  const canSetSpawn = useHasPermission("can_set_spawn");
  const canRecordDeath = useHasPermission("can_record_death");
  const canRotateGuilds = useHasPermission("can_rotate_guilds");

  const displayOwner = optimisticOwner ?? ownerGuildName;
  const { boss, status, nextSpawn } = spawn;
  const canEdit = (viewerCanEdit || (!isViewer && canSetSpawn)) && currentServer && !!onSetSpawnDate && (
    boss.spawn_type === "fixed_hours"
  );
  const canMarkDied = viewerCanMarkDied || (!isViewer && canRecordDeath);

  const statusConfigMap = {
    unknown: {
      bg: "bg-gradient-to-br from-blue-950/20 to-slate-900/80",
      border: "border-blue-900/40",
      badge: "bg-blue-900/50 text-blue-400",
      badgeText: "Unknown",
      dot: "bg-blue-500",
      header: "text-blue-400",
    },
    alive: {
      bg: "bg-gradient-to-br from-emerald-950/30 to-emerald-900/10",
      border: "border-emerald-800/60",
      badge: "bg-emerald-900/50 text-emerald-400",
      badgeText: "ALIVE",
      dot: "bg-emerald-500",
      header: "text-emerald-400",
    },
    countdown: {
      bg: "bg-gradient-to-br from-amber-950/20 to-slate-900/80",
      border: "border-amber-900/40",
      badge: "bg-amber-900/50 text-amber-400",
      badgeText: "Timer",
      dot: "bg-amber-500",
      header: "text-amber-400",
    },
  } as const;

  // Detect countdown expiry so badge auto-updates to ALIVE without page interaction
  const timer = useTimer(nextSpawn);
  const effectiveStatus = (timer.isPast && status === "countdown") ? "alive" as const : status;
  // One-time boss that has been killed: show "Completed"
  const isCompleted = boss.is_recurring === false && (spawn as any).deathRecord;
  const displayStatus = isCompleted ? "unknown" as const : effectiveStatus;
  const config = statusConfigMap[displayStatus];

  const formatDateTime = (d: Date) =>
    formatInTimezone(d, tz, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
      <div
        onClick={() => multiMode && onToggleSelect?.(boss.id)}
        className={`relative rounded-xl border ${config.border} ${config.bg} p-4 transition-all duration-300 animate-[fadeIn_0.5s_ease-out] card-lift shadow-card hover:shadow-card-hover ${status === "alive" ? "hover:shadow-emerald-500/10" : status === "countdown" ? "hover:shadow-amber-500/10" : "hover:shadow-blue-500/10"} ${justKilled ? "animate-[fadeOut_0.4s_ease-out]" : ""} ${
          multiMode ? "cursor-pointer" : ""
        } hover:border-slate-500 ${
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
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Row 1: name + type icon + guild badge + status badge */}
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white truncate text-sm">{boss.name}</h3>
              {boss.spawn_type === "fixed_schedule" ? (
                <span title="Fixed schedule"><Repeat className="w-3.5 h-3.5 text-blue-400 shrink-0" /></span>
              ) : (
                <span title="Fixed hours"><Timer className="w-3.5 h-3.5 text-orange-400 shrink-0" /></span>
              )}
              {displayOwner && (() => { const c = guildColor(displayOwner); return (
                <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
                  <Shield className="w-3 h-3" />
                  {displayOwner}
                </span>
              ); })()}
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${config.badge}`}>
                {config.badgeText}
              </span>
            </div>

            {/* Row 2: Countdown timer + spawn datetime */}
            {isCompleted ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium">Completed</span>
                <span className="text-slate-600">—</span>
                <span className="text-slate-400">Killed {formatDateTime(new Date(spawn.deathRecord!.death_time))}</span>
              </div>
            ) : nextSpawn ? (
              <div className="space-y-1">
                {!compact && (
                  <div className="flex items-baseline gap-2">
                    <CountdownTimer target={nextSpawn} bossName={boss.name} onUrgent={onUrgentSpawn} onCritical={onCriticalSpawn} onSpawned={onSpawned} />
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500">
                    {status === "alive" ? "SPAWN" : "Spawning"}
                  </span>
                  <span className="text-slate-400">{formatDateTime(nextSpawn)}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">Set spawn time to start timer</span>
              </div>
            )}

            {/* Row 3: Respawn / schedule info */}
            {(boss.respawn_hours || boss.schedule) && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              {boss.respawn_hours && <span>+{boss.respawn_hours}h respawn</span>}
              {boss.schedule && (
                <span>
                  {boss.schedule
                    .map((s) => `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][s.day]} ${s.time}`)
                    .join("  ·  ")}
                </span>
              )}
            </div>
            )}
          </div>
        </div>

        {/* Bottom action buttons */}
        {!compact && !multiMode && (canEdit || canMarkDied) && (
          <div className="flex items-center justify-end gap-1.5 mt-3 pt-3 border-t border-slate-700/50">
            {canEdit && (
              <button
                onClick={() => {
                  const d = nextSpawn || new Date();
                  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                  setEditSpawnDate(local);
                  setShowEditSpawnModal(true);
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-900/30 border border-blue-800 text-blue-400 text-xs font-medium hover:bg-blue-900/50 hover:scale-105 active:scale-95 transition-all duration-200 whitespace-nowrap"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Spawn Time
              </button>
            )}
            {canMarkDied && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-red-900/30 border border-red-800 text-red-400 text-xs font-medium hover:bg-red-900/50 hover:scale-105 active:scale-95 transition-all duration-200 whitespace-nowrap"
            >
              <Skull className="w-3.5 h-3.5" />
              Mark Died
            </button>
            )}
          </div>
        )}

        {/* No guild assigned notice */}
        {!compact && !multiMode && !isViewer && !hasGuilds && canRotateGuilds && (
          <div className="mt-2 pt-2 border-t border-slate-700/50">
            <span className="text-[10px] text-amber-500/80 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              No guild assigned — set up in Server Settings → Boss Guilds
            </span>
          </div>
        )}

        {/* Rotation guild row */}
        {!compact && !multiMode && !isViewer && rotationGuilds && rotationGuilds.length > 1 && canRotateGuilds && (
          <div className="mt-2 pt-2 border-t border-slate-700/50">
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
              Rotation {rotationMode ? `· ${rotationMode}` : ""}
            </span>
            <div className="flex items-center gap-1 mt-1.5">
              {rotationGuilds.map((g, i) => {
                const isCurrent = i === rotationCurrentIndex;
                return (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setOptimisticOwner(g.name); onSetRotation?.(i); }}
                    className={`flex-1 text-center px-2 py-1 rounded text-[10px] font-medium border transition-all duration-200 hover:scale-105 active:scale-95 ${
                      isCurrent
                        ? `${g.color.bg} ${g.color.text} ${g.color.border}`
                        : "bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500"
                    }`}
                    title={isCurrent ? `Current: ${g.name}` : `Set rotation to ${g.name}`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
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

      {showEditSpawnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowEditSpawnModal(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Edit Spawn Time</h3>
              <button onClick={() => setShowEditSpawnModal(false)} className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-3">
              Set a new spawn time for <span className="text-white font-medium">{boss.name}</span>
            </p>
            <input
              type="datetime-local"
              value={editSpawnDate}
              onChange={(e) => setEditSpawnDate(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowEditSpawnModal(false)}
                className="px-4 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editSpawnDate && onSetSpawnDate) {
                    const [datePart, timePart] = editSpawnDate.split("T");
                    const [y, m, d] = datePart.split("-").map(Number);
                    const [hh, mm] = timePart.split(":").map(Number);
                    const localDate = new Date(y, m - 1, d, hh, mm);
                    localStorage.setItem(`alert-urgent-${boss.name}-${localDate.getTime()}`, "1");
                    localStorage.setItem(`alert-critical-${boss.name}-${localDate.getTime()}`, "1");
                    onSetSpawnDate(boss.id, localDate);
                  }
                  setShowEditSpawnModal(false);
                }}
                className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
