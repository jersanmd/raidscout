import { useState, useCallback, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBossSpawns } from "@/hooks/useBossSpawns";
import { useDeathRecords } from "@/hooks/useDeathRecords";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import {
  insertDeathRecord,
  addAttendance,
  getCurrentServerId,
  notifyDiscord,
  announceSpawns,
  supabase,
  fetchBossGuilds,
  fetchGuilds,
  setBossSpawnTime,
} from "@/lib/supabase";
import { BossCard } from "@/components/BossCard";
import { DeathRecordModal } from "@/components/DeathRecordModal";
import { FilterBar } from "@/components/FilterBar";
import { UpcomingStrip } from "@/components/UpcomingStrip";
import { SavingOverlay } from "@/components/SavingOverlay";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { emitSpawnAlert } from "@/hooks/useSpawnAlerts";
import { Skull, Loader2, Zap, X, CheckCircle, AlertTriangle, CheckSquare, Square, Megaphone, Volume2 } from "lucide-react";
import type { BossWithSpawn, BossGuild, Guild, DeathRecord } from "@/types";

export function BossListView() {
  const { user, isViewer } = useAuth();
  const { currentServer } = useServer();
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterWindow, setFilterWindow] = useState<number | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [multiMode, setMultiMode] = useState(false);

  // Announce bosses in 24h state
  const [showAnnounceConfirm, setShowAnnounceConfirm] = useState(false);
  const [announceLoading, setAnnounceLoading] = useState(false);

  // Guild data for boss ownership badges
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [bossGuilds, setBossGuilds] = useState<BossGuild[]>([]);
  const [hasWebhook, setHasWebhook] = useState(false);

  useEffect(() => {
    const sid = currentServer?.id;
    if (!sid) return;
    Promise.all([fetchGuilds(sid), fetchBossGuilds(sid)])
      .then(([g, bg]) => { setGuilds(g); setBossGuilds(bg); })
      .catch(() => { setGuilds([]); setBossGuilds([]); });
    // Check if server has a Discord webhook
    const checkWebhook = async () => {
      try {
        const { data } = await supabase.from("servers").select("discord_webhook_url").eq("id", sid).single();
        setHasWebhook(!!(data as any)?.discord_webhook_url);
      } catch { setHasWebhook(false); }
    };
    checkWebhook();
  }, [currentServer?.id]);

  const toggleSelect = (bossId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bossId)) next.delete(bossId);
      else next.add(bossId);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Global saving overlay
  const [savingMessage, setSavingMessage] = useState<string | null>(null);

  // Bulk death modal
  const [showBulkDeathModal, setShowBulkDeathModal] = useState(false);

  // Toast notification
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const { spawns, isLoading } = useBossSpawns(searchText, filterType, refreshKey);
  const { data: deathRecords = [] } = useDeathRecords();

  const bulkBoss = useMemo(() => {
    if (selectedIds.size === 0) return null;
    const firstSpawn = spawns.find(s => selectedIds.has(s.boss.id));
    return firstSpawn?.boss ?? null;
  }, [selectedIds, spawns]);

  // Apply window filter client-side — always keep alive & unknown bosses visible
  const filteredSpawns = useMemo(() => {
    if (filterWindow === null) return spawns;
    const cutoff = Date.now() + filterWindow * 3600_000;
    return spawns.filter(
      (s) =>
        s.status === "alive" ||
        s.status === "unknown" ||
        (s.status === "countdown" && s.nextSpawn && s.nextSpawn.getTime() <= cutoff)
    );
  }, [spawns, filterWindow]);

  // Bosses spawning in the next 24 hours (for announce feature)
  const spawnsIn24h = useMemo(() => {
    const cutoff = Date.now() + 24 * 3600_000;
    return spawns
      .filter(
        (s) =>
          s.status === "alive" ||
          (s.status === "countdown" && s.nextSpawn && s.nextSpawn.getTime() <= cutoff)
      )
      .sort((a, b) => {
        // Alive bosses first, then by spawn time
        if (a.status === "alive" && b.status !== "alive") return -1;
        if (b.status === "alive" && a.status !== "alive") return 1;
        const aTime = a.nextSpawn?.getTime() ?? 0;
        const bTime = b.nextSpawn?.getTime() ?? 0;
        return aTime - bTime;
      });
  }, [spawns]);

  // Compute owner guild name for a boss
  const getOwnerGuildName = useCallback((bossId: string): string | undefined => {
    const bgs = bossGuilds.filter(bg => bg.boss_id === bossId);
    if (bgs.length === 0) return undefined;

    // Schedule mode: guild based on boss's spawn day of week
    const scheduleEntries = bgs.filter(bg => bg.day_of_week !== null);
    if (scheduleEntries.length > 0) {
      const spawn = spawns.find(s => s.boss.id === bossId);
      const spawnDate = spawn?.status === "alive" ? new Date() : (spawn?.nextSpawn ?? new Date());
      const dow = spawnDate.getDay();
      const match = scheduleEntries.find(bg => bg.day_of_week === dow);
      if (match) return guilds.find(g => g.id === match.guild_id)?.name;
    }

    // Daily mode: advance guild only when spawn crosses into a new day
    const dailyEntries = bgs.filter(bg => bg.mode === "daily").sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (dailyEntries.length > 0) {
      const lastDeath = deathRecords
        .filter(dr => dr.boss_id === bossId && !dr.is_initial_spawn)
        .sort((a, b) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];
      
      if (!lastDeath) {
        return guilds.find(g => g.id === dailyEntries[0].guild_id)?.name;
      }

      const bossData = spawns.find(s => s.boss.id === bossId)?.boss;
      const respawnHours = bossData?.respawn_hours ?? 0;
      const deathDate = new Date(lastDeath.death_time);
      const spawnDate = new Date(deathDate.getTime() + respawnHours * 3600000);

      if (deathDate.toDateString() === spawnDate.toDateString()) {
        const lastGuildId = (lastDeath as any).owner_guild_id;
        return lastGuildId ? guilds.find(g => g.id === lastGuildId)?.name : guilds.find(g => g.id === dailyEntries[0].guild_id)?.name;
      }

      const lastGuildId = (lastDeath as any).owner_guild_id;
      if (!lastGuildId) return guilds.find(g => g.id === dailyEntries[0].guild_id)?.name;
      
      const lastIdx = dailyEntries.findIndex(bg => bg.guild_id === lastGuildId);
      const nextIdx = lastIdx >= 0 ? (lastIdx + 1) % dailyEntries.length : 0;
      return guilds.find(g => g.id === dailyEntries[nextIdx].guild_id)?.name;
    }

    // Rotation mode: advance by number of kills
    const rotationEntries = bgs.filter(bg => bg.sort_order !== null && bg.mode !== "daily").sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (rotationEntries.length > 0) {
      const killCount = deathRecords.filter(dr => dr.boss_id === bossId && !dr.is_initial_spawn).length;
      const idx = killCount % rotationEntries.length;
      return guilds.find(g => g.id === rotationEntries[idx].guild_id)?.name;
    }

    return undefined;
  }, [bossGuilds, guilds, deathRecords, spawns]);

  const handleRecordDeath = useCallback(
    async (bossId: string, deathTime: Date, rallyImages: File[], attendeeIds: string[]) => {
      // Log to history (without deathRecordId initially)
      const boss = spawns.find((s) => s.boss.id === bossId)?.boss;
      if (!boss) return;
      const respawnTime = boss.respawn_hours
        ? new Date(deathTime.getTime() + boss.respawn_hours * 3600_000)
        : deathTime;

      let deathRecordId: string;

      if (user || isViewer) {
        setSavingMessage("Recording death...");
        try {
          const ownerGuildName = getOwnerGuildName(boss.id);
          const ownerGuildId = ownerGuildName ? guilds.find(g => g.name === ownerGuildName)?.id ?? null : null;
          const record = await insertDeathRecord(bossId, deathTime, ownerGuildId);
          deathRecordId = record.id;

          // Record attendance — collect errors instead of silently swallowing
          const attendanceErrors: string[] = [];
          for (const memberId of attendeeIds) {
            try {
              await addAttendance(deathRecordId, memberId);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              attendanceErrors.push(msg);
              console.error("Failed to add attendance for member:", memberId, err);
            }
          }

          if (attendanceErrors.length > 0) {
            setToast({
              type: "error",
              message: `Attendance partially saved: ${attendeeIds.length - attendanceErrors.length}/${attendeeIds.length} succeeded.`,
            });
          } else {
            setToast({
              type: "success",
              message: `Death recorded${attendeeIds.length > 0 ? ` with ${attendeeIds.length} attendee${attendeeIds.length !== 1 ? "s" : ""}` : ""}!`,
            });
          }

          queryClient.invalidateQueries({ queryKey: ["death_records"] });
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
          queryClient.invalidateQueries({ queryKey: ["members"] });
          queryClient.invalidateQueries({ queryKey: ["analytics"] });

          // Send Discord notification (only for authenticated users, not viewers)
          if (user) {
            notifyDiscord(getCurrentServerId()!, "boss_died", {
              boss_name: boss.name,
              attendees: attendeeIds.length > 0 ? [`${attendeeIds.length} participant(s)`] : undefined,
              guild_name: getOwnerGuildName(boss.id),
            });
          }
        } catch (err) {
          console.error("Failed to record death:", err);
          setToast({ type: "error", message: "Failed to save death record. Check the console for details." });
        } finally {
          setSavingMessage(null);
        }
      } else {
        setToast({ type: "error", message: "Supabase not configured. Cannot record death." });
      }
    },
    [user, isViewer, queryClient, spawns, getOwnerGuildName, guilds]
  );

  const handleSetSpawnDate = useCallback(
    async (bossId: string, spawnDate: Date) => {
      setSavingMessage("Updating spawn time...");
      try {
        await setBossSpawnTime(bossId, spawnDate);
        const sid = getCurrentServerId();
        queryClient.invalidateQueries({ queryKey: ["death_records", sid] });
        queryClient.invalidateQueries({ queryKey: ["boss_spawns"] });
        setRefreshKey(k => k + 1);
      } catch (err: any) {
        console.error("Failed to set spawn date:", err);
        setToast({ type: "error", message: err?.message ?? "Failed to set spawn date" });
      } finally {
        setSavingMessage(null);
      }
    },
    [queryClient]
  );

  const handleBulkRecordDeath = useCallback(
    async (deathTime: Date, rallyImages: File[], attendeeIds: string[]) => {
      setSavingMessage("Recording deaths...");
      const bossIds = [...selectedIds];
      let successCount = 0;
      for (const bossId of bossIds) {
        try {
          await handleRecordDeath(bossId, deathTime, rallyImages, attendeeIds);
          successCount++;
        } catch (err) {
          console.error(`Failed to record death for boss ${bossId}:`, err);
        }
      }
      setToast({
        type: "success",
        message: `${successCount}/${bossIds.length} boss${bossIds.length !== 1 ? "es" : ""} marked as died${attendeeIds.length > 0 ? ` with ${attendeeIds.length} attendee${attendeeIds.length !== 1 ? "s" : ""}` : ""}!`,
      });
      clearSelection();
      setMultiMode(false);
      setSavingMessage(null);
    },
    [selectedIds, handleRecordDeath, clearSelection]
  );

  // Bulk mark all fixed-hours bosses as alive (maintenance reset)
  const handleMarkAllDied = useCallback(async () => {
    setBulkLoading(true);
    setSavingMessage("Making all bosses alive...");
    const serverId = getCurrentServerId();
    if (!serverId) {
      setBulkLoading(false);
      setSavingMessage(null);
      setShowBulkModal(false);
      return;
    }

    try {
      await supabase.rpc("make_bosses_alive", { s_id: serverId });

      // Notify Discord that all bosses have been reset
      notifyDiscord(serverId, "boss_spawned", {
        boss_name: "All Bosses",
        spawn_time: new Date().toLocaleString(),
      });
    } catch (err) {
      console.error("Bulk make alive failed:", err);
    } finally {
      queryClient.invalidateQueries({ queryKey: ["death_records"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      setShowBulkModal(false);
      setBulkLoading(false);
      setSavingMessage(null);
    }
  }, [queryClient]);

  // Announce 24h spawns to Discord
  const handleAnnounceSpawns = useCallback(async () => {
    const sid = getCurrentServerId();
    if (!sid || spawnsIn24h.length === 0) return;

    setAnnounceLoading(true);
    try {
      const bosses = spawnsIn24h.map((s) => ({
        name: s.boss.name,
        spawn_time: s.status === "alive"
          ? "Now (Alive)"
          : s.nextSpawn
            ? s.nextSpawn.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
            : "Unknown",
        unix_spawn_time: s.nextSpawn ? Math.floor(s.nextSpawn.getTime() / 1000) : undefined,
        guild_name: getOwnerGuildName(s.boss.id),
      }));

      await announceSpawns(sid, bosses);
      setToast({ type: "success", message: `${bosses.length} boss spawns announced to Discord!` });
    } catch (err) {
      console.error("Announce spawns failed:", err);
      setToast({ type: "error", message: "Failed to announce to Discord. Check webhook configuration." });
    } finally {
      setAnnounceLoading(false);
      setShowAnnounceConfirm(false);
    }
  }, [spawnsIn24h, getOwnerGuildName]);

  const serverId = getCurrentServerId();
  // Count only fixed-hour bosses that already have a death record (these will be affected)
  const affectedCount = spawns.filter(
    (s) => s.boss.spawn_type === "fixed_hours" && s.deathRecord !== null && (!serverId || s.boss.server_id === serverId)
  ).length;

  // Group spawns by day
  const groupedSpawns = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const groups: { label: string; date: Date; spawns: BossWithSpawn[] }[] = [];

    // Always create "Today" group first
    const todayGroup: { label: string; date: Date; spawns: BossWithSpawn[] } = { label: "Today", date: today, spawns: [] };
    groups.push(todayGroup);

    for (const s of filteredSpawns) {
      if (!s.nextSpawn) continue;
      const spawnDay = s.status === "alive"
        ? today
        : new Date(s.nextSpawn.getFullYear(), s.nextSpawn.getMonth(), s.nextSpawn.getDate());
      const dayKey = spawnDay.getTime();

      if (dayKey === today.getTime()) {
        todayGroup.spawns.push(s);
        continue;
      }

      let group = groups.find((g) => g.date.getTime() === dayKey);
      if (!group) {
        const label = dayKey === tomorrow.getTime()
          ? "Tomorrow"
          : spawnDay.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
        group = { label, date: spawnDay, spawns: [] };
        groups.push(group);
      }
      group.spawns.push(s);
    }

    // Remove Today if empty (no bosses today)
    if (todayGroup.spawns.length === 0) {
      groups.shift();
    }

    // Add unknown spawns at the top
    const unknownSpawns = filteredSpawns.filter((s) => !s.nextSpawn);
    if (unknownSpawns.length > 0) {
      groups.unshift({ label: "Unknown", date: new Date(0), spawns: unknownSpawns });
    }

    return groups;
  }, [filteredSpawns]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Saving overlay — blocks all interaction */}
      {savingMessage && <SavingOverlay message={savingMessage} />}

      {/* Stats banner */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Skull className="w-5 h-5 text-red-400" />
          <span className="text-white font-bold">{spawns.length} Bosses</span>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="text-emerald-400">
            {spawns.filter((s) => s.status === "alive").length} Alive
          </span>
          <span className="text-amber-400">
            {
              spawns.filter(
                (s) => s.status === "countdown" && s.remainingMs <= 3600_000
              ).length
            }{" "}
            &lt;1h
          </span>
          <span className="text-slate-500">
            {spawns.filter((s) => s.status === "unknown").length} Unknown
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Volume2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Notification volume</span>
            <input
              type="range"
              min="0"
              max="100"
              defaultValue={parseFloat(localStorage.getItem("raidscout-alert-volume") || "0.5") * 100}
              onChange={(e) => { 
                localStorage.setItem("raidscout-alert-volume", String(parseInt(e.target.value) / 100));
              }}
              onMouseUp={() => {
                try {
                  const vol = parseFloat(localStorage.getItem("raidscout-alert-volume") || "0.5");
                  const ctx = new AudioContext();
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.connect(gain); gain.connect(ctx.destination);
                  osc.type = "square";
                  gain.gain.setValueAtTime(0.3 * vol, ctx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                  osc.frequency.setValueAtTime(800, ctx.currentTime);
                  osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.5);
                  osc.start(ctx.currentTime);
                  osc.stop(ctx.currentTime + 0.5);
                } catch {}
              }}
              className="w-16 h-1.5 accent-amber-400 cursor-pointer"
            />
          </div>
          {!isViewer && (
          <button
            onClick={() => setShowBulkModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-900/20 border border-amber-800 text-amber-400 text-xs font-medium hover:bg-amber-900/40 transition"
          >
            <Zap className="w-3.5 h-3.5" />
            Make Alive All Bosses After Maintenance
          </button>
          )}
        </div>
        {(!isViewer && (hasWebhook || currentServer?.discord_webhook_url)) && (
        <button
          onClick={() => setShowAnnounceConfirm(true)}
          disabled={spawnsIn24h.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-900/20 border border-purple-800 text-purple-400 text-xs font-medium hover:bg-purple-900/40 transition disabled:opacity-40 disabled:cursor-not-allowed"
          title={spawnsIn24h.length === 0 ? "No bosses spawning in the next 24 hours" : `Announce ${spawnsIn24h.length} boss spawns to Discord`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          Announce Bosses in 24h
        </button>
        )}
      </div>

      {/* Upcoming strip — next 3 bosses to spawn */}
      <UpcomingStrip />

      {/* Filters */}
      <FilterBar
        searchText={searchText}
        onSearchChange={setSearchText}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        filterWindow={filterWindow}
        onFilterWindowChange={setFilterWindow}
        extra={isViewer ? undefined : (
          <button
            onClick={() => { if (multiMode) clearSelection(); setMultiMode(!multiMode); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              multiMode
                ? "bg-blue-900/30 border border-blue-800 text-blue-400"
                : "bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            {multiMode ? `Selecting (${selectedIds.size})` : "Select Multiple"}
          </button>
        )}
      />

      {/* Bosses grouped by day */}
      {groupedSpawns.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg">No bosses match your filters</p>
          <button
            onClick={() => {
              setSearchText("");
              setFilterType("all");
              setFilterWindow(null);
            }}
            className="mt-2 text-red-400 hover:text-red-300 text-sm transition"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedSpawns.map((group) => (
            <section key={group.label}>
              {/* Day header */}
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                {group.label}
                <span className="text-slate-600 font-normal normal-case text-xs">
                  {group.spawns.length} boss{group.spawns.length !== 1 ? "es" : ""}
                </span>
              </h3>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.spawns.map((s) => (
                  <BossCard
                    key={s.boss.id}
                    spawn={s}
                    onRecordDeath={handleRecordDeath}
                    onSetSpawnDate={handleSetSpawnDate}
                    multiMode={multiMode}
                    selected={selectedIds.has(s.boss.id)}
                    onToggleSelect={toggleSelect}
                    ownerGuildName={getOwnerGuildName(s.boss.id)}
                    onUrgentSpawn={emitSpawnAlert}
                    onCriticalSpawn={(name) => emitSpawnAlert(`⚠️ ${name} spawning in 5s!`)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <ToastMessage toast={toast} onDismiss={() => setToast(null)} />
      )}

      {/* Bulk death modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowBulkModal(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Reset after Maintenance
              </h2>
              <button onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-white transition p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-slate-300 text-sm">
                After maintenance, all timer-based bosses respawn. This will advance the
                death time for{" "}
                <span className="text-white font-bold">{affectedCount} fixed-hour bosses</span>{" "}
                so their respawn timers expire immediately (set to &ldquo;alive&rdquo;).
                Bosses without a recorded death are skipped. Schedule-based bosses are unaffected.
              </p>
              {affectedCount === 0 && (
                <p className="text-amber-400 text-xs bg-amber-900/20 rounded-lg px-3 py-2">
                  No fixed-hour bosses have a recorded death yet — nothing to reset.
                </p>
              )}
              <p className="text-white font-mono text-lg bg-slate-800 rounded-lg px-3 py-2 text-center">
                {new Date().toLocaleString()}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBulkModal(false)}
                  disabled={bulkLoading}
                  className="flex-1 py-2.5 rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkAllDied}
                  disabled={bulkLoading || affectedCount === 0}
                  className="flex-1 py-2.5 rounded-lg font-medium bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-500 hover:to-orange-400 transition text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {bulkLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Make Alive"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Announce 24h spawns confirm dialog */}
      <ConfirmDialog
        open={showAnnounceConfirm}
        title="Announce to Discord"
        message={`This will send an @everyone announcement to your Discord server listing ${spawnsIn24h.length} boss${spawnsIn24h.length !== 1 ? "es" : ""} spawning in the next 24 hours.`}
        confirmLabel="Send Announcement"
        variant="warning"
        loading={announceLoading}
        onConfirm={handleAnnounceSpawns}
        onCancel={() => setShowAnnounceConfirm(false)}
      />

      {/* Floating multi-select action bar */}
      {multiMode && selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-slate-900 border border-blue-800 rounded-xl px-4 py-3 shadow-2xl">
          <span className="text-sm text-white font-medium">{selectedIds.size} selected</span>
          <button
            onClick={clearSelection}
            className="text-xs text-slate-400 hover:text-white transition"
          >
            Clear
          </button>
          <button
            onClick={() => setShowBulkDeathModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition"
          >
            <Skull className="w-3.5 h-3.5" />
            Mark as Died
          </button>
        </div>
      )}

      {/* Bulk Death Modal — shared death time + attendance for all selected */}
      {showBulkDeathModal && bulkBoss && (
        <DeathRecordModal
          boss={bulkBoss}
          onClose={() => setShowBulkDeathModal(false)}
          onSubmit={(dt, imgs, ids) => {
            handleBulkRecordDeath(dt, imgs, ids);
            setShowBulkDeathModal(false);
          }}
        />
      )}
    </div>
  );
}

/** Auto-dismissing toast notification */
function ToastMessage({
  toast,
  onDismiss,
}: {
  toast: { type: "success" | "error"; message: string };
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const isSuccess = toast.type === "success";

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border ${
          isSuccess
            ? "bg-emerald-900/90 border-emerald-700 text-emerald-200"
            : "bg-red-900/90 border-red-700 text-red-200"
        }`}
      >
        {isSuccess ? (
          <CheckCircle className="w-5 h-5 shrink-0" />
        ) : (
          <AlertTriangle className="w-5 h-5 shrink-0" />
        )}
        <p className="text-sm font-medium">{toast.message}</p>
        <button onClick={onDismiss} className="ml-2 text-white/50 hover:text-white transition">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
