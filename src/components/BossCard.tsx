import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { CountdownTimer } from "./CountdownTimer";
import { DeathRecordModal } from "./DeathRecordModal";
import { BossImage } from "./BossImage";
import { Repeat, Timer, Skull, CheckSquare, Square, Shield, Pencil, X, Check } from "lucide-react";
import { useServerTimezone, formatInTimezone } from "@/hooks/useServerTimezone";
import { guildColor } from "@/lib/constants";
import type { BossWithSpawn } from "@/types";

interface BossCardProps {
  spawn: BossWithSpawn;
  onRecordDeath: (bossId: string, deathTime: Date, rallyImages: File[], attendeeIds: string[]) => void;
  onSetSpawnDate?: (bossId: string, spawnDate: Date) => void;
  onUrgentSpawn?: (bossName: string) => void;
  onCriticalSpawn?: (bossName: string) => void;
  compact?: boolean;
  multiMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (bossId: string) => void;
  ownerGuildName?: string;
}

export function BossCard({ spawn, onRecordDeath, onSetSpawnDate, onUrgentSpawn, onCriticalSpawn, compact = false, multiMode = false, selected = false, onToggleSelect, ownerGuildName }: BossCardProps) {
  const { isViewer } = useAuth();
  const { currentServer } = useServer();
  const tz = useServerTimezone();
  const [showModal, setShowModal] = useState(false);
  const [editingSpawn, setEditingSpawn] = useState(false);
  const [editSpawnDate, setEditSpawnDate] = useState("");
  const { boss, status, nextSpawn } = spawn;
  const canEdit = !isViewer && currentServer && (boss.spawn_type === "fixed_hours" || status === "unknown") && !!onSetSpawnDate;

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
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Row 1: name + type icon + guild badge + status badge */}
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white truncate text-sm">{boss.name}</h3>
              {boss.spawn_type === "fixed_schedule" ? (
                <span title="Fixed schedule"><Repeat className="w-3.5 h-3.5 text-blue-400 shrink-0" /></span>
              ) : (
                <span title="Fixed hours"><Timer className="w-3.5 h-3.5 text-orange-400 shrink-0" /></span>
              )}
              {ownerGuildName && (() => { const c = guildColor(ownerGuildName); return (
                <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
                  <Shield className="w-3 h-3" />
                  {ownerGuildName}
                </span>
              ); })()}
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${statusConfig.badge}`}>
                {statusConfig.badgeText}
              </span>
            </div>

            {/* Row 2: Countdown timer + spawn datetime */}
            {nextSpawn ? (
              <div className="space-y-1">
                {!compact && (
                  <div className="flex items-baseline gap-2">
                    <CountdownTimer target={nextSpawn} bossName={boss.name} onUrgent={onUrgentSpawn} onCritical={onCriticalSpawn} />
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500">
                    {status === "alive" ? "SPAWN" : "Spawning"}
                  </span>
                  {editingSpawn ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="datetime-local"
                        value={editSpawnDate}
                        onChange={(e) => setEditSpawnDate(e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded-md px-2 py-1 text-xs text-white outline-none focus:border-blue-500 w-[180px]"
                        autoFocus
                      />
                      <button onClick={() => {
                        if (editSpawnDate && onSetSpawnDate) {
                          const [datePart, timePart] = editSpawnDate.split("T");
                          const [y, m, d] = datePart.split("-").map(Number);
                          const [hh, mm] = timePart.split(":").map(Number);
                          const localDate = new Date(y, m - 1, d, hh, mm);
                          localStorage.setItem(`alert-urgent-${boss.name}-${localDate.getTime()}`, "1");
                          localStorage.setItem(`alert-critical-${boss.name}-${localDate.getTime()}`, "1");
                          onSetSpawnDate(boss.id, localDate);
                        }
                        setEditingSpawn(false);
                      }} className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-900/30 transition" title="Apply">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingSpawn(false)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-700 transition" title="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-slate-400">{formatDateTime(nextSpawn)}</span>
                      {canEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); 
                            const d = nextSpawn;
                            const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                            setEditSpawnDate(local); setEditingSpawn(true); 
                          }}
                          className="p-0.5 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-900/20 transition"
                          title="Set spawn date"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs">
                {editingSpawn ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="datetime-local"
                      value={editSpawnDate}
                      onChange={(e) => setEditSpawnDate(e.target.value)}
                      className="bg-slate-700 border border-slate-600 rounded-md px-2 py-1 text-xs text-white outline-none focus:border-blue-500 w-[180px]"
                      autoFocus
                    />
                    <button onClick={() => {
                      if (editSpawnDate && onSetSpawnDate) {
                        const [datePart, timePart] = editSpawnDate.split("T");
                        const [y, m, d] = datePart.split("-").map(Number);
                        const [hh, mm] = timePart.split(":").map(Number);
                        const localDate = new Date(y, m - 1, d, hh, mm);
                        onSetSpawnDate(boss.id, localDate);
                      }
                      setEditingSpawn(false);
                    }} className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-900/30 transition" title="Apply">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingSpawn(false)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-700 transition" title="Cancel">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-slate-500">Set spawn time to start timer</span>
                    {canEdit && (
                      <button
                        onClick={(e) => { e.stopPropagation();
                          const now = new Date();
                          const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                          setEditSpawnDate(local); setEditingSpawn(true);
                        }}
                        className="p-0.5 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-900/20 transition"
                        title="Set spawn time"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Row 3: Respawn / schedule info (left) + actions (right) */}
            <div className="flex items-center justify-between gap-2">
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
              {!compact && !multiMode && (
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-900/30 border border-red-800 text-red-400 text-xs font-medium hover:bg-red-900/50 transition shrink-0"
                >
                  <Skull className="w-3 h-3" />
                  Mark Died
                </button>
              )}
            </div>
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
