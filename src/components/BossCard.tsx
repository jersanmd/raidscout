import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useServer, useHasPermission } from "@/contexts/ServerContext";
import { CountdownTimer } from "./CountdownTimer";
import { DeathRecordModal } from "./DeathRecordModal";
import { BossImage } from "./BossImage";
import { Repeat, Timer, Skull, CheckSquare, Square, Shield, Pencil, X, Calendar, Users, Star, CheckCircle, Plus } from "lucide-react";
import { useUserTimezone, formatInTimezone } from "@/hooks/useUserTimezone";
import { utcSlotToLocal } from "@/lib/scheduleTimezone";
import { useTimer } from "@/hooks/useTimer";
import { guildColor } from "@/lib/constants";
import { fetchStaticParties, assignPartyToBoss, createParty, deleteParty, addMemberToParty, removeMemberFromParty, fetchGuilds, type StaticParty } from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import { useMembers } from "@/hooks/useMembers";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import type { BossWithSpawn, Activity, Guild, Member, ScanResults } from "@/types";

interface BossCardProps {
  spawn: BossWithSpawn;
  onRecordDeath?: (bossId: string, deathTime: Date, rallyImages: File[], attendeeIds: string[], scanResults?: ScanResults | null) => void;
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
  /** Called when user records an activity end with time + attendance (same signature as onRecordDeath) */
  onRecordEnd?: (activityId: string, endTime: Date, rallyImages: File[], attendeeIds: string[], scanResults?: ScanResults | null) => void;
  /** Called when user edits an activity's next start date & time */
  onEditActivityTime?: (activityId: string, dateStr: string, timeStr: string) => void;
  /** Hide schedule/time display even when status is countdown (e.g., fixed_hours after first finish) */
  hideScheduleTime?: boolean;
}

