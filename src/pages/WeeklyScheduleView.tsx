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
} from "@/lib/supabase";
import { Loader2, ChevronLeft, ChevronRight, Users, Shield } from "lucide-react";
import { SavingOverlay } from "@/components/SavingOverlay";
import type { WeekDaySpawns, SpawnInfo, Boss, BossGuild, Guild } from "@/types";

export function WeeklyScheduleView() {
  const { data: bosses = [], isLoading: bossesLoading } = useBosses();
  const { data: deathRecords = [], isLoading: recordsLoading } = useDeathRecords();
  const { user, isViewer } = useAuth();
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
  const [saving, setSaving] = useState(false);

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

    // Schedule mode: look up by day_of_week
    const dow = dayOfWeek ?? new Date().getDay();
    const scheduleEntry = bgs.find(bg => bg.day_of_week === dow);
    if (scheduleEntry) return guilds.find(g => g.id === scheduleEntry.guild_id)?.name ?? null;

    // Rotation mode: first guild (rotation order handled server-side)
    const rotationEntry = bgs.find(bg => bg.sort_order !== null);
    if (rotationEntry) return guilds.find(g => g.id === rotationEntry.guild_id)?.name ?? null;

    return null;
  }, [bossGuilds, guilds]);

  const handleRecordDeath = useCallback(
    async (bossId: string, deathTime: Date, rallyImages: File[], attendeeIds: string[]) => {
      if (!user) return;
      const boss = bosses.find((b) => b.id === bossId);
      setSaving(true);
      try {
        const record = await insertDeathRecord(bossId, deathTime);

        for (const memberId of attendeeIds) {
          try { await addAttendance(record.id, memberId); } catch {}
        }

        queryClient.invalidateQueries({ queryKey: ["death_records"] });
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
        queryClient.invalidateQueries({ queryKey: ["members"] });
        queryClient.invalidateQueries({ queryKey: ["analytics"] });

        const sid = getCurrentServerId();
        if (sid && boss) notifyDiscord(sid, "boss_died", {
          boss_name: boss.name,
          attendees: attendeeIds.length > 0 ? [`${attendeeIds.length} participant(s)`] : undefined,
          guild_name: getOwnerGuildName(boss.id) ?? undefined,
        });
      } catch (err) {
        console.error("Failed to record death:", err);
      } finally {
        setSaving(false);
      }
    },
    [user, queryClient, bosses, getOwnerGuildName]
  );

  const weekDays = useMemo(() => {
    const now = new Date();
    const deathMap = new Map([...deathRecords].reverse().map((d) => [d.boss_id, d]));
    const bossMap = new Map(bosses.map((b) => [b.id, b]));

    // Build 7 days: Monday â†’ Sunday
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

      // â”€â”€ 1. Death events (from history) for ALL boss types â”€â”€
      for (const dr of deathRecords) {
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

      // â”€â”€ 2. Spawn events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Saving overlay — blocks all interaction */}
      {saving && <SavingOverlay />}

      <h2 className="text-xl font-bold text-white mb-6">Weekly Schedule</h2>

      {/* Mobile: list view */}
      <div className="lg:hidden space-y-4">
        {weekDays.map((day) => (
          <div
            key={day.day}
            className={`rounded-xl border p-4 ${
              day.isToday
                ? "border-red-800 bg-red-900/10"
                : "border-slate-800 bg-slate-900"
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
                  const isDeathEvent = s.deathRecord !== null && s.nextSpawn?.getTime() === new Date(s.deathRecord.death_time).getTime();
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
                    className={`flex items-center justify-between py-1.5 px-2 rounded transition ${
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
                      {(() => { const gName = getOwnerGuildName(s.boss.id, day.day); if (!gName) return null; const c = guildColor(gName); return (
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
            className={`rounded-xl border overflow-hidden ${
              day.isToday
                ? "border-red-800 bg-red-900/10"
                : "border-slate-800 bg-slate-900"
            }`}
          >
            {/* Day header */}
            <div
              className={`text-center py-2 border-b ${
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
                <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-900/50 text-red-400">
                  Today
                </span>
              )}
            </div>

            {/* Spawns */}
            <div className="p-2 space-y-1.5 min-h-[120px]">
              {day.spawns.length === 0 ? (
                <p className="text-slate-700 text-xs text-center py-4">â€”</p>
              ) : (
                day.spawns.map((s, i) => {
                  const isDeathEvent = s.deathRecord !== null && s.nextSpawn?.getTime() === new Date(s.deathRecord.death_time).getTime();
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
                    className={`text-xs rounded px-1.5 py-1 transition ${
                      isDeathEvent
                        ? "bg-red-900/20 border border-red-900/30 cursor-pointer hover:bg-red-900/30"
                        : isViewer
                        ? "bg-slate-800/50 cursor-default"
                        : isScheduleBoss
                        ? "bg-blue-900/20 border border-blue-900/30 cursor-pointer hover:bg-blue-900/30"
                        : "bg-orange-900/20 border border-orange-900/30 cursor-pointer hover:bg-orange-900/30"
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
                    {(() => { const gName = getOwnerGuildName(s.boss.id, day.day); if (!gName) return null; const c = guildColor(gName); return (
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
    </div>
  );
}
