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
} from "@/lib/supabase";
import { Loader2, ChevronLeft, ChevronRight, Users, Shield, X } from "lucide-react";
import { SavingOverlay } from "@/components/SavingOverlay";
import type { WeekDaySpawns, SpawnInfo, Boss, BossGuild, Guild } from "@/types";

export function WeeklyScheduleView() {
  const { data: bosses = [], isLoading: bossesLoading, refetch: refetchBosses } = useBosses();
  const { data: deathRecords = [], isLoading: recordsLoading, refetch: refetchDeaths } = useDeathRecords();
  const { user, isViewer } = useAuth();

  // Always fetch fresh data on mount so rotation adjustments from Bosses tab are reflected
  useEffect(() => {
    refetchBosses();
    refetchDeaths();
  }, []);
  const { currentServer } = useServer();
  const queryClient = useQueryClient();

  // Selected death for participant modal
  const [selectedDeath, setSelectedDeath] = useState<{
    deathRecordId: string;
    bossName: string;
    deathTime: string;
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

  const getOwnerGuildName = useCallback((bossId: string, dayOfWeek?: number): string | null => {
    const bgs = bossGuilds.filter(bg => bg.boss_id === bossId);
    if (bgs.length === 0) return null;

    // Schedule mode: look up by day_of_week (uses the provided dayOfWeek for grid display)
    const dow = dayOfWeek ?? new Date().getDay();
    const scheduleEntry = bgs.find(bg => bg.day_of_week === dow);
    if (scheduleEntry) return guilds.find(g => g.id === scheduleEntry.guild_id)?.name ?? null;

    const bossData = bosses.find(b => b.id === bossId);
    const adjustment = bossData?.rotation_adjustment ?? 0;

    // Daily mode: advance guild only when spawn crosses into a new day
    const dailyEntries = bgs.filter(bg => bg.mode === "daily").sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (dailyEntries.length > 0) {
      const lastDeath = deathRecords
        .filter(dr => dr.boss_id === bossId && !dr.is_initial_spawn)
        .sort((a, b) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];
      
      if (!lastDeath) {
        return guilds.find(g => g.id === dailyEntries[0].guild_id)?.name ?? null;
      }

      const respawnHours = bossData?.respawn_hours ?? 0;
      const deathDate = new Date(lastDeath.death_time);
      const spawnDate = new Date(deathDate.getTime() + respawnHours * 3600000);

      if (deathDate.toDateString() === spawnDate.toDateString()) {
        const lastGuildId = (lastDeath as any).owner_guild_id;
        return lastGuildId ? guilds.find(g => g.id === lastGuildId)?.name ?? null : guilds.find(g => g.id === dailyEntries[0].guild_id)?.name ?? null;
      }

      const lastGuildId = (lastDeath as any).owner_guild_id;
      if (!lastGuildId) {
        // No owner_guild_id — advance from first guild since spawn crossed into new day
        let idx = (1 + adjustment) % dailyEntries.length;
        if (idx < 0) idx += dailyEntries.length;
        return guilds.find(g => g.id === dailyEntries[idx].guild_id)?.name ?? null;
      }
      
      const lastIdx = dailyEntries.findIndex(bg => bg.guild_id === lastGuildId);
      let nextIdx = (lastIdx >= 0 ? lastIdx + 1 : 0) + adjustment;
      nextIdx = ((nextIdx % dailyEntries.length) + dailyEntries.length) % dailyEntries.length;
      return guilds.find(g => g.id === dailyEntries[nextIdx].guild_id)?.name ?? null;
    }

    // Rotation mode: use rotation_counter
    const rotationEntries = bgs.filter(bg => bg.sort_order !== null && bg.mode !== "daily").sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (rotationEntries.length > 0) {
      const counter = bossData?.rotation_counter ?? 1;
      const idx = ((counter - 1) % rotationEntries.length + rotationEntries.length) % rotationEntries.length;
      return guilds.find(g => g.id === rotationEntries[idx].guild_id)?.name ?? null;
    }

    return null;
  }, [bossGuilds, guilds, deathRecords, bosses]);

  const handleRecordDeath = useCallback(
    async (bossId: string, deathTime: Date, rallyImages: File[], attendeeIds: string[]) => {
      if (!user) return;
      const boss = bosses.find((b) => b.id === bossId);
      if (!boss) return;
      setSavingMessage("Recording death...");
      try {
        const ownerGuildName = getOwnerGuildName(boss.id);
        const ownerGuildId = ownerGuildName ? guilds.find(g => g.name === ownerGuildName)?.id ?? null : null;
        const record = await insertDeathRecord(bossId, deathTime, ownerGuildId);

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
    [user, queryClient, bosses, getOwnerGuildName]
  );

  const weekDays = useMemo(() => {
    const now = new Date();
    const deathMap = new Map([...deathRecords].reverse().map((d) => [d.boss_id, d]));
    const bossMap = new Map(bosses.map((b) => [b.id, b]));

    // Build 7 days: Monday → Sunday
    const monday = new Date(now);
    const dayOfWeek = now.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(now.getDate() - daysFromMonday);
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
          if (!info.nextSpawn) continue;

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
  }, [bosses, deathRecords]);

  const isLoading = bossesLoading || recordsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[90rem] mx-auto px-4 py-6">
      {/* Saving overlay � blocks all interaction */}
      {savingMessage && <SavingOverlay message={savingMessage} />}

      <h2 className="text-xl font-bold text-white mb-6">Weekly Schedule</h2>

      {/* Mobile: list view */}
      <div className="lg:hidden space-y-3">
        {weekDays.map((day) => (
          <div
            key={day.day}
            className={`rounded-xl border p-4 transition-all duration-300 ${
              day.isToday
                ? "border-red-800 bg-red-900/10 shadow-lg shadow-red-900/5"
                : "border-slate-800 bg-slate-900 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-white font-bold">{day.dayName}</span>
                <span className="text-slate-500 text-sm ml-2">
                  {day.date.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                {day.isToday && (
                  <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-900/50 text-red-400">Today</span>
                )}
              </div>
              {day.isToday && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-900/50 text-red-400">
                  Today
                </span>
              )}
            </div>

            {day.spawns.length === 0 ? (
              <p className="text-slate-600 text-sm">No spawns</p>
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
                        });
                      } else if (!isViewer) {
                        setMarkBoss({
                          boss: s.boss,
                          spawnTime: isScheduleBoss ? s.nextSpawn ?? undefined : undefined,
                        });
                      }
                    }}
                    className={`flex items-center justify-between py-1.5 px-2 rounded transition-all duration-200 hover:scale-[1.01] ${
                      isDeathEvent
                        ? "bg-red-900/20 border border-red-900/30 cursor-pointer hover:bg-red-900/30"
                        : isViewer
                        ? "bg-slate-800/50 cursor-default"
                        : "bg-slate-800/50 cursor-pointer hover:bg-slate-700/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isDeathEvent ? "bg-red-400" :
                          s.boss.spawn_type === "fixed_schedule"
                            ? "bg-blue-400"
                            : "bg-orange-400"
                        }`}
                      />
                      <span className="text-white text-sm">{s.boss.name}</span>
                      {(() => {
                        let gName: string | null | undefined;
                        if (isDeathEvent && s.deathRecord) {
                          gName = guilds.find(g => g.id === (s.deathRecord!.display_owner_guild_id ?? s.deathRecord!.owner_guild_id))?.name;
                        } else {
                          gName = getOwnerGuildName(s.boss.id, day.day);
                        }
                        if (!gName) return null;
                        const c = guildColor(gName);
                        return (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 border ${c.bg} ${c.text} ${c.border}`}><Shield className="w-2.5 h-2.5" />{gName}</span>
                      ); })()}
                      {isDeathEvent && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 inline-flex items-center gap-1">Killed <Users className="w-3 h-3" /></span>
                      )}
                    </div>
                    <span className="text-slate-400 text-sm">
                        {s.nextSpawn?.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
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
            className={`rounded-xl border overflow-hidden transition-all duration-300 hover:shadow-lg ${
              day.isToday
                ? "border-red-800 bg-red-900/10 shadow-lg shadow-red-900/5"
                : "border-slate-800 bg-slate-900 hover:border-slate-700"
            }`}
          >
            {/* Day header */}
            <div
              className={`text-center py-2.5 border-b transition-colors ${
                day.isToday ? "border-red-800 bg-red-900/20" : "border-slate-800"
              }`}
            >
              <div className="text-white font-bold text-sm">{day.dayName}</div>
              <div className="text-slate-500 text-xs">
                {day.date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              {day.isToday && (
                <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-900/50 text-red-400 animate-pulse">
                  Today
                </span>
              )}
            </div>

            {/* Spawns */}
            <div className="p-2 space-y-1.5 min-h-[120px]">
              {day.spawns.length === 0 ? (
                <p className="text-slate-700 text-xs text-center py-4">—</p>
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
                        });
                      } else if (!isViewer) {
                        setMarkBoss({
                          boss: s.boss,
                          spawnTime: isScheduleBoss ? s.nextSpawn ?? undefined : undefined,
                        });
                      }
                    }}
                    className={`text-xs rounded px-1.5 py-1 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                      isDeathEvent
                        ? "bg-red-900/20 border border-red-900/30 cursor-pointer hover:bg-red-900/30 hover:border-red-800"
                        : isViewer
                        ? "bg-slate-800/50 cursor-default"
                        : isScheduleBoss
                        ? "bg-blue-900/20 border border-blue-900/30 cursor-pointer hover:bg-blue-900/30 hover:border-blue-800"
                        : "bg-orange-900/20 border border-orange-900/30 cursor-pointer hover:bg-orange-900/30 hover:border-orange-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium truncate">
                        {s.boss.name}
                      </span>
                      <span className="text-slate-400 shrink-0 ml-1">
                        {s.nextSpawn?.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {(() => {
                      let gName: string | null | undefined;
                      if (isDeathEvent && s.deathRecord) {
                        gName = guilds.find(g => g.id === (s.deathRecord!.display_owner_guild_id ?? s.deathRecord!.owner_guild_id))?.name;
                      } else {
                        gName = getOwnerGuildName(s.boss.id, day.day);
                      }
                      if (!gName) return null;
                      const c = guildColor(gName);
                      return (
                      <span className={`text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5 w-fit border ${c.bg} ${c.text} ${c.border}`}><Shield className="w-2 h-2" />{gName}</span>
                    ); })()}
                    {isDeathEvent && (
                      <span className="text-[10px] text-red-400 font-medium flex items-center gap-1">
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

      {/* Legend */}
      <div className="flex items-center gap-4 mt-6 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-400" />
          Killed (click for participants)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-400" />
          Fixed Schedule
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-orange-400" />
          Fixed Hours (timer)
        </div>
      </div>

      {/* Participant Modal */}
      {selectedDeath && (
        <ParticipantModal
          deathRecordId={selectedDeath.deathRecordId}
          bossName={selectedDeath.bossName}
          deathTime={selectedDeath.deathTime}
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
          onDelete={!isViewer ? async () => {
            try {
              await deleteDeathRecord(selectedDeath.deathRecordId);
              queryClient.invalidateQueries({ queryKey: ["death_records"] });
              setEditToast({ type: "success", message: "Death record removed!" });
              setSelectedDeath(null);
            } catch (err: any) {
              setEditToast({ type: "error", message: err?.message ?? "Failed to remove" });
            }
          } : undefined}
        />
      )}

      {/* Mark as Died Modal */}
      {markBoss && (
        <DeathRecordModal
          boss={markBoss.boss}
          defaultDeathTime={markBoss.spawnTime}
          hideCustomTime={markBoss.boss.spawn_type === "fixed_schedule"}
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
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Edit Death Time</h3>
              <button onClick={() => setEditDeath(null)} className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-3">
              Change the recorded death time for <span className="text-white font-medium">{editDeath.bossName}</span>
            </p>
            <input
              type="datetime-local"
              value={editDeathDate}
              onChange={(e) => setEditDeathDate(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditDeath(null)}
                className="px-4 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-700 transition"
                disabled={editDeathSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleEditDeathTime}
                disabled={editDeathSaving}
                className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
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
          <div className={`px-4 py-2 rounded-lg text-sm text-white shadow-lg ${editToast.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
            {editToast.message}
          </div>
        </div>
      )}

      {/* Edit display guild modal */}
      {editGuildDeath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditGuildDeath(null)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-xs shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Change Guild</h3>
              <button onClick={() => setEditGuildDeath(null)} className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-3">
              Select who killed <span className="text-white font-medium">{editGuildDeath.bossName}</span>
            </p>
            <p className="text-[10px] text-slate-500 mb-3">This does not affect the guild rotation sequence.</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              <button
                onClick={() => handleSetDisplayGuild(null)}
                disabled={editGuildSaving}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-slate-400 hover:bg-slate-700 transition"
              >
                None (use rotation)
              </button>
              {guilds.map((g) => {
                const c = guildColor(g.name);
                return (
                  <button
                    key={g.id}
                    onClick={() => handleSetDisplayGuild(g.id)}
                    disabled={editGuildSaving}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition flex items-center gap-2 ${c.bg} ${c.text} border ${c.border} hover:opacity-80`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
