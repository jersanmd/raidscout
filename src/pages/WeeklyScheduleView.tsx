import { useMemo, useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBosses } from "@/hooks/useBosses";
import { useDeathRecords } from "@/hooks/useDeathRecords";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { calculateSpawnInfo } from "@/lib/spawnCalculator";
import { DAY_NAMES_SHORT, guildColor } from "@/lib/constants";
import { ParticipantModal } from "@/components/ParticipantModal";
import { DeathRecordModal } from "@/components/DeathRecordModal";
import {
  insertDeathRecord,
  addAttendance,
  getCurrentServerId,
  notifyDiscord,
  fetchBossGuilds,
  fetchGuilds,
  editDeathTime,
  setDeathDisplayGuild,
  deleteDeathRecord,
  supabase,
  advanceBossRotation,
  uploadRallyImage,
  addRallyImageToDeath,
} from "@/lib/supabase";
import { Loader2, Users, X, Calendar } from "lucide-react";
import { SavingOverlay } from "@/components/SavingOverlay";
import { getOwnerGuildName as getOwnerGuildNameLib } from "@/lib/rotation";
import { useActivities } from "@/hooks/useActivities";
import type { WeekDaySpawns, SpawnInfo, Boss, BossGuild, Guild } from "@/types";

export function WeeklyScheduleView() {
  const { data: bosses = [], isLoading: bossesLoading, refetch: refetchBosses } = useBosses();
  const { data: deathRecords = [], isLoading: recordsLoading, refetch: refetchDeaths } = useDeathRecords();
  const { activities = [], activityInstances = [] } = useActivities();
  const { user, isViewer, viewerCanMarkDied } = useAuth();

  // Always fetch fresh data on mount so rotation adjustments from Bosses tab are reflected
  useEffect(() => {
    refetchBosses();
    refetchDeaths();
  }, []);
  const { currentServer } = useServer();
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekLoading, setWeekLoading] = useState(false);
  useEffect(() => { setWeekLoading(false); }, [weekOffset]);

  // Disable Previous Week if no death records exist before the displayed week
  // Always allow navigating back from future weeks
  const prevWeekDisabled = useMemo(() => {
    if (weekOffset > 0) return false; // future weeks: always allow going back
    const now = new Date();
    const refDate = new Date(now);
    refDate.setDate(refDate.getDate() + weekOffset * 7);
    const dayOfWeek = refDate.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(refDate);
    monday.setDate(refDate.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);
    return !deathRecords.some(dr => !dr.is_initial_spawn && new Date(dr.death_time) < monday);
  }, [deathRecords, weekOffset]);

  // Selected death for participant modal
  const [selectedDeath, setSelectedDeath] = useState<{
    deathRecordId: string;
    bossName: string;
    deathTime: string;
    ownerGuildId?: string | null;
  } | null>(null);

  // Selected boss for "Mark as Died" modal (with optional spawn time for schedule bosses)
  const [markBoss, setMarkBoss] = useState<{ boss: Boss; spawnTime?: Date } | null>(null);

  // Global saving overlay
  const [savingMessage, setSavingMessage] = useState<string | null>(null);

  // Edit death time modal
  const [editDeath, setEditDeath] = useState<{ deathRecordId: string; bossName: string; deathTime: string } | null>(null);
  const [editDeathDate, setEditDeathDate] = useState("");
  const [editDeathSaving, setEditDeathSaving] = useState(false);
  const [editToast, setEditToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Edit display guild on death record
  const [editGuildDeath, setEditGuildDeath] = useState<{ deathRecordId: string; bossName: string } | null>(null);
  const [editGuildSaving, setEditGuildSaving] = useState(false);

  const handleSetDisplayGuild = async (guildId: string | null) => {
    if (!editGuildDeath) return;
    setEditGuildSaving(true);
    try {
      // For "None" selection, we need to clear the display_owner_guild_id
      // We'll use the RPC with a special case — pass null to clear
      if (guildId) {
        await setDeathDisplayGuild(editGuildDeath.deathRecordId, guildId);
      } else {
        // Clear the override by setting to null via a raw update
        const { error } = await supabase
          .from("death_records")
          .update({ display_owner_guild_id: null })
          .eq("id", editGuildDeath.deathRecordId);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["death_records"] });
      setEditToast({ type: "success", message: "Guild updated!" });
      setEditGuildDeath(null);
    } catch (err: any) {
      setEditToast({ type: "error", message: err?.message ?? "Failed to update guild" });
    } finally {
      setEditGuildSaving(false);
    }
  };

  const handleEditDeathTime = useCallback(async () => {
    if (!editDeath || !editDeathDate) return;
    setEditDeathSaving(true);
    try {
      const [datePart, timePart] = editDeathDate.split("T");
      const [y, m, d] = datePart.split("-").map(Number);
      const [hh, mm] = timePart.split(":").map(Number);
      const newTime = new Date(y, m - 1, d, hh, mm);
      await editDeathTime(editDeath.deathRecordId, newTime);
      queryClient.invalidateQueries({ queryKey: ["death_records"] });
      setEditToast({ type: "success", message: "Death time updated!" });
      setEditDeath(null);
    } catch (err: any) {
      setEditToast({ type: "error", message: err?.message ?? "Failed to update death time" });
    } finally {
      setEditDeathSaving(false);
    }
  }, [editDeath, editDeathDate, queryClient]);

  // Guild data for ownership display
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [bossGuilds, setBossGuilds] = useState<BossGuild[]>([]);

  useEffect(() => {
    const sid = currentServer?.id;
    if (!sid) return;
    Promise.all([fetchGuilds(sid), fetchBossGuilds(sid)])
      .then(([g, bg]) => { setGuilds(g); setBossGuilds(bg); })
      .catch(() => { setGuilds([]); setBossGuilds([]); });
  }, [currentServer?.id]);

  // Build minimal SpawnInfo[] so rotation.ts can access boss data (rotation_counter, etc.)
  const spawnMap = useMemo(() => bosses.map(b => ({
    boss: b,
    nextSpawn: null as Date | null,
    status: "unknown" as const,
    deathRecord: null,
  })), [bosses]);

  const getOwnerGuildName = useCallback((bossId: string, dayOfWeek?: number): string | undefined => {
    return getOwnerGuildNameLib(bossId, bossGuilds, guilds, deathRecords, spawnMap, dayOfWeek);
  }, [bossGuilds, guilds, deathRecords, spawnMap]);

  const handleRecordDeath = useCallback(
    async (bossId: string, deathTime: Date, rallyImages: File[], attendeeIds: string[]) => {
      if (!user && !isViewer) return;
      const boss = bosses.find((b) => b.id === bossId);
      if (!boss) return;
      setSavingMessage("Recording death...");
      try {
        const ownerGuildName = getOwnerGuildName(boss.id);
        const ownerGuildId = ownerGuildName ? guilds.find(g => g.name === ownerGuildName)?.id ?? null : null;
        const record = await insertDeathRecord(bossId, deathTime, ownerGuildId);

        // Upload rally images to storage
        for (const img of rallyImages) {
          const url = await uploadRallyImage(img);
          if (url) {
            try { await addRallyImageToDeath(record.id, url); } catch {}
          }
        }

        for (const memberId of attendeeIds) {
          try { await addAttendance(record.id, memberId); } catch {}
        }

        queryClient.invalidateQueries({ queryKey: ["death_records"] });
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
        queryClient.invalidateQueries({ queryKey: ["members"] });
        queryClient.invalidateQueries({ queryKey: ["analytics"] });

        // Advance rotation counter on kill
        try { await advanceBossRotation(bossId); } catch {}

        const sid = getCurrentServerId();
        if (sid && boss) notifyDiscord(sid, "boss_died", {
          boss_name: boss.name,
          attendees: attendeeIds.length > 0 ? [`${attendeeIds.length} participant(s)`] : undefined,
          guild_name: getOwnerGuildName(boss.id) ?? undefined,
        });
      } catch (err) {
        console.error("Failed to record death:", err);
      } finally {
        setSavingMessage(null);
      }
    },
    [user, isViewer, queryClient, bosses, getOwnerGuildName, guilds]
  );

  const weekDays = useMemo(() => {
    const now = new Date();
    const deathMap = new Map([...deathRecords].reverse().map((d) => [d.boss_id, d]));
    const bossMap = new Map(bosses.map((b) => [b.id, b]));

    // Build 7 days: Monday → Sunday (offset by weekOffset)
    const refDate = new Date(now);
    refDate.setDate(refDate.getDate() + weekOffset * 7);
    const monday = new Date(refDate);
    const dayOfWeek = refDate.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(refDate.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);

    const days: WeekDaySpawns[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(date.getDate() + i);

      const dayOfWeek = date.getDay();
      const isToday = date.toDateString() === now.toDateString();

      const daySpawns: SpawnInfo[] = [];
      const addedBossIds = new Set<string>();

      // ── 1. Death events (from history) for ALL boss types ──
      for (const dr of deathRecords) {
        if (dr.is_initial_spawn) continue;
        if (new Date(dr.death_time).toDateString() !== date.toDateString()) continue;
        const boss = bossMap.get(dr.boss_id);
        if (!boss) continue;

        daySpawns.push({
          boss,
          nextSpawn: new Date(dr.death_time),
          status: "alive",
          deathRecord: dr,
        });
        addedBossIds.add(boss.id);
      }

      // ── 2. Spawn events ──────────────────────────────────
      for (const boss of bosses) {
        if (boss.spawn_type === "fixed_schedule" && boss.schedule) {
          for (const slot of boss.schedule) {
            if (slot.day === dayOfWeek) {
              const [h, m] = slot.time.split(":").map(Number);
              const spawnDate = new Date(date);
              spawnDate.setHours(h, m, 0, 0);

              // Skip if boss was already killed on this day (death event takes priority)
              if (addedBossIds.has(boss.id)) continue;

              daySpawns.push({
                boss,
                nextSpawn: spawnDate,
                status: spawnDate > now ? "countdown" : "alive",
                deathRecord: null,
              });
            }
          }
        } else if (boss.spawn_type === "fixed_hours") {
          const info = calculateSpawnInfo(boss, deathMap.get(boss.id) ?? null);

          if (info.nextSpawn) {
            const spawnsOnThisDay = info.nextSpawn.toDateString() === date.toDateString();

            if (info.status === "alive") {
              if ((spawnsOnThisDay || isToday) && !addedBossIds.has(boss.id)) {
                daySpawns.push(info);
              }
            } else if (info.status === "countdown") {
              if (spawnsOnThisDay) {
                daySpawns.push(info);
              }
            }
          } else if (i === 0) {
            // Unknown-status boss (never killed) — show on Monday so
            // guild assignments are visible even without a known spawn time
            if (!addedBossIds.has(boss.id)) {
              daySpawns.push(info);
            }
          }
        }
      }

      // Sort by time
      daySpawns.sort((a, b) => {
        if (!a.nextSpawn) return 1;
        if (!b.nextSpawn) return -1;
        return a.nextSpawn.getTime() - b.nextSpawn.getTime();
      });

      days.push({
        day: dayOfWeek,
        dayName: DAY_NAMES_SHORT[dayOfWeek],
        date,
        isToday,
        spawns: daySpawns,
      });
    }

    return days;
  }, [bosses, deathRecords, weekOffset]);

  const isLoading = bossesLoading || recordsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Saving overlay � blocks all interaction */}
      {savingMessage && <SavingOverlay message={savingMessage} />}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-[#fafafa]">Weekly Schedule</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => { setWeekLoading(true); setWeekOffset(w => w - 1); }} disabled={prevWeekDisabled} className="px-3 py-1.5 rounded-lg text-xs bg-[#18181b] border border-[#27272a] text-[#d4d4d8] hover:bg-[#27272a] disabled:opacity-30 disabled:cursor-not-allowed transition">← Previous Week</button>
          <span className="text-sm text-[#a1a1aa] font-medium">{weekOffset === 0 ? "This Week" : weekOffset === 1 ? "Next Week" : weekOffset > 0 ? `${weekOffset} weeks ahead` : weekOffset === -1 ? "Last Week" : `${Math.abs(weekOffset)} weeks ago`}</span>
          <button onClick={() => { setWeekLoading(true); setWeekOffset(w => w + 1); }} disabled={weekOffset >= 4} className="px-3 py-1.5 rounded-lg text-xs bg-[#18181b] border border-[#27272a] text-[#d4d4d8] hover:bg-[#27272a] disabled:opacity-30 disabled:cursor-not-allowed transition">Next Week →</button>
        </div>
      </div>

      {weekLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" />
        </div>
      ) : (<>
      {/* Mobile: list view */}
      <div className="lg:hidden space-y-3">
        {weekDays.map((day) => (
          <div
            key={day.day}
            className={`rounded-xl border p-4 transition-all duration-300 ${
              day.isToday
                ? "border-[#27272a] bg-[#18181b] shadow-sm "
                : "border-[#27272a] bg-[#18181b] hover:border-[#3f3f46]"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className={`font-semibold ${day.isToday ? "text-[#fafafa]" : "text-[#a1a1aa]"}`}>{day.dayName}</span>
                <span className="text-[#71717a] text-sm ml-2">
                  {day.date.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              {day.isToday && (
                <span className="text-[10px] font-medium text-[#71717a]">Today</span>
              )}
            </div>

            {day.spawns.length === 0 ? (
              <p className="text-[#52525b] text-sm">No spawns</p>
            ) : (
              <div className="space-y-2">
                {day.spawns.map((s, i) => {
                  const isDeathEvent = s.deathRecord !== null && !s.deathRecord.is_initial_spawn && s.nextSpawn?.getTime() === new Date(s.deathRecord.death_time).getTime();
                  const isScheduleBoss = s.boss.spawn_type === "fixed_schedule";

                  return (
                  <div
                    key={`${s.boss.id}-${i}`}
                    onClick={() => {
                      if (isDeathEvent && s.deathRecord) {
                        setSelectedDeath({
                          deathRecordId: s.deathRecord.id,
                          bossName: s.boss.name,
                          deathTime: s.deathRecord.death_time,
                          ownerGuildId: s.deathRecord.display_owner_guild_id ?? s.deathRecord.owner_guild_id,
                        });
                      } else if (!isViewer || viewerCanMarkDied) {
                        setMarkBoss({
                          boss: s.boss,
                          spawnTime: isScheduleBoss ? s.nextSpawn ?? undefined : undefined,
                        });
                      }
                    }}
                    className={`flex items-center justify-between py-1.5 px-2 rounded-lg transition-all duration-200 ${
                      isDeathEvent
                        ? "bg-[#0d0d10] border border-[#27272a] cursor-pointer hover:bg-[#18181b]"
                        : (isViewer && !viewerCanMarkDied)
                        ? "bg-[#18181b] cursor-default opacity-60"
                        : "bg-[#1c1c20] border border-[#27272a] cursor-pointer hover:bg-[#27272a] hover:border-[#52525b] hover:scale-[1.01]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isDeathEvent ? "bg-[#a1a1aa]" :
                          s.boss.spawn_type === "fixed_schedule"
                            ? "bg-[#a1a1aa]"
                            : "bg-[#a1a1aa]"
                        }`}
                      />
                      <span className="text-[#fafafa] text-sm">{s.boss.name}</span>
                      {isDeathEvent && (
                        <span className="text-[10px] text-[#71717a] inline-flex items-center gap-1">Killed <Users className="w-3 h-3" /></span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[#a1a1aa] text-sm">
                        {s.nextSpawn?.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {(() => {
                        let gName: string | null | undefined;
                        if (isDeathEvent && s.deathRecord) {
                          gName = guilds.find(g => g.id === (s.deathRecord!.display_owner_guild_id ?? s.deathRecord!.owner_guild_id))?.name;
                        } else {
                          gName = getOwnerGuildName(s.boss.id, day.day);
                        }
                        if (!gName) return null;
                        return (
                        <div className={`text-[10px] font-medium ${guildColor(gName).text}`}>{gName}</div>
                      ); })()}
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: grid view */}
      <div className="hidden lg:grid grid-cols-7 gap-2">
        {weekDays.map((day) => (
          <div
            key={day.day}
            className={`rounded-xl border overflow-hidden transition-all duration-300 ${
              day.isToday
                ? "border-[#27272a] bg-[#18181b] shadow-sm"
                : "border-[#27272a] bg-[#18181b] hover:border-[#3f3f46]"
            }`}
          >
            {/* Day header */}
            <div
              className={`text-center py-2.5 border-b ${
                day.isToday ? "border-[#27272a] bg-[#18181b]" : "border-[#27272a]"
              }`}
            >
              <div className={`font-semibold text-sm ${day.isToday ? "text-[#fafafa]" : "text-[#a1a1aa]"}`}>{day.dayName}</div>
              <div className="text-[#71717a] text-xs">
                {day.date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>

            {/* Spawns */}
            <div className="p-2 space-y-1.5 min-h-[120px]">
              {day.spawns.length === 0 ? (
                <p className="text-[#3f3f46] text-xs text-center py-4 italic">No spawns</p>
              ) : (
                day.spawns.map((s, i) => {
                  const isDeathEvent = s.deathRecord !== null && !s.deathRecord.is_initial_spawn && s.nextSpawn?.getTime() === new Date(s.deathRecord.death_time).getTime();
                  const isScheduleBoss = s.boss.spawn_type === "fixed_schedule";

                  return (
                  <div
                    key={`${s.boss.id}-${i}`}
                    onClick={() => {
                      if (isDeathEvent && s.deathRecord) {
                        setSelectedDeath({
                          deathRecordId: s.deathRecord.id,
                          bossName: s.boss.name,
                          deathTime: s.deathRecord.death_time,
                          ownerGuildId: s.deathRecord.display_owner_guild_id ?? s.deathRecord.owner_guild_id,
                        });
                      } else if (!isViewer || viewerCanMarkDied) {
                        setMarkBoss({
                          boss: s.boss,
                          spawnTime: isScheduleBoss ? s.nextSpawn ?? undefined : undefined,
                        });
                      }
                    }}
                    className={`text-xs rounded px-1.5 py-1 transition-all duration-200 ${
                      isDeathEvent
                        ? "bg-[#0d0d10] border border-[#27272a] cursor-pointer hover:bg-[#18181b]"
                        : (isViewer && !viewerCanMarkDied)
                        ? "bg-[#18181b] cursor-default opacity-60"
                        : "bg-[#1c1c20] border border-[#27272a] cursor-pointer hover:bg-[#27272a] hover:border-[#52525b] hover:scale-[1.02]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[#fafafa] font-medium truncate">
                        {s.boss.name}
                      </span>
                      <div className="text-right shrink-0 ml-1">
                        <div className="text-[#a1a1aa]">
                          {s.nextSpawn?.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        {(() => {
                          let gName: string | null | undefined;
                          if (isDeathEvent && s.deathRecord) {
                            gName = guilds.find(g => g.id === (s.deathRecord!.display_owner_guild_id ?? s.deathRecord!.owner_guild_id))?.name;
                          } else {
                            gName = getOwnerGuildName(s.boss.id, day.day);
                          }
                          if (!gName) return null;
                          return (
                          <div className={`text-[9px] font-medium ${guildColor(gName).text}`}>{gName}</div>
                        ); })()}
                      </div>
                    </div>
                    {isDeathEvent && (
                      <span className="text-[10px] text-[#71717a] font-medium flex items-center gap-1">
                        Killed <Users className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                )})
              )}
            </div>
          </div>
        ))}
      </div>

      </> )}

      {/* Legend */}
      <div className="flex items-center gap-5 mt-6 text-[11px] text-[#71717a] bg-[#18181b] border border-[#27272a] rounded-lg px-4 py-2 w-fit">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Scheduled spawn
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#a1a1aa]" />
          Killed (click for details)
        </div>
      </div>

      {/* Participant Modal */}
      {selectedDeath && (
        <ParticipantModal
          deathRecordId={selectedDeath.deathRecordId}
          bossName={selectedDeath.bossName}
          deathTime={selectedDeath.deathTime}
          ownerGuildId={selectedDeath.ownerGuildId}
          onClose={() => setSelectedDeath(null)}
          readOnly={isViewer}
          onEditDeathTime={!isViewer ? () => {
            const dt = new Date(selectedDeath.deathTime);
            const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            setEditDeathDate(local);
            setEditDeath({ deathRecordId: selectedDeath.deathRecordId, bossName: selectedDeath.bossName, deathTime: selectedDeath.deathTime });
          } : undefined}
          onChangeGuild={!isViewer ? () => {
            setEditGuildDeath({ deathRecordId: selectedDeath.deathRecordId, bossName: selectedDeath.bossName });
          } : undefined}
        />
      )}

      {/* Mark as Died Modal */}
      {markBoss && (
        <DeathRecordModal
          boss={markBoss.boss}
          defaultDeathTime={markBoss.spawnTime}
          hideCustomTime={markBoss.boss.spawn_type === "fixed_schedule"}
          ownerGuildId={(() => { const n = getOwnerGuildName(markBoss.boss.id); return n ? guilds.find(g => g.name === n)?.id ?? null : null; })()}
          onClose={() => setMarkBoss(null)}
          onSubmit={(deathTime, rallyImages, attendeeIds) => {
            handleRecordDeath(markBoss.boss.id, deathTime, rallyImages, attendeeIds);
            setMarkBoss(null);
          }}
        />
      )}

      {/* Edit death time modal */}
      {editDeath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditDeath(null)} />
          <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#fafafa]">Edit Death Time</h3>
              <button onClick={() => setEditDeath(null)} className="p-1 rounded-md text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[#a1a1aa] mb-3">
              Change the recorded death time for <span className="text-[#fafafa] font-medium">{editDeath.bossName}</span>
            </p>
            <input
              type="datetime-local"
              value={editDeathDate}
              onChange={(e) => setEditDeathDate(e.target.value)}
              className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#52525b] mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditDeath(null)}
                className="px-4 py-2 rounded-md text-sm text-[#d4d4d8] hover:bg-[#27272a] transition"
                disabled={editDeathSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleEditDeathTime}
                disabled={editDeathSaving}
                className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-[#fafafa] hover:bg-blue-700 transition disabled:opacity-50"
              >
                {editDeathSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit death time toast */}
      {editToast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className={`px-4 py-2 rounded-lg text-sm text-[#fafafa] shadow-lg ${editToast.type === "success" ? "bg-[#18181b] border border-[#27272a]" : "bg-[#18181b] border border-[#27272a]"}`}>
            {editToast.message}
          </div>
        </div>
      )}

      {/* Edit display guild modal */}
      {editGuildDeath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditGuildDeath(null)} />
          <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl p-6 w-full max-w-xs shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#fafafa]">Change Guild</h3>
              <button onClick={() => setEditGuildDeath(null)} className="p-1 rounded-md text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[#a1a1aa] mb-3">
              Select who killed <span className="text-[#fafafa] font-medium">{editGuildDeath.bossName}</span>
            </p>
            <p className="text-[10px] text-[#71717a] mb-3">This does not affect the guild rotation sequence.</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              <button
                onClick={() => handleSetDisplayGuild(null)}
                disabled={editGuildSaving}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-[#a1a1aa] hover:bg-[#27272a] transition"
              >
                None (use rotation)
              </button>
              {guilds.map((g) => {
                return (
                  <button
                    key={g.id}
                    onClick={() => handleSetDisplayGuild(g.id)}
                    disabled={editGuildSaving}
                    className="w-full text-left px-3 py-2 rounded-md text-sm transition flex items-center gap-2 text-[#d4d4d8] hover:bg-[#27272a]"
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Activities for the week */}
      {activities.length > 0 && (
        <section className="mt-6 pt-4 border-t border-[#27272a]">
          <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4" /> Activities
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activities.map(a => {
              const slots = Array.isArray(a.schedule) ? a.schedule : [];
              if (slots.length === 0) return null;
              return slots.map((slot, i) => {
                const dayName = DAY_NAMES_SHORT[slot.day];
                return (
                  <div key={`${a.id}-${i}`} className="flex items-center gap-2 bg-[#18181b]/50 border border-[#27272a] rounded-lg px-3 py-2">
                    <span className="text-xs">📅</span>
                    <span className="text-sm text-[#a1a1aa] flex-1 truncate">{a.name}</span>
                    <span className="text-xs text-[#71717a]">{dayName} {slot.time}</span>
                  </div>
                );
              });
            })}
          </div>
        </section>
      )}
    </div>
  );
}