export function BossCard({ spawn, onRecordDeath, onSetSpawnDate, onUrgentSpawn, onCriticalSpawn, onSpawned, compact = false, multiMode = false, selected = false, onToggleSelect, ownerGuildName, ownerGuildId, rotationGuilds, rotationCurrentIndex, rotationMode, onSetRotation, viewerCanEdit, viewerCanMarkDied, hasGuilds, justKilled, activity, onFinishActivity, onRecordEnd, onEditActivityTime, hideScheduleTime = false }: BossCardProps) {
  const { isViewer } = useAuth();
  const { currentServer } = useServer();
  const { timezone: tz } = useUserTimezone(currentServer?.timezone);
  const [showModal, setShowModal] = useState(false);
  const [showEditSpawnModal, setShowEditSpawnModal] = useState(false);
  const [editSpawnDate, setEditSpawnDate] = useState("");
  const [showEditTimeModal, setShowEditTimeModal] = useState(false);
  const [editDateValue, setEditDateValue] = useState("");
  const [editTimeValue, setEditTimeValue] = useState("");
  const [optimisticOwner, setOptimisticOwner] = useState<string | null>(null);
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [showCustomPartyModal, setShowCustomPartyModal] = useState(false);
  useEscapeKey(() => {
    setShowEditSpawnModal(false);
    setShowEditTimeModal(false);
    setShowPartyModal(false);
    setShowCustomPartyModal(false);
  });
  const [parties, setParties] = useState<StaticParty[]>([]);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  // New party creation state (matches MembersView)
  const [newPartyGuildFilter, setNewPartyGuildFilter] = useState<string>("");
  const [newPartySize, setNewPartySize] = useState<number>(5);
  const [newPartyBoxes, setNewPartyBoxes] = useState<string[][]>([]);
  const [newPartyUnassignedSearch, setNewPartyUnassignedSearch] = useState("");
  const [creatingParties, setCreatingParties] = useState(false);
  const [showAllStatic, setShowAllStatic] = useState(false);
  const serverId = useServerId();
  const { data: members = [] } = useMembers();

  // Clear optimistic override once the parent prop catches up
  useEffect(() => {
    if (optimisticOwner && ownerGuildName === optimisticOwner) {
      setOptimisticOwner(null);
    }
  }, [ownerGuildName, optimisticOwner]);

  // Load parties on mount
  useEffect(() => {
    if (serverId) {
      fetchStaticParties(serverId).then(setParties).catch(() => setParties([]));
    }
  }, [serverId]);

  // Load guilds on mount
  useEffect(() => {
    if (serverId) {
      fetchGuilds(serverId).then(setGuilds).catch(() => setGuilds([]));
    }
  }, [serverId]);

  const canSetSpawn = useHasPermission("can_manage_spawns");
  const canRecordDeath = useHasPermission("can_record_death");
  const canRotateGuilds = useHasPermission("can_manage_spawns");

  const isActivity = !!activity;
  const displayOwner = optimisticOwner ?? ownerGuildName;
  const { boss, status, nextSpawn } = spawn;
  const canEdit = !isActivity && (viewerCanEdit || (!isViewer && canSetSpawn)) && currentServer && !!onSetSpawnDate && (
    boss.spawn_type === "fixed_hours" && status !== "alive"
  );
  const canMarkDied = viewerCanMarkDied || (!isViewer && canRecordDeath);

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
      badge: "text-emerald-400 border-emerald-500/30",
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
  const isUrgent = !timer.isPast && timer.totalSeconds > 0 && timer.totalSeconds <= 300;
  const isWarning = !timer.isPast && timer.totalSeconds > 300 && timer.totalSeconds <= 3600;

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
        className={`relative rounded-xl border ${config.border} ${config.accentBorder} border-l-2 ${config.bg} p-3 sm:p-4 transition-all duration-300 ${config.glow} backdrop-blur-sm ${displayStatus === "alive" ? "boss-card-alive" : ""} ${isUrgent ? "boss-card-urgent" : isWarning ? "boss-card-warning" : ""} ${
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
        <div className="flex gap-3 sm:gap-4 relative z-[1]">
          {/* Boss image / Activity image or icon */}
          {isActivity ? (
            activity.image_url ? (
              <img
                src={activity.image_url}
                alt={activity.name}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover border border-[#27272a] shrink-0"
              />
            ) : (
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#09090b] border border-[#27272a] flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-[#a1a1aa]" />
            </div>
            )
          ) : (
            boss.image_url ? (
              <img
                src={boss.image_url}
                alt={boss.name}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover border border-[#27272a] shrink-0"
              />
            ) : (
            <BossImage bossName={boss.name} size="lg" />
            )
          )}

          {/* Right side: all info */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Row 1: name + type icon + guild badge + status badge */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h3 className={`font-bold truncate text-xs sm:text-sm tracking-wide ${displayStatus === "alive" ? "boss-name-alive text-emerald-300" : isUrgent ? "boss-name-alive text-red-400" : isWarning ? "boss-name-alive text-amber-400" : "text-[#fafafa]"}`}>
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
              {displayOwner && (() => { const c = guildColor(displayOwner); return (
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
                ) : status === "alive" ? (
                  <div className="text-[11px] text-emerald-400 font-semibold">● Running now</div>
                ) : null}
                {status !== "alive" && !hideScheduleTime && (
                  <>
                {Array.isArray(activity.schedule) && activity.schedule.length > 0 ? (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[#71717a] font-mono uppercase tracking-wider">SCHEDULE</span>
                    <span className="text-[#a1a1aa] font-mono">
                      {activity.schedule
                        .map((s) => {
                          const local = utcSlotToLocal(s.day, s.time, tz);
                          return `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][local.day]} ${local.time}`;
                        })
                        .join("  ·  ")}
                    </span>
                  </div>
                ) : typeof activity.schedule === "object" && activity.schedule !== null && !Array.isArray(activity.schedule) && "time" in activity.schedule ? (
                  /* New format: {time: "HH:MM", start_date: "YYYY-MM-DD"} */
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[#71717a] font-mono uppercase tracking-wider">TIME</span>
                    <span className="text-[#a1a1aa] font-mono">{(activity.schedule as any).time}</span>
                    {(activity.schedule as any).start_date && (
                      <span className="text-[#a1a1aa] font-mono">{(activity.schedule as any).start_date}</span>
                    )}
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
                </>
                )}
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
                      <span className={`font-mono uppercase tracking-wider ${status === "alive" ? "text-emerald-400" : "text-[#71717a]"}`}>
                        {isActivity ? (status === "alive" ? "ACTIVE" : "STARTING") : (status === "alive" ? "SPAWN" : "SPAWNING")}
                      </span>
                      <span className="text-[#a1a1aa] font-mono">{formatDateTime(nextSpawn)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[#71717a] font-mono">{isActivity ? "Set start time" : "Set spawn time to start timer"}</span>
                  </div>
                )}

                {/* Row 3: Respawn / schedule info */}
                {(boss.respawn_hours || boss.schedule) && (
                <div className="flex items-center gap-2 text-[10px] text-[#52525b] font-mono">
                  {boss.respawn_hours && <span>+{boss.respawn_hours}h respawn</span>}
                  {boss.schedule && (() => {
                    // Fixed-hours bosses have { time, start_date, utc_start } — skip schedule display
                    if (!Array.isArray(boss.schedule)) return null;
                    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
                    return (
                    <span>
                      {boss.schedule
                        .map((s) => {
                          const [h, m] = s.time.split(":").map(Number);
                          const local = new Date(Date.UTC(2026, 0, 1, h, m))
                            .toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true });
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
            {onEditActivityTime && displayStatus !== "alive" && (!isViewer || viewerCanEdit) && (
              <button
                onClick={() => {
                  // Default to the current next start time (in user's timezone)
                  const defaultDate = nextSpawn ?? new Date();
                  const dateStr = defaultDate.toLocaleDateString('en-CA', { timeZone: tz });
                  const timeStr = defaultDate.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
                  setEditTimeValue(timeStr);
                  setEditDateValue(dateStr);
                  setShowEditTimeModal(true);
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[#fafafa] text-[11px] font-medium hover:bg-[#27272a] active:scale-95 transition-all duration-200 whitespace-nowrap"
              >
                <Pencil className="w-3 h-3" />
                Edit Time
              </button>
            )}
            {onFinishActivity && (!isViewer || viewerCanMarkDied) && (
            <button
              onClick={() => setShowModal(true)}
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
            {canEdit && status !== "unknown" && (
              <button
                onClick={() => {
                  const d = nextSpawn || new Date();
                  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                  setEditSpawnDate(local);
                  setShowEditSpawnModal(true);
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[#fafafa] text-[11px] font-medium hover:bg-[#27272a] active:scale-95 transition-all duration-200 whitespace-nowrap"
              >
                <Pencil className="w-3 h-3" />
                Edit Spawn
              </button>
            )}
            {canMarkDied && status !== "unknown" && (
            <>
            {/* Party assign button */}
            <div className="relative">
              <button
                onClick={() => { setShowPartyModal(true); setShowAllStatic(false); }}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium active:scale-95 transition-all duration-200 whitespace-nowrap ${parties.some(p => p.boss_id === boss.id) ? "bg-emerald-900/20 border-emerald-800/50 text-emerald-400" : "bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa]"}`}
              >
                {parties.some(p => p.boss_id === boss.id) ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <Users className="w-3 h-3" />
                )}
                Party
              </button>
            </div>
            </>
            )}
            {canMarkDied && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[#fafafa] text-[11px] font-medium hover:bg-[#27272a] active:scale-95 transition-all duration-200 whitespace-nowrap"
            >
              <Skull className="w-3 h-3" />
              Mark Dead
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

      {showModal && (
        <DeathRecordModal
          boss={boss}
          isActivity={isActivity}
          activityName={activity?.name}
          ownerGuildId={ownerGuildId}
          onClose={() => setShowModal(false)}
          onSubmit={(dt, imgs, ids, _partyLeaders, scanResults) => {
            if (isActivity && onRecordEnd) {
              onRecordEnd(activity!.id, dt, imgs, ids, scanResults);
            } else if (onRecordDeath) {
              onRecordDeath(boss.id, dt, imgs, ids, scanResults);
            }
            setShowModal(false);
          }}
        />
      )}

      {/* Create Party Builder Modal — drag & drop, mirrors MembersView parties tab */}
      {showCustomPartyModal && (() => {
        // Filtered unassigned members
        const filteredMembers = members.filter(m => {
          if (newPartyGuildFilter && m.guild_id !== newPartyGuildFilter) return false;
          return !newPartyBoxes.some(box => box.includes(m.id));
        });
        const searchedMembers = filteredMembers.filter(m =>
          !newPartyUnassignedSearch || m.name.toLowerCase().includes(newPartyUnassignedSearch.toLowerCase())
        );

        const handleGenerateBoxes = () => {
          const filtered = members.filter(m => !newPartyGuildFilter || m.guild_id === newPartyGuildFilter);
          const count = Math.max(1, Math.ceil(filtered.length / Math.max(1, newPartySize)));
          setNewPartyBoxes(Array.from({ length: count }, () => []));
        };

        const handleDropInSlot = (boxIndex: number, slotIndex: number, memberId: string) => {
          setNewPartyBoxes(prev => {
            const boxes = [...prev];
            const cleaned = boxes.map(box => box.filter(id => id !== memberId));
            const target = [...(cleaned[boxIndex] ?? [])];
            target.splice(slotIndex, 0, memberId);
            cleaned[boxIndex] = target.slice(0, newPartySize);
            return cleaned;
          });
        };

        const handleDropUnassigned = (memberId: string) => {
          setNewPartyBoxes(prev => prev.map(box => box.filter(id => id !== memberId)));
        };

        const handleAutoAssign = (memberId: string) => {
          setNewPartyBoxes(prev => {
            const boxes = [...prev];
            for (let i = 0; i < boxes.length; i++) {
              if (boxes[i].length < newPartySize && !boxes[i].includes(memberId)) {
                const next = boxes.map(box => box.filter(id => id !== memberId));
                next[i] = [...next[i], memberId];
                return next;
              }
            }
            return prev;
          });
        };

        const handleSaveParties = async () => {
          setCreatingParties(true);
          try {
            for (let i = 0; i < newPartyBoxes.length; i++) {
              const box = newPartyBoxes[i];
              if (box.length === 0) continue;
              const guildId = newPartyGuildFilter || null;
              const partyId = await createParty(`Party ${i + 1}`, guildId, boss.id);
              for (const memberId of box) {
                await addMemberToParty(partyId, memberId).catch(() => {});
              }
            }
            // Refresh parties list
            if (serverId) {
              const updated = await fetchStaticParties(serverId);
              setParties(updated);
            }
            setShowCustomPartyModal(false);
            setNewPartyBoxes([]);
          } catch (err) { console.error("[BossCard] custom party save failed:", err); }
          setCreatingParties(false);
        };

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowCustomPartyModal(false); setNewPartyBoxes([]); }} />
          <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#27272a] shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-[#fafafa]">Create Parties for {boss.name}</h3>
                <p className="text-[11px] text-[#71717a]">Drag members into party boxes, then save to assign</p>
              </div>
              <button onClick={() => { setShowCustomPartyModal(false); setNewPartyBoxes([]); }} className="p-1.5 rounded-lg text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[#27272a] shrink-0">
              {guilds.length > 0 && (
                <select value={newPartyGuildFilter} onChange={(e) => { setNewPartyGuildFilter(e.target.value); setNewPartyBoxes([]); }}
                  className="px-2 py-1.5 bg-[#09090b] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa] outline-none focus:border-[#52525b]">
                  <option value="">All guilds</option>
                  {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              <label className="flex items-center gap-1.5 text-xs text-[#a1a1aa]">
                Party size:
                <input type="number" value={newPartySize} onChange={(e) => setNewPartySize(Math.max(1, Number(e.target.value) || 1))}
                  min={1} className="w-16 px-2 py-1.5 bg-[#09090b] border border-[#27272a] rounded-lg text-[#fafafa] text-xs text-center focus:outline-none focus:border-[#52525b]" />
              </label>
              <button onClick={handleGenerateBoxes}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition">
                Generate Boxes
              </button>
              {newPartyBoxes.length > 0 && (
                <button onClick={handleSaveParties} disabled={creatingParties}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#22c55e] text-[#09090b] hover:bg-[#16a34a] disabled:opacity-50 transition ml-auto">
                  {creatingParties ? "Saving…" : `Save & Assign to ${boss.name}`}
                </button>
              )}
            </div>

            {/* Body: drag & drop area */}
            <div className="flex-1 overflow-y-auto p-4">
              {newPartyBoxes.length === 0 ? (
                <p className="text-xs text-[#52525b] text-center py-12">
                  Select a guild (optional), set party size, then click "Generate Boxes" to start.
                </p>
              ) : (
                <div className="flex gap-4 h-full">
                  {/* Left: Unassigned */}
                  <div className="w-56 shrink-0 rounded-lg border border-dashed border-[#3f3f46] bg-[#09090b]/50 p-2 space-y-1 self-start"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); const mid = e.dataTransfer.getData("text/plain"); if (mid) handleDropUnassigned(mid); }}>
                    <p className="text-[10px] text-[#52525b] uppercase tracking-wider px-2 py-1">Unassigned ({filteredMembers.length})</p>
                    <div className="px-1">
                      <input type="text" value={newPartyUnassignedSearch} onChange={(e) => setNewPartyUnassignedSearch(e.target.value)}
                        placeholder="Search..." className="w-full px-2 py-1 bg-[#09090b] border border-[#27272a] rounded text-[10px] text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]" />
                    </div>
                    {searchedMembers.length === 0 ? (
                      <p className="text-[10px] text-[#3f3f46] text-center py-4">All members placed</p>
                    ) : (
                      searchedMembers.map(m => {
                        const g = guilds.find(g => g.id === m.guild_id);
                        const c = g ? guildColor(g.name) : null;
                        return (
                          <div key={m.id} draggable
                            onDragStart={(e) => { e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "move"; }}
                            onDoubleClick={() => handleAutoAssign(m.id)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#18181b] border border-[#27272a] text-xs text-[#d4d4d8] cursor-grab active:cursor-grabbing hover:border-[#52525b] transition">
                            <span className="w-5 h-5 rounded bg-[#09090b] flex items-center justify-center text-[10px] text-[#71717a] font-bold shrink-0">{m.name.charAt(0)}</span>
                            <span className="truncate flex-1">{m.name}</span>
                            {g && c && (
                              <span className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border ${c.bg} ${c.text} ${c.border}`}>
                                <Shield className="w-2.5 h-2.5" />{g.name}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Right: Party boxes */}
                  <div className="flex-1 flex flex-wrap gap-2 items-start content-start">
                    {newPartyBoxes.map((box, i) => {
                      const boxMembers = box.map(id => members.find(m => m.id === id)).filter(Boolean) as Member[];
                      const slots: (Member | null)[] = Array.from({ length: newPartySize }, (_, s) => boxMembers[s] ?? null);
                      return (
                        <div key={i} className="w-[180px] shrink-0 rounded-lg border border-[#27272a] bg-[#18181b]/30 p-2 space-y-0.5">
                          <p className="text-[10px] text-[#52525b] uppercase tracking-wider px-1 flex items-center justify-between">
                            <span>Party {i + 1} <span className="text-[#3f3f46]">({box.length}/{newPartySize})</span></span>
                            {box.length > 0 && (
                              <button onClick={() => setNewPartyBoxes(prev => { const b = [...prev]; b[i] = []; return b; })}
                                className="text-[#52525b] hover:text-[#f87171] transition" title="Clear">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </p>
                          {slots.map((m, s) =>
                            m ? (() => {
                              const g = guilds.find(g => g.id === m.guild_id);
                              const c = g ? guildColor(g.name) : null;
                              return (
                                <div key={m.id} draggable
                                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "move"; }}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const mid = e.dataTransfer.getData("text/plain"); if (mid) handleDropInSlot(i, s, mid); }}
                                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#09090b] border border-[#27272a] text-xs text-[#d4d4d8] group cursor-grab active:cursor-grabbing">
                                  <span className="w-4 h-4 rounded bg-[#18181b] flex items-center justify-center text-[9px] text-[#71717a] font-bold shrink-0">{m.name.charAt(0)}</span>
                                  <span className="truncate flex-1">{m.name}</span>
                                  {g && c && (
                                    <span className={`shrink-0 inline-flex items-center gap-0.5 px-1 py-0 rounded text-[8px] border ${c.bg} ${c.text} ${c.border}`}>
                                      <Shield className="w-2 h-2" />{g.name}
                                    </span>
                                  )}
                                  <button onClick={() => setNewPartyBoxes(prev => { const b = [...prev]; b[i] = b[i].filter(id => id !== m.id); return b; })}
                                    className="opacity-0 group-hover:opacity-100 text-[#52525b] hover:text-[#f87171] transition">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })() : (
                              <div key={`empty-${s}`}
                                className="flex items-center justify-center px-2 py-2 rounded border border-dashed border-[#3f3f46] text-[11px] text-[#52525b] min-h-[28px]"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => { e.preventDefault(); const mid = e.dataTransfer.getData("text/plain"); if (mid) handleDropInSlot(i, s, mid); }}>
                                <span className="text-[#27272a]">Drop slot</span>
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

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
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition"
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
              Set the next start date &amp; time for <span className="text-[#fafafa] font-medium">{activity.name}</span>
            </p>
            <div className="flex gap-2 mb-4">
              <input
                type="date"
                value={editDateValue}
                onChange={(e) => setEditDateValue(e.target.value)}
                min={new Date().toLocaleDateString('en-CA', { timeZone: tz })}
                className="flex-1 bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2.5 text-sm text-[#fafafa] outline-none focus:border-[#52525b] focus:ring-1 focus:ring-[#27272a] transition-all duration-200 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:!invert [&::-webkit-calendar-picker-indicator]:brightness-0"
                autoFocus
              />
              <input
                type="time"
                value={editTimeValue}
                onChange={(e) => setEditTimeValue(e.target.value)}
                min={editDateValue === new Date().toLocaleDateString('en-CA', { timeZone: tz }) ? new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }) : undefined}
                className="flex-1 bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2.5 text-sm text-[#fafafa] outline-none focus:border-[#52525b] focus:ring-1 focus:ring-[#27272a] transition-all duration-200 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:!invert [&::-webkit-calendar-picker-indicator]:brightness-0"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowEditTimeModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editDateValue && editTimeValue) {
                    onEditActivityTime(activity.id, editDateValue, editTimeValue);
                  }
                  setShowEditTimeModal(false);
                }}
                disabled={!editDateValue || !editTimeValue}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Party Assignment Modal */}
      {showPartyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowPartyModal(false)} />
          <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#27272a] shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-[#fafafa]">Party Assignment</h3>
                <p className="text-[11px] text-[#71717a]">{boss.name}</p>
              </div>
              <button onClick={() => setShowPartyModal(false)} className="p-1.5 rounded-lg text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Party list */}
            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                const linked = parties.filter(p => p.boss_id === boss.id);
                const nonEmpty = parties.filter(p => p.member_ids.length > 0);

                // If this boss has custom parties AND user hasn't toggled to show all
                if (linked.length > 0 && !showAllStatic) {
                  const renderParty = (party: StaticParty) => {
                    const partyMembers = party.member_ids.map(id => members.find(m => m.id === id)).filter(Boolean) as Member[];
                    const g = party.guild_name ? { name: party.guild_name } : null;
                    const c = g ? guildColor(g.name) : null;
                    return (
                      <div key={party.id} className="rounded-lg border border-emerald-800/50 bg-emerald-900/10 p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span className="text-[11px] font-medium text-[#fafafa] truncate">{party.name}</span>
                            {g && c && (
                              <span className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border ${c.bg} ${c.text} ${c.border}`}>
                                <Shield className="w-2.5 h-2.5" />{g.name}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-[#52525b] shrink-0 ml-1">{partyMembers.length}</span>
                        </div>
                        {partyMembers.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {partyMembers.map(m => (
                              <span key={m.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#18181b] border border-[#27272a] text-[10px] text-[#d4d4d8]">
                                <span className="w-3.5 h-3.5 rounded bg-[#09090b] flex items-center justify-center text-[9px] text-[#71717a] font-bold">{m.name.charAt(0)}</span>
                                {m.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-[#3f3f46] mb-1.5">Empty party</p>
                        )}
                        <button
                          onClick={async () => {
                            const { unlinkParty } = await import("@/lib/supabase");
                            await unlinkParty(party.id).catch(() => {});
                            setParties(prev => prev.map(p => p.id === party.id ? { ...p, boss_id: null } : p));
                          }}
                          className="w-full text-center px-2 py-1 text-[10px] text-[#71717a] hover:text-[#f87171] rounded hover:bg-[#27272a] transition">
                          Unlink from {boss.name}
                        </button>
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-2">
                      <p className="text-[10px] text-[#71717a] uppercase tracking-wider">
                        Custom parties for {boss.name} ({linked.length})
                      </p>
                      {linked.map(renderParty)}
                      <button
                        onClick={() => setShowAllStatic(true)}
                        className="w-full mt-3 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[#3f3f46] text-[11px] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#52525b] hover:bg-[#27272a] transition">
                        <Shield className="w-3 h-3" />
                        View all static parties
                      </button>
                    </div>
                  );
                }

                // Show static party list (or reset toggle when modal reopens)
                // Reset toggle when no linked parties
                if (linked.length === 0 && showAllStatic) {
                  // This will be caught on next render
                }

                if (nonEmpty.length === 0) {
                  return (
                    <div className="space-y-3">
                      <p className="text-xs text-[#52525b] text-center py-8">
                        No parties yet. Create one in the Members → Parties tab.
                      </p>
                      {linked.length > 0 && (
                        <button onClick={() => setShowAllStatic(false)}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[#3f3f46] text-[11px] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#52525b] hover:bg-[#27272a] transition">
                          Back to custom parties
                        </button>
                      )}
                    </div>
                  );
                }

                // Group by guild_name
                const grouped: Record<string, StaticParty[]> = {};
                for (const p of nonEmpty) {
                  const key = p.guild_name || "Other";
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(p);
                }
                const guildKeys = Object.keys(grouped);

                const renderStaticParty = (party: StaticParty) => {
                  const isLinked = party.boss_id === boss.id;
                  const partyMembers = party.member_ids.map(id => members.find(m => m.id === id)).filter(Boolean) as Member[];
                  const g = party.guild_name ? { name: party.guild_name } : null;
                  const c = g ? guildColor(g.name) : null;
                  return (
                    <div key={party.id} className={`rounded-lg border p-2.5 transition ${isLinked ? "border-emerald-800/50 bg-emerald-900/10" : "border-[#27272a] bg-[#09090b]/50"}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isLinked && <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />}
                          <span className="text-[11px] font-medium text-[#fafafa] truncate">{party.name}</span>
                        </div>
                        <span className="text-[10px] text-[#52525b] shrink-0 ml-1">{partyMembers.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {partyMembers.map(m => (
                          <span key={m.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#18181b] border border-[#27272a] text-[10px] text-[#d4d4d8]">
                            <span className="w-3.5 h-3.5 rounded bg-[#09090b] flex items-center justify-center text-[9px] text-[#71717a] font-bold">{m.name.charAt(0)}</span>
                            {m.name}
                          </span>
                        ))}
                      </div>
                      {isLinked ? (
                        <button
                          onClick={async () => {
                            const { unlinkParty } = await import("@/lib/supabase");
                            await unlinkParty(party.id).catch(() => {});
                            setParties(prev => prev.map(p => p.id === party.id ? { ...p, boss_id: null } : p));
                          }}
                          className="w-full text-center px-2 py-1 text-[10px] text-[#71717a] hover:text-[#f87171] rounded hover:bg-[#27272a] transition">Unlink</button>
                      ) : (
                        <button
                          onClick={async () => {
                            if (!serverId) return;
                            await assignPartyToBoss(party.id, boss.id).catch(() => {});
                            setParties(prev => prev.map(p => p.id === party.id ? { ...p, boss_id: boss.id, boss_name: boss.name } : p));
                          }}
                          className="w-full text-center px-2 py-1.5 rounded text-[10px] font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition">Assign to {boss.name}</button>
                      )}
                    </div>
                  );
                };

                return (
                  <div className="space-y-3">
                    {linked.length > 0 && (
                      <button onClick={() => setShowAllStatic(false)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[#3f3f46] text-[11px] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#52525b] hover:bg-[#27272a] transition">
                        Back to custom parties
                      </button>
                    )}
                    <div className={guildKeys.length > 1 ? "grid grid-cols-2 gap-3" : "space-y-2"}>
                      {guildKeys.map(guildName => {
                        const col = guildColor(guildName);
                        const guildParties = grouped[guildName];
                        return (
                          <div key={guildName} className="space-y-2">
                            <div className="flex items-center gap-1.5 pb-1.5 border-b border-[#27272a]">
                              {guildName !== "Other" && col && (
                                <span className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border ${col.bg} ${col.text} ${col.border}`}>
                                  <Shield className="w-2.5 h-2.5" />{guildName}
                                </span>
                              )}
                              {guildName === "Other" && (
                                <span className="text-[10px] text-[#52525b] uppercase tracking-wider">Other</span>
                              )}
                              <span className="text-[10px] text-[#3f3f46]">{guildParties.length} {guildParties.length === 1 ? "party" : "parties"}</span>
                            </div>
                            {guildParties.map(renderStaticParty)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-[#27272a] shrink-0">
              <button
                onClick={() => { setShowPartyModal(false); setShowCustomPartyModal(true); }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[#3f3f46] text-[11px] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#52525b] hover:bg-[#27272a] transition"
              >
                <Plus className="w-3 h-3" />
                Create custom party
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
