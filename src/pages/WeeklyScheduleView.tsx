import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
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
  recordActivityEnd,
} from "@/lib/supabase";
import { supabaseUrl, supabaseKey } from "@/lib/api/client";
import { Loader2, Users, X, Calendar, CheckCheck, Copy, CopyCheck, Check } from "lucide-react";
import { SavingOverlay } from "@/components/SavingOverlay";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { useRecordDeath } from "@/hooks/useRecordDeath";
import { getOwnerGuildName as getOwnerGuildNameLib } from "@/lib/rotation";
import { useActivities } from "@/hooks/useActivities";
import { writeAuditEntry, AuditAction } from "@/lib/api/audit";
import { useCopyAttendance } from "@/hooks/useAttendance";
import { calculateActivityInfo } from "@/lib/activityCalculator";
import { fetchDeathsInWindow } from "@/lib/api/deaths";
import type { WeekDaySpawns, SpawnInfo, Boss, BossGuild, Guild, ActivityInstance, ActivityInfo, Activity, DeathRecord } from "@/types";

export function WeeklyScheduleView() {
  const { currentServer } = useServer();
  const { timezone: userTz } = useUserTimezone(currentServer?.timezone);
  const { data: bosses = [], isLoading: bossesLoading, refetch: refetchBosses } = useBosses();
  const { data: deathRecords = [], isLoading: recordsLoading, refetch: refetchDeaths } = useDeathRecords();
  const { activities = [], activityInstances = [] } = useActivities();
  const { user, isViewer, viewerCanMarkDied } = useAuth();

  // Always fetch fresh data on mount so rotation adjustments from Bosses tab are reflected
  useEffect(() => {
    refetchBosses();
    refetchDeaths();
  }, []);

  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekLoading, setWeekLoading] = useState(false);
  useEffect(() => { setWeekLoading(false); }, [weekOffset]);

  // Compute the Monday of the displayed week (matches useMemo below)
  const weekMonday = useMemo(() => {
    const now = new Date();
    const ref = new Date(now);
    ref.setDate(ref.getDate() + weekOffset * 7);
    const dow = ref.getDay();
    const dist = dow === 0 ? 6 : dow - 1;
    const mon = new Date(ref);
    mon.setDate(ref.getDate() - dist);
    mon.setHours(0, 0, 0, 0);
    return mon;
  }, [weekOffset]);

  // Sunday 23:59:59 of the displayed week
  const weekSunday = useMemo(() => {
    const sun = new Date(weekMonday);
    sun.setDate(sun.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    return sun;
  }, [weekMonday]);

  // Fetch ALL deaths in the displayed week (not just latest per boss)
  const { data: windowDeaths = [] } = useQuery<DeathRecord[]>({
    queryKey: ["deaths_in_window", currentServer?.id, weekMonday.toISOString()],
    queryFn: async () => {
      if (!currentServer?.id) return [];
      return await fetchDeathsInWindow(weekMonday, weekSunday, currentServer.id);
    },
    staleTime: 30_000,
    enabled: !!currentServer?.id,
  });

  // Merge: latest-per-boss (for spawn calc) + all-in-window (for per-day death events)
  const allDeathRecords = useMemo(() => {
    const seen = new Map<string, DeathRecord>();
    for (const dr of deathRecords) seen.set(dr.id, dr);
    for (const dr of windowDeaths) { if (!seen.has(dr.id)) seen.set(dr.id, dr); }
    return [...seen.values()];
  }, [deathRecords, windowDeaths]);

  // Batch-fetch attendance counts for death records in the current week
  const deathRecordIds = useMemo(() =>
    [...new Set(allDeathRecords.filter(dr => !dr.is_initial_spawn).map(dr => dr.id))],
  [allDeathRecords]);
  const { data: attendanceCounts, isLoading: attendanceLoading } = useQuery({
    queryKey: ["attendance_counts", currentServer?.id, weekMonday.toISOString()],
    queryFn: async () => {
      if (!deathRecordIds.length) return new Map<string, number>();
      const map = new Map<string, number>();
      const sid = getCurrentServerId();
      for (let i = 0; i < deathRecordIds.length; i += 100) {
        const batch = deathRecordIds.slice(i, i + 100);
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/get-attendance`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}`, "apikey": supabaseKey },
            body: JSON.stringify({ death_record_ids: batch, server_id: sid }),
          });
          if (!resp.ok) { console.warn("attendance batch edge fn error:", resp.status); continue; }
          const data = await resp.json();
          for (const r of (data ?? [])) { map.set(r.death_record_id, (map.get(r.death_record_id) || 0) + 1); }
        } catch (err) { console.warn("attendance batch fetch failed:", err); }
      }
      return map;
    },
    enabled: deathRecordIds.length > 0,
    staleTime: 0,
    refetchInterval: 3_000,
  });

  // No limit on scrolling back — user can go as far as their data exists
  const prevWeekDisabled = false;
  const nextWeekDisabled = weekOffset >= 4;

  // Selected death for participant modal
  const [selectedDeath, setSelectedDeath] = useState<{
    deathRecordId: string;
    bossName: string;
    deathTime: string;
    ownerGuildId: string | null;
  } | null>(null);

  // Selected boss for "Mark as Died" modal (with optional spawn time for schedule bosses)
  const [markBoss, setMarkBoss] = useState<{ boss: Boss; spawnTime?: Date } | null>(null);

  // Selected activity for "Record End" modal
  const [markActivity, setMarkActivity] = useState<{ activity: Activity; activityName: string } | null>(null);

  // Selected activity instance for participant modal (finished activities)
  const [selectedActivityInstance, setSelectedActivityInstance] = useState<{
    activityInstanceId: string;
    activityName: string;
    endTime: string;
  } | null>(null);

  // Global saving overlay
  const [savingMessage, setSavingMessage] = useState<string | null>(null);

  // Copy attendance mode
  const [copySource, setCopySource] = useState<{ deathRecordId: string; bossName: string; deathDate: string } | null>(null);
  const [copyConfirm, setCopyConfirm] = useState<{ bossName: string; deathRecordId: string } | null>(null);
  const [copyToast, setCopyToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const copyAttendance = useCopyAttendance();

  const handleCopyStart = useCallback((deathRecordId: string, bossName: string, deathDate: string) => {
    setCopySource({ deathRecordId, bossName, deathDate });
  }, []);

  const handleCopyCancel = useCallback(() => {
    setCopySource(null);
    setCopyConfirm(null);
  }, []);

  const handleCopyTargetClick = useCallback((deathRecordId: string, bossName: string) => {
    if (!copySource) return;
    if (deathRecordId === copySource.deathRecordId) {
      setCopyToast({ type: "error", message: "Can't copy to the same boss." });
      return;
    }
    setCopyConfirm({ deathRecordId, bossName });
  }, [copySource]);

  const handleCopyConfirm = useCallback(async () => {
    if (!copySource || !copyConfirm) return;
    try {
      const result = await copyAttendance.mutateAsync({
        sourceDeathRecordId: copySource.deathRecordId,
        targetDeathRecordId: copyConfirm.deathRecordId,
      });
      setCopyToast({ type: "success", message: `Copied ${result.copied} attendance${result.copied !== 1 ? "s" : ""}${result.skipped > 0 ? ` (${result.skipped} already present)` : ""}.` });
    } catch (err: any) {
      setCopyToast({ type: "error", message: err?.message ?? "Failed to copy attendance." });
    }
    setCopySource(null);
    setCopyConfirm(null);
  }, [copySource, copyConfirm, copyAttendance]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!copyToast) return;
    const t = setTimeout(() => setCopyToast(null), 3500);
    return () => clearTimeout(t);
  }, [copyToast]);

  // ESC to exit copy mode or close confirm modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (copyConfirm) { setCopyConfirm(null); return; }
      if (copySource) { handleCopyCancel(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copySource, copyConfirm]);

  // Edit death time modal
  const [editDeath, setEditDeath] = useState<{ deathRecordId: string; bossName: string; deathTime: string } | null>(null);
  const [editDeathDate, setEditDeathDate] = useState("");
  const [editDeathSaving, setEditDeathSaving] = useState(false);
  const [editToast, setEditToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Auto-dismiss toast after 3s
  useEffect(() => {
    if (!editToast) return;
    const t = setTimeout(() => setEditToast(null), 3000);
    return () => clearTimeout(t);
  }, [editToast]);

  // Edit display guild on death record
  const [editGuildDeath, setEditGuildDeath] = useState<{ deathRecordId: string; bossName: string; currentGuildId: string | null; deathTime?: string } | null>(null);
  const [editGuildSaving, setEditGuildSaving] = useState(false);
  const [, setGuildChangeKey] = useState(0);
  // Local override map for immediate UI feedback on guild changes
  const guildOverrides = useRef<Map<string, string | null>>(new Map());

  const handleSetDisplayGuild = async (guildId: string | null) => {
    if (!editGuildDeath) return;
    setEditGuildSaving(true);
    try {
      if (guildId) {
        await setDeathDisplayGuild(editGuildDeath.deathRecordId, guildId);
        const oldGuild = guilds.find(g => g.id === editGuildDeath.currentGuildId)?.name || editGuildDeath.currentGuildId || "(none)";
        const newGuild = guilds.find(g => g.id === guildId)?.name || guildId;
        const deathTimeStr = editGuildDeath.deathTime ? new Date(editGuildDeath.deathTime).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + new Date(editGuildDeath.deathTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
        writeAuditEntry({ action: AuditAction.DEATH_GUILD_SET, server_id: getCurrentServerId()!, target_id: editGuildDeath.deathRecordId, details: { boss_name: editGuildDeath.bossName, old_guild: oldGuild, new_guild: newGuild, death_time: deathTimeStr } });
        guildOverrides.current.set(editGuildDeath.deathRecordId, guildId);
      } else {
        const { error } = await supabase
          .from("death_records")
          .update({ display_owner_guild_id: null })
          .eq("id", editGuildDeath.deathRecordId);
        if (error) throw error;
        writeAuditEntry({ action: AuditAction.DEATH_GUILD_CLEAR, server_id: getCurrentServerId()!, target_id: editGuildDeath.deathRecordId, details: { boss_name: editGuildDeath.bossName } });
        guildOverrides.current.set(editGuildDeath.deathRecordId, null);
      }
      queryClient.invalidateQueries({ queryKey: ["death_records"] });
      setGuildChangeKey(k => k + 1);
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
      if (editDeath.bossName) {
        const formatted = newTime.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + newTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        writeAuditEntry({ action: AuditAction.DEATH_TIME_EDIT, server_id: getCurrentServerId()!, target_id: editDeath.deathRecordId, details: { boss_name: editDeath.bossName, old_time: editDeath.deathTime, new_time: newTime.toISOString(), formatted_time: formatted } });
      }
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
  const [guildsLoading, setGuildsLoading] = useState(true);

  useEffect(() => {
    const sid = currentServer?.id;
    if (!sid) return;
    setGuildsLoading(true);
    Promise.all([fetchGuilds(sid), fetchBossGuilds(sid)])
      .then(([g, bg]) => { setGuilds(g); setBossGuilds(bg); })
      .catch(() => { setGuilds([]); setBossGuilds([]); })
      .finally(() => setGuildsLoading(false));
  }, [currentServer?.id]);

  // Build minimal SpawnInfo[] so rotation.ts can access boss data (rotation_counter, etc.)
  const spawnMap = useMemo(() => bosses.map(b => ({
    boss: b,
    nextSpawn: null as Date | null,
    status: "unknown" as const,
    deathRecord: null,
  })), [bosses]);

  const getOwnerGuildName = useCallback((bossId: string, dayOfWeek?: number): string | undefined => {
    return getOwnerGuildNameLib(bossId, bossGuilds, guilds, deathRecords, spawnMap, dayOfWeek, currentServer?.timezone);
  }, [bossGuilds, guilds, deathRecords, spawnMap, currentServer?.timezone]);

  const recordDeath = useRecordDeath(insertDeathRecord, addAttendance);

  const handleRecordDeath = useCallback(
    async (bossId: string, deathTime: Date, rallyImages: File[], attendeeIds: string[], scanResults?: import("@/types").ScanResults | null) => {
      if (!user && !isViewer) return;
      const boss = bosses.find((b) => b.id === bossId);
      if (!boss) return;
      setSavingMessage("Recording death...");
      try {
        const ownerGuildName = getOwnerGuildName(boss.id) ?? undefined;
        const resolvedGuildId = ownerGuildName ? guilds.find(g => g.name === ownerGuildName)?.id ?? null : null;
        await recordDeath({
          bossId,
          bossName: boss.name,
          deathTime,
          attendeeIds,
          ownerGuildName: resolvedGuildId || "",
          scanResults,
          rallyImages,
          notifyDiscordChannel: false, // WeeklySchedule handles its own notification
        });

        // WeeklySchedule-specific: manual Discord notification
        const sid = getCurrentServerId();
        if (sid) {
          notifyDiscord(sid, "boss_died", {
            boss_name: boss.name,
            attendees: attendeeIds.length > 0 ? [`${attendeeIds.length} participant(s)`] : undefined,
            guild_name: ownerGuildName,
          });
        }
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
    // deathMap: latest per boss (for spawn calculation in step 2)
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
      for (const dr of allDeathRecords) {
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
              // All fixed_schedule bosses now store times in UTC
              const spawnDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), h, m));

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
        activities: [],
      });
    }

    // ── Activities: slot into the correct day ──────────────
    const lastInstanceMap = new Map<string, ActivityInstance>();
    const activityMap = new Map<string, Activity>();
    for (const a of activities) activityMap.set(a.id, a);
    for (const inst of activityInstances) {
      const existing = lastInstanceMap.get(inst.activity_id);
      if (!existing || new Date(inst.start_time) > new Date(existing.start_time)) {
        lastInstanceMap.set(inst.activity_id, inst);
      }
    }

    for (const a of activities) {
      const info = calculateActivityInfo(a, lastInstanceMap.get(a.id) ?? null);
      const activityDate = info.startTime;
      // Find which day this activity falls on
      for (const day of days) {
        if (activityDate.toDateString() === day.date.toDateString()) {
          day.activities.push(info);
          break;
        }
      }
    }

    // ── Finished activity instances (like death records) ──
    // Only add for activities where calculateActivityInfo didn't already return completed
    for (const inst of activityInstances) {
      if (!inst.end_time) continue;
      const activity = activityMap.get(inst.activity_id);
      if (!activity) continue;
      const calcInfo = calculateActivityInfo(activity, lastInstanceMap.get(activity.id) ?? null);
      if (calcInfo.status === "completed") continue; // already handled above
      
      const endDate = new Date(inst.end_time);
      for (const day of days) {
        if (endDate.toDateString() === day.date.toDateString()) {
          day.activities.push({
            activity,
            activityInstance: inst,
            startTime: endDate,
            status: "completed" as const,
          });
          break;
        }
      }
    }

    return days;
  }, [bosses, deathRecords, allDeathRecords, weekOffset, activities, activityInstances]);

  const isLoading = bossesLoading || recordsLoading || guildsLoading || attendanceLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[100%] 2xl:max-w-[1600px] mx-auto px-4 py-6">
      {/* Saving overlay � blocks all interaction */}
      {savingMessage && <SavingOverlay message={savingMessage} />}

      {/* Copy-in-progress overlay */}
      {copyAttendance.isPending && <SavingOverlay message="Copying attendance..." />}

      {/* Copy-mode banner */}
      {copySource && (
        <div className="mb-4 p-3 rounded-lg bg-blue-900/20 border border-blue-700/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[#d4d4d8]">
            <CopyCheck className="w-4 h-4 text-blue-400" />
            <span>Copying attendance from <span className="font-semibold text-[#fafafa]">{copySource.bossName}</span> ({copySource.deathDate}). Click a killed boss to paste.</span>
          </div>
          <button onClick={handleCopyCancel} className="shrink-0 p-1 rounded hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Copy toast */}
      {copyToast && (
        <div className={`mb-4 p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${copyToast.type === "success" ? "bg-emerald-900/20 border border-emerald-700/40 text-emerald-400" : "bg-red-900/20 border border-red-700/40 text-red-400"}`}>
          {copyToast.type === "success" ? <CheckCheck className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
          {copyToast.message}
        </div>
      )}

      {/* Copy confirm dialog */}
      {copyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setCopyConfirm(null)}>
          <div className="bg-[#18181b] border border-[#3f3f46] rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[#fafafa] font-semibold mb-2">Copy Attendance</h3>
            <p className="text-sm text-[#a1a1aa] mb-4">
              Copy all attendance from <span className="text-[#fafafa] font-medium">{copySource?.bossName}</span> to <span className="text-[#fafafa] font-medium">{copyConfirm.bossName}</span>?
            </p>
            <p className="text-[11px] text-[#71717a] mb-5">Members already on the target will be skipped.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCopyConfirm(null)} disabled={copyAttendance.isPending} className="px-4 py-2 rounded-lg text-sm bg-[#27272a] text-[#d4d4d8] hover:bg-[#3f3f46] transition">Cancel</button>
              <button onClick={handleCopyConfirm} disabled={copyAttendance.isPending} className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60 transition flex items-center gap-2">
                {copyAttendance.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-[#fafafa]">Weekly Schedule</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => { setWeekLoading(true); setWeekOffset(w => w - 1); }} disabled={prevWeekDisabled} className="px-3 py-1.5 rounded-lg text-xs bg-[#18181b] border border-[#27272a] text-[#d4d4d8] hover:bg-[#27272a] disabled:opacity-30 disabled:cursor-not-allowed transition">← Previous Week</button>
          <span className="text-sm text-[#a1a1aa] font-medium">{weekOffset === 0 ? "This Week" : weekOffset === 1 ? "Next Week" : weekOffset > 0 ? `${weekOffset} weeks ahead` : weekOffset === -1 ? "Last Week" : `${Math.abs(weekOffset)} weeks ago`}</span>
          <button onClick={() => { setWeekLoading(true); setWeekOffset(w => w + 1); }} disabled={nextWeekDisabled} className="px-3 py-1.5 rounded-lg text-xs bg-[#18181b] border border-[#27272a] text-[#d4d4d8] hover:bg-[#27272a] disabled:opacity-30 disabled:cursor-not-allowed transition">Next Week →</button>
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
                  {day.date.toLocaleDateString("en-US", { timeZone: userTz,
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              {day.isToday && (
                <span className="text-[10px] font-medium text-[#71717a]">Today</span>
              )}
            </div>

            {day.spawns.length === 0 && day.activities.length === 0 ? (
              <p className="text-[#52525b] text-sm">No events</p>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const items: ({ type: "spawn"; data: SpawnInfo; idx: number } | { type: "activity"; data: typeof day.activities[0]; idx: number })[] = [];
                  day.spawns.forEach((s, i) => items.push({ type: "spawn", data: s, idx: i }));
                  day.activities.forEach((info, i) => {
                    if (info.status !== "countdown" && info.status !== "active" && info.status !== "completed") return;
                    items.push({ type: "activity", data: info, idx: i });
                  });
                  items.sort((a, b) => {
                    const aTime = a.type === "spawn" ? a.data.nextSpawn?.getTime() ?? 0 : a.data.startTime.getTime();
                    const bTime = b.type === "spawn" ? b.data.nextSpawn?.getTime() ?? 0 : b.data.startTime.getTime();
                    return aTime - bTime;
                  });

                  return items.map((item) => {
                    if (item.type === "spawn") {
                      const s = item.data as SpawnInfo;
                      const isDeathEvent = s.deathRecord !== null && !s.deathRecord.is_initial_spawn && s.nextSpawn?.getTime() === new Date(s.deathRecord.death_time).getTime();
                      const isScheduleBoss = s.boss.spawn_type === "fixed_schedule";
                      const isCopyTarget = copySource !== null && isDeathEvent && !!s.deathRecord && s.deathRecord.id !== copySource.deathRecordId && !isViewer;
                      const isCopySource = copySource?.deathRecordId === s.deathRecord?.id;
                      const attCount = s.deathRecord ? (attendanceCounts?.get(s.deathRecord.id) ?? 0) : 0;
                      return (
                      <div key={`boss-m-${s.boss.id}-${item.idx}`}
                        onClick={() => {
                          if (isCopyTarget) {
                            handleCopyTargetClick(s.deathRecord!.id, s.boss.name);
                          } else if (isDeathEvent && s.deathRecord && !currentServer?.isExpired) {
                            setSelectedDeath({ deathRecordId: s.deathRecord.id, bossName: s.boss.name, deathTime: s.deathRecord.death_time, ownerGuildId: s.deathRecord.display_owner_guild_id ?? s.deathRecord.owner_guild_id ?? null });
                          } else if ((!isViewer || viewerCanMarkDied) && !currentServer?.isExpired) {
                            setMarkBoss({ boss: s.boss, spawnTime: isScheduleBoss ? s.nextSpawn ?? undefined : undefined });
                          }
                        }}
                        className={`flex items-center justify-between py-1.5 px-2 rounded-lg transition-all duration-200 ${
                          isCopySource ? "bg-blue-900/20 border border-blue-700/50" :
                          isCopyTarget ? "bg-[#0d0d10] border border-blue-700/30 cursor-pointer hover:bg-blue-900/20 hover:border-blue-600/50" :
                          isDeathEvent ? "bg-[#0d0d10] border border-[#27272a] cursor-pointer hover:bg-[#18181b]" :
                          (isViewer && !viewerCanMarkDied) ? "bg-[#18181b] cursor-default opacity-60" :
                          "bg-[#1c1c20] border border-[#27272a] cursor-pointer hover:bg-[#27272a] hover:border-[#52525b] hover:scale-[1.01]"
                        }`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isDeathEvent ? "bg-[#a1a1aa]" : "bg-[#a1a1aa]"}`} />
                          <span className="text-[#fafafa] text-sm">{s.boss.name}</span>
                          {isDeathEvent && (
                            <span className="text-[10px] text-red-400 inline-flex items-center gap-1">
                              Killed <Users className="w-3 h-3" />
                              {attCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-700/50 text-[#6ee7b7] text-[9px] font-bold">
                                  <CheckCheck className="w-2.5 h-2.5" />{attCount}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <span className="text-[#a1a1aa] text-sm">{s.nextSpawn?.toLocaleTimeString("en-US", { timeZone: userTz, hour: "2-digit", minute: "2-digit" })}</span>
                            {(() => {
                              let gName: string | null | undefined;
                              if (isDeathEvent && s.deathRecord) {
                                const override = guildOverrides.current.get(s.deathRecord.id);
                                const gid = override !== undefined ? override : (s.deathRecord.display_owner_guild_id ?? s.deathRecord.owner_guild_id);
                                gName = guilds.find(g => g.id === gid)?.name;
                              }
                              else { gName = getOwnerGuildName(s.boss.id, day.day); }
                              if (!gName) return null;
                              return <div className={`text-[10px] font-medium ${guildColor(gName).text}`}>{gName}</div>;
                            })()}
                          </div>
                          {isDeathEvent && s.deathRecord && !isCopyTarget && attCount > 0 && !isViewer && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopyStart(s.deathRecord!.id, s.boss.name, new Date(s.deathRecord!.death_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })); }}
                              className="p-1 rounded hover:bg-[#27272a] text-[#52525b] hover:text-[#a1a1aa] transition"
                              title="Copy attendance to another boss"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                          {isCopyTarget && !isViewer && (
                            <span className="text-[10px] text-blue-400 font-medium">Paste here</span>
                          )}
                        </div>
                      </div>
                    );} else {
                      const info = item.data as typeof day.activities[0];
                      return (
                      <button key={`act-m-${item.idx}`} onClick={() => {
                        if (info.status === "completed" && info.activityInstance?.id) {
                          setSelectedActivityInstance({ activityInstanceId: info.activityInstance.id, activityName: info.activity.name, endTime: info.activityInstance.end_time ?? info.startTime.toISOString() });
                        } else {
                          setMarkActivity({ activity: info.activity, activityName: info.activity.name });
                        }
                      }} className={`w-full text-left flex items-center justify-between text-xs rounded px-2 py-1.5 cursor-pointer hover:brightness-110 transition ${
                        info.status === "active" ? "bg-emerald-900/20 border border-emerald-800/50" :
                        info.status === "completed" ? "bg-[#0d0d10] border border-[#27272a]" :
                        "bg-blue-900/20 border border-blue-800/50"
                      }`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[#fafafa] font-medium truncate">{info.activity.name}</span>
                            <span className={`shrink-0 ml-2 ${info.status === "active" ? "text-emerald-400" : info.status === "completed" ? "text-[#a1a1aa]" : "text-blue-400"}`}>
                              {info.status === "countdown" ? info.startTime.toLocaleTimeString("en-US", { timeZone: userTz, hour: "2-digit", minute: "2-digit" }) :
                               info.status === "active" ? "Active" :
                               info.startTime.toLocaleTimeString("en-US", { timeZone: userTz, hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          {info.status === "completed" && (
                            <span className="text-[10px] text-red-400 font-medium flex items-center gap-1">Finished <CheckCheck className="w-3 h-3" /></span>
                          )}
                        </div>
                      </button>
                    );}
                  });
                })()}
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
                {day.date.toLocaleDateString("en-US", { timeZone: userTz,
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>

            {/* Spawns & Activities — merged and sorted by time */}
            <div className="p-2 space-y-1.5 min-h-[120px]">
              {(day.spawns.length === 0 && day.activities.length === 0) ? (
                <p className="text-[#3f3f46] text-xs text-center py-4 italic">No events</p>
              ) : (
                (() => {
                  // Merge spawns and activities into a single time-sorted list
                  const items: ({ type: "spawn"; data: SpawnInfo; idx: number } | { type: "activity"; data: typeof day.activities[0]; idx: number })[] = [];
                  day.spawns.forEach((s, i) => items.push({ type: "spawn", data: s, idx: i }));
                  day.activities.forEach((info, i) => {
                    if (info.status !== "countdown" && info.status !== "active" && info.status !== "completed") return;
                    items.push({ type: "activity", data: info, idx: i });
                  });
                  items.sort((a, b) => {
                    const aTime = a.type === "spawn" ? a.data.nextSpawn?.getTime() ?? 0 : a.data.startTime.getTime();
                    const bTime = b.type === "spawn" ? b.data.nextSpawn?.getTime() ?? 0 : b.data.startTime.getTime();
                    return aTime - bTime;
                  });

                  return items.map((item) => {
                    if (item.type === "spawn") {
                      const s = item.data as SpawnInfo;
                      const isDeathEvent = s.deathRecord !== null && !s.deathRecord.is_initial_spawn && s.nextSpawn?.getTime() === new Date(s.deathRecord.death_time).getTime();
                      const isScheduleBoss = s.boss.spawn_type === "fixed_schedule";
                      const isCopyTarget = copySource !== null && isDeathEvent && !!s.deathRecord && s.deathRecord.id !== copySource.deathRecordId && !isViewer;
                      const isCopySource = copySource?.deathRecordId === s.deathRecord?.id;
                      const attCount = s.deathRecord ? (attendanceCounts?.get(s.deathRecord.id) ?? 0) : 0;
                      return (
                      <div
                        key={`boss-${s.boss.id}-${item.idx}`}
                        onClick={() => {
                          if (isCopyTarget) {
                            handleCopyTargetClick(s.deathRecord!.id, s.boss.name);
                          } else if (isDeathEvent && s.deathRecord && !currentServer?.isExpired) {
                            setSelectedDeath({
                              deathRecordId: s.deathRecord.id,
                              bossName: s.boss.name,
                              deathTime: s.deathRecord.death_time,
                              ownerGuildId: s.deathRecord.display_owner_guild_id ?? s.deathRecord.owner_guild_id ?? null,
                            });
                          } else if ((!isViewer || viewerCanMarkDied) && !currentServer?.isExpired) {
                            setMarkBoss({
                              boss: s.boss,
                              spawnTime: isScheduleBoss ? s.nextSpawn ?? undefined : undefined,
                            });
                          }
                        }}
                        className={`text-xs rounded px-1.5 py-1 transition-all duration-200 ${
                          isCopySource ? "bg-blue-900/20 border border-blue-700/50" :
                          isCopyTarget ? "bg-[#0d0d10] border border-blue-700/30 cursor-pointer hover:bg-blue-900/20 hover:border-blue-600/50" :
                          isDeathEvent
                            ? "bg-[#0d0d10] border border-[#27272a] cursor-pointer hover:bg-[#18181b]"
                            : (isViewer && !viewerCanMarkDied)
                            ? "bg-[#18181b] cursor-default opacity-60"
                            : "bg-[#1c1c20] border border-[#27272a] cursor-pointer hover:bg-[#27272a] hover:border-[#52525b] hover:scale-[1.02]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[#fafafa] font-medium truncate">{s.boss.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0 ml-1">
                            {isDeathEvent && s.deathRecord && !isCopyTarget && attCount > 0 && !isViewer && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCopyStart(s.deathRecord!.id, s.boss.name, new Date(s.deathRecord!.death_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })); }}
                                className="p-0.5 rounded hover:bg-[#3f3f46] text-[#52525b] hover:text-[#a1a1aa] transition"
                                title="Copy attendance to another boss"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                            {isCopyTarget && !isViewer && (
                              <span className="text-[9px] text-blue-400 font-medium">Paste</span>
                            )}
                            <div className="text-right">
                              <div className="text-[#a1a1aa]">
                                {s.nextSpawn?.toLocaleTimeString("en-US", { timeZone: userTz, hour: "2-digit", minute: "2-digit" })}
                              </div>
                              {(() => {
                                let gName: string | null | undefined;
                                if (isDeathEvent && s.deathRecord) {
                                  const override = guildOverrides.current.get(s.deathRecord.id);
                                  const gid = override !== undefined ? override : (s.deathRecord.display_owner_guild_id ?? s.deathRecord.owner_guild_id);
                                  gName = guilds.find(g => g.id === gid)?.name;
                                } else {
                                  gName = getOwnerGuildName(s.boss.id, day.day);
                                }
                                if (!gName) return null;
                                return <div className={`text-[9px] font-medium ${guildColor(gName).text}`}>{gName}</div>;
                              })()}
                            </div>
                          </div>
                        </div>
                        {isDeathEvent && (
                          <span className="text-[10px] text-red-400 font-medium flex items-center gap-1">
                            Killed <Users className="w-3 h-3" />
                            {attCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-700/50 text-[#6ee7b7] text-[9px] font-bold">
                                <CheckCheck className="w-2.5 h-2.5" />{attCount}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    )} else {
                      const info = item.data as typeof day.activities[0];
                      return (
                      <button key={`act-${item.idx}`} onClick={() => {
                        if (info.status === "completed" && info.activityInstance?.id) {
                          setSelectedActivityInstance({ activityInstanceId: info.activityInstance.id, activityName: info.activity.name, endTime: info.activityInstance.end_time ?? info.startTime.toISOString() });
                        } else {
                          setMarkActivity({ activity: info.activity, activityName: info.activity.name });
                        }
                      }} className={`w-full text-left text-xs rounded px-1.5 py-1 cursor-pointer hover:brightness-110 transition ${
                        info.status === "active" ? "bg-emerald-900/20 border border-emerald-800/50" :
                        info.status === "completed" ? "bg-[#0d0d10] border border-[#27272a]" :
                        "bg-blue-900/20 border border-blue-800/50"
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[#fafafa] font-medium truncate">{info.activity.name}</span>
                          <span className={`shrink-0 ml-1 ${
                            info.status === "active" ? "text-emerald-400" :
                            info.status === "completed" ? "text-[#a1a1aa]" :
                            "text-blue-400"
                          }`}>
                            {info.status === "countdown" ? info.startTime.toLocaleTimeString("en-US", { timeZone: userTz, hour: "2-digit", minute: "2-digit" }) :
                             info.status === "active" ? "Active" :
                             info.startTime.toLocaleTimeString("en-US", { timeZone: userTz, hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {info.status === "completed" && (
                          <span className="text-[10px] text-red-400 font-medium flex items-center gap-1">
                            Finished <CheckCheck className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    );}
                  });
                })()
              )}
            </div>
          </div>
        ))}
      </div>

      </> )}

      {/* Participant Modal */}
      {selectedDeath && (
        <ParticipantModal
          deathRecordId={selectedDeath.deathRecordId}
          bossName={selectedDeath.bossName}
          deathTime={selectedDeath.deathTime}
          ownerGuildId={selectedDeath.ownerGuildId ?? null}
          onClose={() => setSelectedDeath(null)}
          readOnly={isViewer}
          onEditDeathTime={!isViewer ? () => {
            const dt = new Date(selectedDeath.deathTime);
            const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            setEditDeathDate(local);
            setEditDeath({ deathRecordId: selectedDeath.deathRecordId, bossName: selectedDeath.bossName, deathTime: selectedDeath.deathTime });
          } : undefined}
          onChangeGuild={!isViewer ? () => {
            setEditGuildDeath({ deathRecordId: selectedDeath.deathRecordId, bossName: selectedDeath.bossName, currentGuildId: selectedDeath.ownerGuildId ?? null, deathTime: selectedDeath.deathTime });
          } : undefined}
        />
      )}

      {/* Activity Instance Participant Modal (finished activities) */}
      {selectedActivityInstance && (
        <ParticipantModal
          deathRecordId=""
          bossName={selectedActivityInstance.activityName}
          deathTime={selectedActivityInstance.endTime}
          activityInstanceId={selectedActivityInstance.activityInstanceId}
          onClose={() => setSelectedActivityInstance(null)}
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
          onSubmit={(deathTime, rallyImages, attendeeIds, _partyLeaders, scanResults) => {
            handleRecordDeath(markBoss.boss.id, deathTime, rallyImages, attendeeIds, scanResults);
            setMarkBoss(null);
          }}
        />
      )}

      {/* Record Activity End Modal */}
      {markActivity && (
        <DeathRecordModal
          boss={markActivity.activity as any}
          isActivity
          activityName={markActivity.activityName}
          onClose={() => setMarkActivity(null)}
          onSubmit={async (endTime, _rallyImages, attendeeIds) => {
            try {
              await recordActivityEnd(markActivity.activity.id, endTime, attendeeIds);
              queryClient.invalidateQueries({ queryKey: ["activities"] });
              queryClient.invalidateQueries({ queryKey: ["activity_instances"] });
              setMarkActivity(null);
            } catch (err: any) {
              console.error("Failed to record activity end:", err);
            }
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

      {/* Toast for guild/time edits */}
      {editToast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg border ${
            editToast.type === "success"
              ? "bg-emerald-950/90 border-emerald-800 text-emerald-200"
              : "bg-red-950/90 border-red-800 text-red-200"
          }`}>
            {editToast.type === "success"
              ? <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              : <X className="w-4 h-4 text-red-400 shrink-0" />
            }
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
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition flex items-center gap-2 ${editGuildDeath.currentGuildId === null ? "bg-violet-500/10 text-violet-300 font-medium" : "text-[#a1a1aa] hover:bg-[#27272a]"}`}
              >
                {editGuildDeath.currentGuildId === null && <Check className="w-3.5 h-3.5 shrink-0" />}
                None (use rotation)
              </button>
              {guilds.map((g) => {
                const isSelected = editGuildDeath.currentGuildId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => handleSetDisplayGuild(g.id)}
                    disabled={editGuildSaving}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition flex items-center gap-2 ${isSelected ? "bg-violet-500/10 text-violet-300 font-medium" : "text-[#d4d4d8] hover:bg-[#27272a]"}`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
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
