import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useServer, useHasPermission } from "@/contexts/ServerContext";
import { CountdownTimer } from "./CountdownTimer";
import { DeathRecordModal } from "./DeathRecordModal";
import { BossImage } from "./BossImage";
import { Repeat, Timer, Skull, CheckSquare, Square, Shield, Pencil, X, Calendar, Users, Star, CheckCircle } from "lucide-react";
import { useUserTimezone, formatInTimezone } from "@/hooks/useUserTimezone";
import { useTimer } from "@/hooks/useTimer";
import { guildColor } from "@/lib/constants";
import type { BossWithSpawn, Activity } from "@/types";

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
  ownerGuildId?: string | null;
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
  /** Render as an activity card instead of a boss card */
  activity?: Activity;
  /** Called when user clicks "Finish" on an activity */
  onFinishActivity?: (activityId: string) => void;
  /** Called when user edits an activity's time */
  onEditActivityTime?: (activityId: string, timeStr: string) => void;
}

export function BossCard({ spawn, onRecordDeath, onSetSpawnDate, onUrgentSpawn, onCriticalSpawn, onSpawned, compact = false, multiMode = false, selected = false, onToggleSelect, ownerGuildName, ownerGuildId, rotationGuilds, rotationCurrentIndex, rotationMode, onSetRotation, viewerCanEdit, viewerCanMarkDied, hasGuilds, justKilled, activity, onFinishActivity, onEditActivityTime }: BossCardProps) {
  const { isViewer } = useAuth();
  const { currentServer } = useServer();
  const { timezone: tz } = useUserTimezone();
  const [showModal, setShowModal] = useState(false);
  const [showEditSpawnModal, setShowEditSpawnModal] = useState(false);
  const [editSpawnDate, setEditSpawnDate] = useState("");
  const [showEditTimeModal, setShowEditTimeModal] = useState(false);
  const [editTimeValue, setEditTimeValue] = useState("");
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

  const isActivity = !!activity;
  const displayOwner = optimisticOwner ?? ownerGuildName;
  const { boss, status, nextSpawn } = spawn;
  const canEdit = !isActivity && (viewerCanEdit || (!isViewer && canSetSpawn)) && currentServer && !!onSetSpawnDate && (
    boss.spawn_type === "fixed_hours"
  );
  const canMarkDied = !isActivity && (viewerCanMarkDied || (!isViewer && canRecordDeath));

  const statusConfigMap = {
    unknown: {
      bg: "bg-[#18181b]",
      border: "border-[#27272a]",
      accentBorder: "border-l-[#27272a]",
      badge: "text-[#71717a]",
      badgeText: "Unknown",
      dot: "bg-[#a1a1aa]",
      header: "text-[#fafafa]",
      glow: "",
    },
    alive: {
      bg: "bg-[#18181b]",
      border: "border-[#27272a]",
      accentBorder: "border-l-[#27272a]",
      badge: "text-[#71717a]",
      badgeText: "Alive",
      dot: "bg-emerald-500",
      header: "text-[#fafafa]",
      glow: "",
    },
    countdown: {
      bg: "bg-[#18181b]",
      border: "border-[#27272a]",
      accentBorder: "border-l-[#27272a]",
      badge: "text-[#71717a]",
      badgeText: "Timer",
      dot: "bg-amber-500",
      header: "text-[#fafafa]",
      glow: "",
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
        onClick={() => multiMode && !isActivity && onToggleSelect?.(boss.id)}
        className={`relative rounded-xl border ${config.border} ${config.accentBorder} border-l-2 ${config.bg} p-4 transition-all duration-300 ${config.glow} backdrop-blur-sm ${
          justKilled && !isActivity ? "animate-[fadeOut_0.4s_ease-out] scale-95 opacity-0" : ""
        } ${
          multiMode && !isActivity ? "cursor-pointer" : ""
        } hover:border-[#52525b] hover:-translate-y-0.5 ${
          selected && !isActivity ? "ring-1 ring-[#52525b] border-[#52525b]" : ""
        }`}
      >
        
        {multiMode && !isActivity && (
          <div className="absolute top-3 right-3 z-10">
            {selected ? (
              <CheckSquare className="w-5 h-5 text-[#a1a1aa] " />
            ) : (
              <Square className="w-5 h-5 text-[#3f3f46]" />
            )}
          </div>
        )}
        <div className="flex gap-4 relative z-[1]">
          {/* Boss image / Activity image or icon */}
          {isActivity ? (
            activity.image_url ? (
              <img
                src={activity.image_url}
                alt={activity.name}
                className="w-14 h-14 rounded-xl object-cover border border-[#27272a] shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-[#09090b] border border-[#27272a] flex items-center justify-center shrink-0">
                <Calendar className="w-6 h-6 text-[#a1a1aa]" />
            </div>
            )
          ) : (
            <BossImage bossName={boss.name} size="lg" />
          )}

          {/* Right side: all info */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Row 1: name + type icon + guild badge + status badge */}
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[#fafafa] truncate text-sm tracking-wide">
                {isActivity ? activity.name : boss.name}
              </h3>
              {isActivity ? (
                activity.schedule_type === "fixed_hours" ? (
                  <span title="Fixed hours"><Timer className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0" /></span>
                ) : activity.schedule_type === "fixed_schedule" ? (
                  <span title="Fixed schedule"><Calendar className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0" /></span>
                ) : (
                  <span title="One time"><Calendar className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0" /></span>
                )
              ) : boss.spawn_type === "fixed_schedule" ? (
                <span title="Fixed schedule"><Repeat className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0" /></span>
              ) : (
                <span title="Fixed hours"><Timer className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0" /></span>
              )}
              {displayOwner && !isActivity && (() => { const c = guildColor(displayOwner); return (
                <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
                  <Shield className="w-3 h-3" />
                  {displayOwner}
                </span>
              ); })()}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 tracking-wider ${config.badge}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${config.dot}`} />
                {isActivity ? "Activity" : config.badgeText}
              </span>
              {isActivity && (activity as any).category && (
                <span className="text-[10px] text-[#52525b] font-mono truncate max-w-[120px]">{(activity as any).category}</span>
              )}
            </div>

            {/* Row 2: Activity schedule info / Boss countdown */}
            {isActivity ? (
              <div className="space-y-1">
                {nextSpawn && status === "countdown" ? (
                  <div className="space-y-1">
                    {!compact && (
                      <div className="flex items-baseline gap-2">
                        <CountdownTimer target={nextSpawn} bossName={activity.name} onUrgent={onUrgentSpawn} onCritical={onCriticalSpawn} onSpawned={onSpawned} />
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-[#71717a] font-mono uppercase tracking-wider">NEXT</span>
                      <span className="text-[#a1a1aa] font-mono">{formatDateTime(nextSpawn)}</span>
                    </div>
                  </div>
                ) : null}
                {Array.isArray(activity.schedule) && activity.schedule.length > 0 ? (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[#71717a] font-mono uppercase tracking-wider">SCHEDULE</span>
                    <span className="text-[#a1a1aa] font-mono">
                      {activity.schedule
                        .map((s) => `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][s.day]} ${s.time}`)
                        .join("  ·  ")}
                    </span>
                  </div>
                ) : typeof activity.schedule === "string" && activity.schedule ? (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[#71717a] font-mono uppercase tracking-wider">TIME</span>
                    <span className="text-[#a1a1aa] font-mono">{activity.schedule}</span>
                  </div>
                ) : !nextSpawn ? (
                  activity.schedule_type === "fixed_hours" ? (
                    <div className="text-[11px] text-[#a1a1aa] font-mono">Fixed Hours</div>
                  ) : activity.schedule_type === "fixed_schedule" ? (
                    <div className="text-[11px] text-[#a1a1aa] font-mono">Fixed Schedule</div>
                  ) : (
                    <div className="text-[11px] text-[#a1a1aa] font-mono">One Time</div>
                  )
                ) : null}
                {/* Party size + points */}
                <div className="flex items-center gap-2 text-[10px] text-[#52525b] font-mono">
                  {activity.party_size && (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {activity.party_size}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {activity.points_per_participant}pt
                  </span>
                </div>
              </div>
            ) : (
              <>
                {isCompleted ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[#71717a] font-medium">Completed</span>
                    <span className="text-[#3f3f46]">—</span>
                    <span className="text-[#a1a1aa] font-mono">Killed {formatDateTime(new Date(spawn.deathRecord!.death_time))}</span>
                  </div>
                ) : nextSpawn ? (
                  <div className="space-y-1">
                    {!compact && (
                      <div className="flex items-baseline gap-2">
                        <CountdownTimer target={nextSpawn} bossName={boss.name} onUrgent={onUrgentSpawn} onCritical={onCriticalSpawn} onSpawned={onSpawned} />
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-[#71717a] font-mono uppercase tracking-wider">
                        {status === "alive" ? "SPAWN" : "SPAWNING"}
                      </span>
                      <span className="text-[#a1a1aa] font-mono">{formatDateTime(nextSpawn)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[#71717a] font-mono">Set spawn time to start timer</span>
                  </div>
                )}

                {/* Row 3: Respawn / schedule info */}
                {(boss.respawn_hours || boss.schedule) && (
                <div className="flex items-center gap-2 text-[10px] text-[#52525b] font-mono">
                  {boss.respawn_hours && <span>+{boss.respawn_hours}h respawn</span>}
                  {boss.schedule && (() => {
                    const tzName = currentServer?.timezone || "UTC";
                    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
                    return (
                    <span>
                      {boss.schedule
                        .map((s) => {
                          const [h, m] = s.time.split(":").map(Number);
                          const local = new Date(Date.UTC(2026, 0, 1, h, m))
                            .toLocaleTimeString("en-US", { timeZone: tzName, hour: "2-digit", minute: "2-digit", hour12: true });
                          return `${days[s.day]} ${local}`;
                        })
                        .join("  ·  ")}
                    </span>
                    );
                  })()}
                </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Bottom action buttons — activities */}
        {!compact && !multiMode && isActivity && (onFinishActivity || onEditActivityTime) && (
          <div className="flex items-center justify-end gap-1.5 mt-3 pt-3 border-t border-white/[0.05] relative z-[1]">
            {onEditActivityTime && (
              <button
                onClick={() => {
                  const currentTime = typeof activity.schedule === "string" ? activity.schedule : "00:00";
                  setEditTimeValue(currentTime);
                  setShowEditTimeModal(true);
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#27272a] border border-[#27272a] text-[#a1a1aa] text-[11px] font-semibold hover:bg-[#3f3f46] active:scale-95 transition-all duration-200 whitespace-nowrap"
              >
                <Pencil className="w-3 h-3" />
                Edit Time
              </button>
            )}
            {onFinishActivity && (
            <button
              onClick={() => onFinishActivity(activity.id)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[#fafafa] text-[11px] font-medium hover:bg-[#27272a] active:scale-95 transition-all duration-200 whitespace-nowrap"
            >
              <CheckCircle className="w-3 h-3" />
              Finish
            </button>
            )}
          </div>
        )}

        {/* Bottom action buttons — bosses only */}
        {!compact && !multiMode && !isActivity && (canEdit || canMarkDied) && (
          <div className="flex items-center justify-end gap-1.5 mt-3 pt-3 border-t border-white/[0.05] relative z-[1]">
            {canEdit && (
              <button
                onClick={() => {
                  const d = nextSpawn || new Date();
                  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                  setEditSpawnDate(local);
                  setShowEditSpawnModal(true);
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#27272a] border border-[#27272a] text-[#a1a1aa] text-[11px] font-semibold hover:bg-[#3f3f46] active:scale-95 transition-all duration-200 whitespace-nowrap"
              >
                <Pencil className="w-3 h-3" />
                Edit Spawn
              </button>
            )}
            {canMarkDied && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[#fafafa] text-[11px] font-medium hover:bg-[#27272a] active:scale-95 transition-all duration-200 whitespace-nowrap"
            >
              <Skull className="w-3 h-3" />
              Mark Died
            </button>
            )}
          </div>
        )}

        {/* No guild assigned notice — bosses only */}
        {!compact && !multiMode && !isViewer && !isActivity && !hasGuilds && canRotateGuilds && (
          <div className="mt-2 pt-2 border-t border-white/[0.05] relative z-[1]">
            <span className="text-[10px] text-[#a1a1aa]/60 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              No guild assigned — set up in Server Settings → Boss Guilds
            </span>
          </div>
        )}

        {/* Rotation guild row — bosses only */}
        {!compact && !multiMode && !isViewer && !isActivity && rotationGuilds && rotationGuilds.length > 1 && canRotateGuilds && (
          <div className="mt-2 pt-2 border-t border-white/[0.05] relative z-[1]">
            <span className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider">
              Rotation {rotationMode ? `· ${rotationMode}` : ""}
            </span>
            <div className="flex items-center gap-1 mt-1.5">
              {rotationGuilds.map((g, i) => {
                const isCurrent = i === rotationCurrentIndex;
                return (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setOptimisticOwner(g.name); onSetRotation?.(i); }}
                    className={`flex-1 text-center px-2 py-1 rounded text-[10px] font-semibold border transition-all duration-200 hover:scale-105 active:scale-95 ${
                      isCurrent
                        ? `${g.color.bg} ${g.color.text} ${g.color.border} shadow-sm`
                        : "bg-[#18181b] border-[#27272a] text-[#52525b] hover:text-[#a1a1aa] hover:border-[#3f3f46]"
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

      {showModal && !isActivity && (
        <DeathRecordModal
          boss={boss}
          ownerGuildId={ownerGuildId}
          onClose={() => setShowModal(false)}
          onSubmit={(dt, imgs, ids) => {
            onRecordDeath(boss.id, dt, imgs, ids);
            setShowModal(false);
          }}
        />
      )}

      {showEditSpawnModal && !isActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditSpawnModal(false)} />
          <div className="relative bg-[#11161e] border border-[#27272a] rounded-xl p-6 w-full max-w-sm shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#fafafa]">Edit Spawn Time</h3>
              <button onClick={() => setShowEditSpawnModal(false)} className="p-1 rounded-md text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[#a1a1aa] mb-3">
              Set a new spawn time for <span className="text-[#fafafa] font-medium">{boss.name}</span>
            </p>
            <input
              type="datetime-local"
              value={editSpawnDate}
              onChange={(e) => setEditSpawnDate(e.target.value)}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2.5 text-sm text-[#fafafa] outline-none focus:border-[#52525b] focus:ring-1 focus:ring-[#27272a] transition-all duration-200 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowEditSpawnModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] transition"
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
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Activity Time modal */}
      {showEditTimeModal && isActivity && onEditActivityTime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditTimeModal(false)} />
          <div className="relative bg-[#11161e] border border-[#27272a] rounded-xl p-6 w-full max-w-sm shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#fafafa]">Edit Time</h3>
              <button onClick={() => setShowEditTimeModal(false)} className="p-1 rounded-md text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[#a1a1aa] mb-3">
              Set a new start time for <span className="text-[#fafafa] font-medium">{activity.name}</span>
            </p>
            <input
              type="time"
              value={editTimeValue}
              onChange={(e) => setEditTimeValue(e.target.value)}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2.5 text-sm text-[#fafafa] outline-none focus:border-[#52525b] focus:ring-1 focus:ring-[#27272a] transition-all duration-200 mb-4 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:invert"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowEditTimeModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editTimeValue) {
                    onEditActivityTime(activity.id, editTimeValue);
                  }
                  setShowEditTimeModal(false);
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] transition"
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
