import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
  adjustBossRotation,
  toggleViewerCanEdit,
  toggleViewerCanMarkDied,
  setBossRotation,
  advanceBossRotation,
  subscribeToServerSettings,
  cleanupChannel,
} from "@/lib/supabase";
import { BossCard } from "@/components/BossCard";
import { DeathRecordModal } from "@/components/DeathRecordModal";
import { FilterBar } from "@/components/FilterBar";
import { UpcomingStrip } from "@/components/UpcomingStrip";
import { SavingOverlay } from "@/components/SavingOverlay";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { emitSpawnAlert } from "@/hooks/useSpawnAlerts";
import { guildColor } from "@/lib/constants";
import { getOwnerGuildName, getRotationInfo } from "@/lib/rotation";
import { Skull, Loader2, X, CheckCircle, AlertTriangle, CheckSquare, Megaphone, Volume2, VolumeX, Eye, Copy } from "lucide-react";
import type { BossWithSpawn, BossGuild, Guild, DeathRecord } from "@/types";

const sentAlerts = new Set<string>();

export function BossListView() {
  const { user, isViewer, viewerCanEdit: ctxViewerCanEdit, viewerCanMarkDied: ctxViewerCanMarkDied, viewerDiscordWebhookUrl: ctxDiscordWebhookUrl } = useAuth();
  const { currentServer } = useServer();
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("raidscout-alert-muted") === "true");
  const [filterWindow, setFilterWindow] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [multiMode, setMultiMode] = useState(false);

  // Track which boss just got killed for exit animation
  const [justKilledId, setJustKilledId] = useState<string | null>(null);

  // Announce bosses in 24h state
  const [showAnnounceConfirm, setShowAnnounceConfirm] = useState(false);
  const [announceLoading, setAnnounceLoading] = useState(false);

  // Guild data for boss ownership badges
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [bossGuilds, setBossGuilds] = useState<BossGuild[]>([]);
  const [hasWebhook, setHasWebhook] = useState(false);
  const [viewerCanEdit, setViewerCanEdit] = useState(false);
  const [viewerCanMarkDied, setViewerCanMarkDied] = useState(false);
  const [viewerKey, setViewerKey] = useState("");

  useEffect(() => {
    const sid = currentServer?.id;
    if (!sid) return;
    Promise.all([fetchGuilds(sid), fetchBossGuilds(sid)])
      .then(([g, bg]) => { setGuilds(g); setBossGuilds(bg); })
      .catch(() => { setGuilds([]); setBossGuilds([]); });

    if (isViewer) {
      // Viewers get settings from AuthContext (fetched via get_server_by_viewer_key RPC)
      setHasWebhook(!!ctxDiscordWebhookUrl);
      // Also check per-guild webhooks from discord_configs
      if (!ctxDiscordWebhookUrl) {
        (async () => {
          try {
            const { data } = await supabase.from("discord_configs").select("webhook_url")
              .eq("raidscout_server_id", sid).not("webhook_url", "is", null).limit(1);
            if (data?.length) setHasWebhook(true);
          } catch { /* ignore */ }
        })();
      }
      setViewerCanEdit(ctxViewerCanEdit);
      setViewerCanMarkDied(ctxViewerCanMarkDied);
      setViewerKey("");
    } else {
      // Check if server has a Discord webhook and viewer edit setting
      const checkServer = async () => {
        try {
          const { data } = await supabase.from("servers").select("discord_webhook_url, viewer_can_edit, viewer_can_mark_died, viewer_key").eq("id", sid).single();
          const legacyWebhook = !!(data as any)?.discord_webhook_url;
          // Also check per-guild webhooks
          const { data: configs } = await supabase.from("discord_configs").select("webhook_url").eq("raidscout_server_id", sid).not("webhook_url", "is", null).limit(1);
          setHasWebhook(legacyWebhook || (configs?.length ?? 0) > 0);
          setViewerCanEdit(!!(data as any)?.viewer_can_edit);
          setViewerCanMarkDied(!!(data as any)?.viewer_can_mark_died);
          setViewerKey((data as any)?.viewer_key || "");
        } catch { setHasWebhook(false); setViewerCanEdit(false); setViewerCanMarkDied(false); setViewerKey(""); }
      };
      checkServer();
    }

    // Realtime subscription — update viewer permissions without refresh
    const channel = subscribeToServerSettings(sid, (payload: any) => {
      const updated = payload.new;
      if (updated?.id !== sid) return;
      setViewerCanEdit(!!updated?.viewer_can_edit);
      setViewerCanMarkDied(!!updated?.viewer_can_mark_died);
      setHasWebhook(!!updated?.discord_webhook_url);
    });

    return () => { cleanupChannel(channel); };
  }, [currentServer?.id, isViewer, ctxViewerCanEdit, ctxViewerCanMarkDied, ctxDiscordWebhookUrl]);

  // Debounced leaderboard/analytics invalidation — batches rapid kills
  const debouncedInvalidateLeaderboard = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
        queryClient.invalidateQueries({ queryKey: ["analytics"] });
      }, 2000);
    };
  }, [queryClient]);

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

  const handleToggleViewerEdit = async () => {
    const sid = getCurrentServerId();
    if (!sid) return;
    const previous = viewerCanEdit;
    setViewerCanEdit(!previous);
    try {
      await toggleViewerCanEdit(sid);
    } catch (err: any) {
      setViewerCanEdit(previous);
      setToast({ type: "error", message: err?.message ?? "Failed to toggle setting" });
    }
  };

  const handleToggleViewerMarkDied = async () => {
    const sid = getCurrentServerId();
    if (!sid) return;
    const previous = viewerCanMarkDied;
    setViewerCanMarkDied(!previous);
    try {
      await toggleViewerCanMarkDied(sid);
    } catch (err: any) {
      setViewerCanMarkDied(previous);
      setToast({ type: "error", message: err?.message ?? "Failed to toggle setting" });
    }
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
  const ownerGuildName = useCallback((bossId: string): string | undefined => {
    return getOwnerGuildName(bossId, bossGuilds, guilds, deathRecords, spawns);
  }, [bossGuilds, guilds, deathRecords, spawns]);

  // Compute rotation info for a boss (guild names + current index)
  const bossRotationInfo = useCallback((bossId: string): { guilds: { name: string; color: { bg: string; text: string; border: string } }[]; currentIndex: number; mode: string } | null => {
    return getRotationInfo(bossId, bossGuilds, guilds, deathRecords, spawns);
  }, [bossGuilds, guilds, deathRecords, spawns]);

  // Set boss rotation to a specific guild index
  const handleSetRotation = useCallback(async (bossId: string, targetIndex: number) => {
    const info = bossRotationInfo(bossId);
    if (!info) return;
    if (targetIndex === info.currentIndex) return;
    try {
      if (info.mode === "daily") {
        // Daily mode: update the last death record's owner_guild_id directly
        const targetGuildName = info.guilds[targetIndex]?.name;
        const targetGuildId = guilds.find(g => g.name === targetGuildName)?.id;
        const lastDeath = deathRecords
          .filter(dr => dr.boss_id === bossId && !dr.is_initial_spawn)
          .sort((a, b) => new Date(b.death_time).getTime() - new Date(a.death_time).getTime())[0];
        if (lastDeath && targetGuildId) {
          await supabase.from("death_records").update({ owner_guild_id: targetGuildId }).eq("id", lastDeath.id);
        }
        // Reset rotation_adjustment to 0 so daily mode advances naturally from here
        await supabase.from("bosses").update({ rotation_adjustment: 0 }).eq("id", bossId);
      } else {
        // Rotation (per kill) mode: set rotation_counter directly
        await setBossRotation(bossId, targetIndex);
      }
      await queryClient.invalidateQueries({ queryKey: ["bosses"] });
      await queryClient.refetchQueries({ queryKey: ["bosses"] });
      await queryClient.invalidateQueries({ queryKey: ["death_records"] });
      await queryClient.refetchQueries({ queryKey: ["death_records"] });
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setToast({ type: "error", message: err?.message ?? "Failed to set rotation" });
    }
  }, [bossRotationInfo, queryClient, guilds, deathRecords]);

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
        try {
          const ownerGuildNameStr = ownerGuildName(boss.id);
          const ownerGuildId = ownerGuildNameStr ? guilds.find(g => g.name === ownerGuildNameStr)?.id ?? null : null;
          const record = await insertDeathRecord(bossId, deathTime, ownerGuildId);
          deathRecordId = record.id;

          // Delete override from DB and cache so the kill's countdown takes priority
          const sid = getCurrentServerId();
          if (sid) {
            try { await supabase.from("boss_spawn_overrides").delete().eq("boss_id", bossId).eq("server_id", sid); } catch {}
            queryClient.setQueryData(["spawn_overrides", sid], (old: any[]) =>
              (old ?? []).filter((o: any) => o.boss_id !== bossId)
            );
          }

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

          await queryClient.refetchQueries({ queryKey: ["death_records"] });
          debouncedInvalidateLeaderboard();
          queryClient.invalidateQueries({ queryKey: ["members"] });

          // Trigger exit animation
          setJustKilledId(bossId);
          setTimeout(() => setJustKilledId(null), 600);

          // Advance rotation counter on kill
          try { await advanceBossRotation(bossId); } catch {}
          queryClient.invalidateQueries({ queryKey: ["bosses"] });

          // Send Discord notification
          if (user || isViewer) {
            const result = await notifyDiscord(getCurrentServerId()!, "boss_died", {
              boss_name: boss.name,
              attendees: attendeeIds.length > 0 ? [`${attendeeIds.length} participant(s)`] : undefined,
              guild_name: ownerGuildName(boss.id),
            });
            if (result.skipped) {
              setToast({ type: "error", message: "Discord notification skipped — no channel set. Use ;notifhere in Discord." });
            } else if (!result.ok) {
              setToast({ type: "error", message: "Discord notification failed. Check bot status." });
            }
          }
        } catch (err) {
          console.error("Failed to record death:", err);
          setToast({ type: "error", message: "Failed to save death record. Check the console for details." });
        }
      } else {
        setToast({ type: "error", message: "Supabase not configured. Cannot record death." });
      }
    },
    [user, isViewer, queryClient, spawns, ownerGuildName, guilds]
  );

  const handleSetSpawnDate = useCallback(
    async (bossId: string, spawnDate: Date) => {
      setSavingMessage("Updating spawn time...");
      try {
        await setBossSpawnTime(bossId, spawnDate);
        await queryClient.invalidateQueries({ queryKey: ["spawn_overrides"] });
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
        guild_name: ownerGuildName(s.boss.id),
      }));

      const result = await announceSpawns(sid, bosses);
      if (result.skipped > 0 || result.failed > 0) {
        setToast({ type: "error", message: `${result.failed} failed, ${result.skipped} skipped — check bot status and use ;notifhere in Discord.` });
      } else {
        setToast({ type: "success", message: `${bosses.length} boss spawns announced to Discord!` });
      }
    } catch (err) {
      console.error("Announce spawns failed:", err);
      setToast({ type: "error", message: "Failed to announce to Discord. Check webhook configuration." });
    } finally {
      setAnnounceLoading(false);
      setShowAnnounceConfirm(false);
    }
  }, [spawnsIn24h, ownerGuildName]);

  const serverId = getCurrentServerId();

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
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[90rem] mx-auto px-4 py-6 space-y-6">
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
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
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
            <button
              onClick={() => { const m = localStorage.getItem("raidscout-alert-muted") !== "true"; localStorage.setItem("raidscout-alert-muted", String(m)); setIsMuted(m); }}
              className={`p-1 rounded transition ${isMuted ? "text-red-400 hover:text-red-300" : "text-slate-500 hover:text-slate-300"}`}
              title={isMuted ? "Unmute alerts" : "Mute alerts"}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        {hasWebhook && !isViewer && (
        <button
          onClick={() => setShowAnnounceConfirm(true)}
          disabled={spawnsIn24h.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-900/20 border border-purple-800 text-purple-400 text-xs font-medium hover:bg-purple-900/40 transition disabled:opacity-40 disabled:cursor-not-allowed"
          title={spawnsIn24h.length === 0 ? "No bosses spawning in the next 24 hours" : `Post ${spawnsIn24h.length} spawns to Discord`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          Post 24h Spawns to Discord
        </button>
        )}
        {!isViewer && (
          <>
            {viewerKey && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700">
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <code className="text-xs text-slate-400 font-mono select-all">{window.location.origin}/view/{viewerKey}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/view/${viewerKey}`); setToast({ type: "success", message: "Viewer link copied!" }); }}
                  className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition"
                  title="Copy viewer link"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-4 ml-auto">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Viewer Permissions</span>
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700 cursor-pointer hover:border-slate-600 transition">
              <span className="text-xs text-slate-400">Allow editing spawn time</span>
              <div className="relative">
                <input type="checkbox" checked={viewerCanEdit} onChange={handleToggleViewerEdit} className="sr-only peer" />
                <div className="w-8 h-4 bg-slate-600 rounded-full peer-checked:bg-emerald-600 transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:bg-white after:rounded-full after:transition peer-checked:after:translate-x-4" />
              </div>
            </label>
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700 cursor-pointer hover:border-slate-600 transition">
              <span className="text-xs text-slate-400">Allow marking as died</span>
              <div className="relative">
                <input type="checkbox" checked={viewerCanMarkDied} onChange={handleToggleViewerMarkDied} className="sr-only peer" />
                <div className="w-8 h-4 bg-slate-600 rounded-full peer-checked:bg-emerald-600 transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:bg-white after:rounded-full after:transition peer-checked:after:translate-x-4" />
              </div>
            </label>
          </div>
          </>
        )}
      </div>

      {/* Upcoming strip — next 3 bosses to spawn */}
      <UpcomingStrip ownerGuildName={ownerGuildName} />

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
              {/* Day header with color-coded dot */}
              {(() => {
                const firstStatus = group.spawns[0]?.status;
                const dotColor = firstStatus === "alive" ? "bg-emerald-500" : firstStatus === "countdown" ? "bg-amber-500" : "bg-blue-500";
                const textColor = firstStatus === "alive" ? "text-emerald-400" : firstStatus === "countdown" ? "text-amber-400" : "text-blue-400";
                return (
                  <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${textColor}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                    {group.label}
                    <span className="text-slate-600 font-normal normal-case text-xs">
                      {group.spawns.length} boss{group.spawns.length !== 1 ? "es" : ""}
                    </span>
                  </h3>
                );
              })()}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.spawns.map((s) => {
                  const rot = bossRotationInfo(s.boss.id);
                  return (
                  <BossCard
                    key={s.boss.id}
                    spawn={s}
                    onRecordDeath={handleRecordDeath}
                    onSetSpawnDate={handleSetSpawnDate}
                    multiMode={multiMode}
                    selected={selectedIds.has(s.boss.id)}
                    onToggleSelect={toggleSelect}
                    ownerGuildName={ownerGuildName(s.boss.id)}
                    onUrgentSpawn={(name) => {
                      emitSpawnAlert(name);
                    }}
                    onCriticalSpawn={(name) => {
                      emitSpawnAlert(`⚠️ ${name} spawning in 5s!`);
                    }}
                    onSpawned={(name) => {
                      emitSpawnAlert(`⚠️ ${name} spawning now!`);
                    }}
                    rotationGuilds={rot?.guilds}
                    rotationCurrentIndex={rot?.currentIndex}
                    rotationMode={rot?.mode}
                    onSetRotation={(idx) => handleSetRotation(s.boss.id, idx)}
                    viewerCanEdit={viewerCanEdit}
                    viewerCanMarkDied={viewerCanMarkDied}
                    justKilled={justKilledId === s.boss.id}
                    hasGuilds={bossGuilds.some(bg => bg.boss_id === s.boss.id)}
                  />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <ToastMessage toast={toast} onDismiss={() => setToast(null)} />
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
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

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
