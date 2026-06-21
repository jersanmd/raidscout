import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { type HistoryEntry } from "@/lib/history";
import { fetchHistoryFromSupabase, deleteDeathRecord, isSupabaseConfigured, editDeathTime, fetchGuilds, setDeathDisplayGuild, fetchBosses, supabase } from "@/lib/supabase";
import { writeAuditEntry, AuditAction } from "@/lib/api/audit";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId, useServer } from "@/contexts/ServerContext";
import { ExpiredGate } from "@/components/ExpiredGate";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useQueryClient } from "@tanstack/react-query";
import { ParticipantModal } from "@/components/ParticipantModal";
import { BossImage } from "@/components/BossImage";
import { Clock, Trash2, Skull, Repeat, Timer, Users, Loader2, Pencil, X, Search, BookOpen } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { guildColor } from "@/lib/constants";
import type { Guild } from "@/types";


// ── Infinite scroll sentinel ────────────────────────────────
function SentinelHistory({ onVisible, loading }: { onVisible: () => void; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onVisible);
  cbRef.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loading) cbRef.current(); },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading]);

  return (
    <div ref={ref} className="flex justify-center py-4">
      {loading && <Loader2 className="w-5 h-5 text-[#a1a1aa] animate-spin" />}
    </div>
  );
}

export function HistoryView() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const { currentServer } = useServer();
  const configured = isSupabaseConfigured();

  if (currentServer?.isExpired) return <ExpiredGate page="History" />;

  // Initial fetch: last 2 days, 50 records
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const fetchInitial = useCallback(async () => {
    if (!configured || (!user && !isViewer) || !serverId) {
      setHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchHistoryFromSupabase(serverId, since, undefined, null, 50);
      setHistory(result);
      setHasMore(result.length >= 50);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [configured, user, isViewer, serverId, since]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !serverId) return;
    const last = history[history.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const result = await fetchHistoryFromSupabase(serverId, since, undefined, last.death_time, 50);
      setHistory(prev => [...prev, ...result]);
      setHasMore(result.length >= 50);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, serverId, since, history]);

  useEffect(() => { fetchInitial(); }, [fetchInitial]);

  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  // Edit death time
  const [editEntry, setEditEntry] = useState<HistoryEntry | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editGuild, setEditGuild] = useState("");  useEscapeKey(() => { setEditEntry(null); });  const [editSaving, setEditSaving] = useState(false);
  const [editToast, setEditToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Guilds for owner guild ID lookup
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(true);
  useEffect(() => {
    fetchGuilds()
      .then(setGuilds)
      .catch(() => setGuilds([]))
      .finally(() => setGuildsLoading(false));
  }, []);

  // ── Tabs (synced to URL) ──
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as "timeline" | "ledger") || "timeline";
  const setTab = (t: "timeline" | "ledger") => {
    if (t === "ledger") {
      navigate(`/history?tab=ledger`, { replace: true });
    } else {
      navigate(`/history`, { replace: true });
    }
  };
  const [ledgerSubtab, setLedgerSubtab] = useState<"fixed_hours" | "fixed_schedule">("fixed_hours");

  // ── Ledger data ──
  const [ledgerDateRange, setLedgerDateRange] = useState<"7d" | "30d" | "custom">("7d");
  const [ledgerDateFrom, setLedgerDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0];
  });
  const [ledgerDateTo, setLedgerDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const ledgerSince = useMemo(() => {
    if (ledgerDateRange === "custom") return ledgerDateFrom ? new Date(ledgerDateFrom + "T00:00:00Z").toISOString() : undefined;
    const d = new Date();
    d.setDate(d.getDate() - (ledgerDateRange === "7d" ? 7 : 30));
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [ledgerDateRange, ledgerDateFrom]);

  const ledgerUntil = useMemo(() => {
    if (ledgerDateRange === "custom") return ledgerDateTo ? new Date(ledgerDateTo + "T23:59:59Z").toISOString() : undefined;
    return undefined;
  }, [ledgerDateRange, ledgerDateTo]);

  const [ledgerData, setLedgerData] = useState<{
    dates: { key: string; monthDay: string; weekday: string }[];
    fixedHours: { id: string; name: string; respawnHours: number; imageUrl?: string }[];
    fixedSchedule: { id: string; name: string; primaryDay: number; imageUrl?: string }[];
    cells: Record<string, Record<string, { guild: string | null; time: string }[]>>;
  }>({ dates: [], fixedHours: [], fixedSchedule: [], cells: {} });
  const [ledgerLoading, setLedgerLoading] = useState(false);
  useEffect(() => {
    if (tab !== "ledger" || !serverId || !configured) return;
    setLedgerLoading(true);
    (async () => {
      try {
        const s = ledgerSince;
        const u = ledgerUntil;
        let q = supabase.from("death_records").select("boss_id, death_time, owner_guild_id, bosses!inner(name, spawn_type, respawn_hours, schedule, image_url)").eq("server_id", serverId).order("death_time", { ascending: false });
        if (s) q = q.gte("death_time", s);
        if (u) q = q.lte("death_time", u);
        const { data: deaths } = await q;
        const fixedHoursMap = new Map<string, { name: string; respawnHours: number; imageUrl?: string }>();
        const fixedScheduleMap = new Map<string, { name: string; primaryDay: number; imageUrl?: string }>();
        const dateMap = new Map<string, { monthDay: string; weekday: string }>();
        const cells: Record<string, Record<string, { guild: string | null; time: string }[]>> = {};
        (deaths || []).forEach((d: any) => {
          const dt = new Date(d.death_time);
          const dateKey = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const monthDay = dt.toLocaleDateString("en-US", { month: "long", day: "numeric" });
          const weekday = dt.toLocaleDateString("en-US", { weekday: "long" });
          if (!dateMap.has(dateKey)) dateMap.set(dateKey, { monthDay, weekday });
          const time = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
          const bid = d.boss_id;
          const boss = (d as any).bosses;
          const bname = boss?.name || "Unknown";
          const stype = boss?.spawn_type || "fixed_hours";
          if (stype === "fixed_schedule") {
            const schedule = boss?.schedule;
            const days: number[] = Array.isArray(schedule) ? schedule.map((s: any) => s.day ?? 0) : [];
            const primaryDay = days.length > 0 ? Math.min(...days) : 7;
            if (!fixedScheduleMap.has(bid)) fixedScheduleMap.set(bid, { name: bname, primaryDay, imageUrl: boss?.image_url || undefined });
          } else {
            const rh = boss?.respawn_hours ?? 24;
            if (!fixedHoursMap.has(bid)) fixedHoursMap.set(bid, { name: bname, respawnHours: rh, imageUrl: boss?.image_url || undefined });
          }
          if (!cells[dateKey]) cells[dateKey] = {};
          if (!cells[dateKey][bid]) cells[dateKey][bid] = [];
          const gid = d.owner_guild_id;
          const g = gid ? guilds.find(gg => gg.id === gid) : null;
          cells[dateKey][bid].push({ guild: g?.name ?? null, time });
        });
        const fixedHours = [...fixedHoursMap.entries()]
          .sort(([, a], [, b]) => a.respawnHours - b.respawnHours)
          .map(([id, { name, respawnHours, imageUrl }]) => ({ id, name, respawnHours, imageUrl }));
        const fixedSchedule = [...fixedScheduleMap.entries()]
          .sort(([, a], [, b]) => a.primaryDay - b.primaryDay)
          .map(([id, { name, primaryDay, imageUrl }]) => ({ id, name, primaryDay, imageUrl }));
        const dates = [...dateMap.entries()]
          .sort(([a], [b]) => new Date(b + ", 2026").getTime() - new Date(a + ", 2026").getTime())
          .map(([key, { monthDay, weekday }]) => ({ key, monthDay, weekday }));
        setLedgerData({ dates, fixedHours, fixedSchedule, cells });
      } catch { /* ignore */ }
      finally { setLedgerLoading(false); }
    })();
  }, [tab, serverId, configured, ledgerSince, ledgerUntil, guilds]);

  const handleEditDeathTime = async () => {
    if (!editEntry?.deathRecordId || !editDate) return;
    setEditSaving(true);
    try {
      const match = editDate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (!match) throw new Error("Invalid date format");
      const [, y, m, d, hh, mm] = match.map(Number);
      const newTime = new Date(y, m - 1, d, hh, mm);
      if (isNaN(newTime.getTime())) throw new Error("Invalid date");
      await editDeathTime(editEntry.deathRecordId, newTime);
      const formatted = newTime.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + newTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      writeAuditEntry({
        action: AuditAction.DEATH_TIME_EDIT,
        server_id: serverId!,
        target_id: editEntry.deathRecordId,
        details: {
          boss_name: editEntry.bossName || editEntry.deathRecordId,
          old_time: editEntry.deathTime || "",
          new_time: newTime.toISOString(),
          formatted_time: formatted,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["death_records"] });
      // Refresh local history
      if (serverId) fetchInitial();
      setEditToast({ type: "success", message: "Death time updated!" });
      setEditEntry(null);
    } catch (err: any) {
      setEditToast({ type: "error", message: err?.message ?? "Failed to update death time" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditDeathGuild = async () => {
    if (!editEntry?.deathRecordId || !editGuild) return;
    setEditSaving(true);
    try {
      const oldGuild = guilds.find(g => g.id === editEntry.ownerGuildId)?.name || editEntry.ownerGuildId || "(none)";
      const newGuild = guilds.find(g => g.id === editGuild)?.name || editGuild;
      await setDeathDisplayGuild(editEntry.deathRecordId, editGuild);
      const deathTimeStr = editEntry.deathTime ? new Date(editEntry.deathTime).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + new Date(editEntry.deathTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
      writeAuditEntry({
        action: AuditAction.DEATH_GUILD_SET,
        server_id: serverId!,
        target_id: editEntry.deathRecordId,
        details: {
          boss_name: editEntry.bossName || editEntry.deathRecordId,
          old_guild: oldGuild,
          new_guild: newGuild,
          death_time: deathTimeStr,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["death_records"] });
      if (serverId) fetchInitial();
      setEditToast({ type: "success", message: "Guild updated!" });
      setEditEntry(null);
    } catch (err: any) {
      setEditToast({ type: "error", message: err?.message ?? "Failed to update guild" });
    } finally {
      setEditSaving(false);
    }
  };

  const navigate = useNavigate();
  const [searchText, setSearchText] = useState("");

  // Auto-open participant modal from URL (linked from Leaderboard)
  useEffect(() => {
    const boss = searchParams.get("boss");
    if (boss && history.length > 0) {
      const entry = history.find(
        (e) => (e.bossName || "").toLowerCase() === boss.toLowerCase() && e.deathRecordId
      );
      if (entry) {
        setSelectedEntry(entry);
        searchParams.delete("boss");
        searchParams.delete("time");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [history, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    if (!searchText.trim()) return history;
    const q = searchText.toLowerCase();
    return history.filter(e => (e.bossName || e.activityName || "").toLowerCase().includes(q));
  }, [history, searchText]);

  const grouped = useMemo(() => {
    const groups: { label: string; entries: HistoryEntry[] }[] = [];
    const now = new Date();

    for (const entry of filtered) {
      const entryDate = new Date(entry.createdAt);
      let label: string;

      if (entryDate.toDateString() === now.toDateString()) {
        label = "Today";
      } else {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (entryDate.toDateString() === yesterday.toDateString()) {
          label = "Yesterday";
        } else {
          label = entryDate.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          });
        }
      }

      let group = groups.find((g) => g.label === label);
      if (!group) {
        group = { label, entries: [] };
        groups.push(group);
      }
      group.entries.push(entry);
    }

    return groups;
  }, [filtered]);

  const handleDelete = async () => {
    if (!deleteTarget || !deleteTarget.deathRecordId) return;
    setDeleting(true);
    try {
      await deleteDeathRecord(deleteTarget.deathRecordId);
      setHistory(prev => prev.filter(e => e.id !== deleteTarget.id));
      queryClient.invalidateQueries({ queryKey: ["boss-spawns"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (err) {
      console.error("Failed to delete death record:", err);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  // ── Ledger sub-component ──
  const LedgerTable = ({ bosses, dates, cells, guilds: gs }: {
    bosses: { id: string; name: string; imageUrl?: string }[];
    dates: { key: string; monthDay: string; weekday: string }[];
    cells: Record<string, Record<string, { guild: string | null; time: string }[]>>;
    guilds: Guild[];
  }) => (
    <div className="overflow-auto max-h-[calc(100vh-200px)] rounded-lg border border-[#27272a]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-[#18181b]">
            <tr>
              <th className="text-left py-2 px-3 text-[#a1a1aa] font-medium uppercase tracking-wider border-b border-[#27272a] sticky left-0 bg-[#18181b] z-10">Date</th>
              {bosses.map(b => (
                <th key={b.id} className="text-center py-2 px-3 text-[#a1a1aa] font-medium uppercase tracking-wider border-b border-[#27272a] whitespace-nowrap align-bottom">
                  <div className="flex flex-col items-center gap-1">
                    <BossImage bossName={b.name} imageUrl={b.imageUrl} size="sm" />
                    <span>{b.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-[#18181b]">
            {dates.map(date => (
              <tr key={date.key} className="border-b border-[#27272a]/50 hover:bg-[#3f3f46]/20 transition">
                <td className="py-2 px-3 sticky left-0 bg-[#18181b] whitespace-nowrap align-top">
                  <div className="text-[#d4d4d8] font-medium text-xs">{date.monthDay}</div>
                  <div className="text-[10px] text-[#71717a]">{date.weekday}</div>
                </td>
                {bosses.map(b => {
                  const entries = cells[date.key]?.[b.id];
                  return (
                    <td key={b.id} className="py-2 px-3 text-center whitespace-nowrap align-top bg-[#18181b]">
                      {entries?.length ? (
                        <div className="flex flex-col items-center gap-1">
                          {entries.map((entry, i) => {
                            const g = entry.guild ? gs.find(gg => gg.name === entry.guild) : null;
                            return (
                              <div key={i} className="flex flex-col items-center gap-0.5">
                                <span className="text-[11px] text-[#a1a1aa] font-mono">{entry.time}</span>
                                <span>
                                  {g ? (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${guildColor(g.name).bg} ${guildColor(g.name).text} ${guildColor(g.name).border}`}>
                                      {g.name}
                                    </span>
                                  ) : (
                                    <span className="text-[#71717a] text-[10px]">—</span>
                                  )}
                                </span>
                                {i < entries.length - 1 && <div className="w-4 h-px bg-[#3f3f46] my-0.5" />}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[#52525b]">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );

  return (
    <div className="max-w-[100%] 2xl:max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#18181b] border border-[#27272a]">
            <Clock className="w-5 h-5 text-[#fafafa]" />
          </div>
          <h2 className="text-xl font-semibold text-[#fafafa]">History</h2>
        </div>
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-[#18181b] rounded-lg p-1">
          <button onClick={() => setTab("timeline")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === "timeline" ? "bg-[#27272a] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8]"}`}>Timeline</button>
          <button onClick={() => setTab("ledger")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1 ${tab === "ledger" ? "bg-[#27272a] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8]"}`}><BookOpen className="w-3 h-3" /> Ledger</button>
        </div>
        {/* Search */}
        <div className="relative w-48 lg:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search boss name..."
            className="w-full bg-[#18181b] border border-[#27272a] rounded-lg pl-9 pr-8 py-2 text-sm text-[#fafafa] placeholder-[#52525b] outline-none focus:border-[#52525b] transition"
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#71717a] hover:text-[#fafafa] transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Timeline Tab */}
      {tab === "timeline" && (<>
      {loading || guildsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-16">
          <Skull className="w-12 h-12 text-[#3f3f46] mx-auto mb-3" />
          <p className="text-[#71717a] text-lg">No history yet</p>
          <p className="text-[#52525b] text-sm mt-1">
            Mark a boss as died to start recording your hunt history.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-[#3f3f46] mx-auto mb-3" />
          <p className="text-[#71717a] text-lg">No results for "{searchText}"</p>
          <button onClick={() => setSearchText("")} className="text-sm text-[#a1a1aa] hover:text-[#d4d4d8] mt-1 transition">
            Clear search
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.label}>
              <h3 className="text-[11px] font-semibold text-[#71717a] uppercase tracking-wider mb-2 flex items-center gap-3">
                {group.label}
                <span className="flex-1 h-px bg-[#27272a]" />
              </h3>

              <div className="space-y-1">
                {group.entries.map((entry) => {
                  const deathDate = new Date(entry.deathTime || "");
                  const respawnDate = new Date(entry.respawnTime || "");
                  const diffMs = respawnDate.getTime() - deathDate.getTime();
                  const diffH = Math.round(diffMs / 3600_000);

                  return (
                    <div
                      key={entry.id}
                      onClick={() => (entry.deathRecordId || entry.activityInstanceId) && setSelectedEntry(entry)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg bg-[#18181b] border border-[#27272a] transition group ${
                        (entry.deathRecordId || entry.activityInstanceId)
                          ? "cursor-pointer hover:border-[#3f3f46] hover:bg-[#18181b]"
                          : ""
                      }`}
                      title={(entry.deathRecordId || entry.activityInstanceId) ? "Click to see participants" : ""}
                    >
                      {/* Icon — boss image or activity image */}
                      {entry.type === "activity" ? (
                        entry.activityImageUrl ? (
                          <img src={entry.activityImageUrl} alt={entry.activityName} className="w-8 h-8 rounded-lg object-cover border border-[#27272a] shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-[#09090b] border border-[#27272a] flex items-center justify-center shrink-0">
                            <Calendar className="w-4 h-4 text-[#52525b]" />
                          </div>
                        )
                      ) : (
                        <BossImage bossName={entry.bossName!} imageUrl={entry.bossImageUrl} size="sm" />
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[#fafafa] font-medium text-sm">
                            {entry.type === "activity" ? entry.activityName : entry.bossName}
                          </span>
                          {entry.type !== "activity" && entry.ownerGuildName && (
                            <span className={`text-[10px] font-medium ${guildColor(entry.ownerGuildName!).text}`}>
                              {entry.ownerGuildName}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-[#52525b]">
                            {entry.type === "activity" ? "Activity" : entry.spawnType === "fixed_schedule" ? "Schedule" : `+${diffH}h`}
                          </span>
                          {(entry.deathRecordId || entry.activityInstanceId) && (
                            <Users className="w-3 h-3 text-[#52525b]" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs mt-0.5 font-mono">
                          {entry.type === "activity" ? (
                            <span className="text-[#52525b]">Completed: {entry.completionTime ? formatDate(entry.completionTime) + " " + formatTime(entry.completionTime) : "Unknown"}</span>
                          ) : (
                            <>
                              <span className="text-[#a1a1aa]">Killed {entry.deathTime ? formatDate(entry.deathTime) + " " + formatTime(entry.deathTime) : "Unknown"}</span>
                              <span className="text-[#3f3f46]">→</span>
                              <span className="text-[#71717a]">Spawns {entry.respawnTime ? formatDate(entry.respawnTime) + " " + formatTime(entry.respawnTime) : "Unknown"}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Edit + Delete buttons — bosses only */}
                      {!isViewer && entry.type !== "activity" && entry.deathRecordId && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const dt = new Date(entry.deathTime || "");
                              const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                              setEditDate(local);
                              setEditGuild(entry.ownerGuildId ?? "");
                              setEditEntry(entry);
                            }}
                            className="text-[#52525b] hover:text-[#a1a1aa] transition opacity-0 group-hover:opacity-100 shrink-0 p-1"
                            title="Edit death time"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}      {hasMore && <SentinelHistory onVisible={loadMore} loading={loadingMore} />}
      </>)}

      {/* Ledger Tab */}
      {tab === "ledger" && (
        <div className="space-y-4">
          {/* Controls row: sub-tabs + date filter */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-[#18181b] rounded-lg p-1">
              <button onClick={() => setLedgerSubtab("fixed_hours")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${ledgerSubtab === "fixed_hours" ? "bg-[#27272a] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8]"}`}>
                Fixed-Hour Bosses
              </button>
              <button onClick={() => setLedgerSubtab("fixed_schedule")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${ledgerSubtab === "fixed_schedule" ? "bg-[#27272a] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8]"}`}>
                Fixed-Schedule Bosses
              </button>
            </div>
            {/* Date filter */}
            <div className="flex items-center gap-2">
              {(["7d", "30d", "custom"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => {
                    setLedgerDateRange(p);
                    if (p === "7d") { const d = new Date(); d.setDate(d.getDate() - 7); setLedgerDateFrom(d.toISOString().split("T")[0]); setLedgerDateTo(new Date().toISOString().split("T")[0]); }
                    else if (p === "30d") { const d = new Date(); d.setDate(d.getDate() - 30); setLedgerDateFrom(d.toISOString().split("T")[0]); setLedgerDateTo(new Date().toISOString().split("T")[0]); }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                    ledgerDateRange === p
                      ? "bg-[#27272a] border-[#3f3f46] text-[#fafafa]"
                      : "bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa]"
                  }`}
                >
                  {p === "7d" ? "Last 7d" : p === "30d" ? "Last Month" : "Custom"}
                </button>
              ))}
              {ledgerDateRange === "custom" && (
                <>
                  <input type="date" value={ledgerDateFrom} onChange={(e) => setLedgerDateFrom(e.target.value)}
                    className="bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-[#fafafa] outline-none focus:border-[#52525b]" />
                  <span className="text-xs text-[#71717a]">to</span>
                  <input type="date" value={ledgerDateTo} onChange={(e) => setLedgerDateTo(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className="bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-[#fafafa] outline-none focus:border-[#52525b]" />
                </>
              )}
            </div>
          </div>
          {ledgerLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" /></div>
          ) : (
            (() => {
              const q = searchText.toLowerCase().trim();
              const filterBosses = (bosses: typeof ledgerData.fixedHours) =>
                q ? bosses.filter(b => b.name.toLowerCase().includes(q)) : bosses;
              return ledgerSubtab === "fixed_hours"
                ? <LedgerTable bosses={filterBosses(ledgerData.fixedHours)} dates={ledgerData.dates} cells={ledgerData.cells} guilds={guilds} />
                : <LedgerTable bosses={filterBosses(ledgerData.fixedSchedule)} dates={ledgerData.dates} cells={ledgerData.cells} guilds={guilds} />;
            })()
          )}
        </div>
      )}

      {/* Participant modal — works for both boss kills and activity finishes */}
      {selectedEntry && (selectedEntry.deathRecordId || selectedEntry.activityInstanceId) && (
        <ParticipantModal
          deathRecordId={selectedEntry.deathRecordId || ""}
          bossName={selectedEntry.activityName || selectedEntry.bossName || ""}
          deathTime={(selectedEntry.activityInstanceId ? selectedEntry.completionTime : selectedEntry.deathTime) || ""}
          activityInstanceId={selectedEntry.activityInstanceId}
          onClose={() => setSelectedEntry(null)}
          navigate={navigate}
          readOnly={isViewer}
          ownerGuildId={!selectedEntry.activityInstanceId ? (() => {
            const name = selectedEntry.ownerGuildName;
            if (!name) return null;
            return guilds.find(g => g.name === name)?.id ?? null;
          })() : null}
        />
      )}

      {/* Edit death time modal */}
      {editEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditEntry(null)} />
          <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl p-6 w-full max-w-sm shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#fafafa]">Edit Death Time</h3>
              <button onClick={() => setEditEntry(null)} className="p-1 rounded-md text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[#a1a1aa] mb-1">
              Change the death time for <span className="text-[#fafafa] font-medium">{editEntry.bossName}</span>
            </p>
            <input
              type="datetime-local"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#52525b] mb-3"
              autoFocus
            />
            {guilds.length > 0 && (
              <div className="mb-4">
                <label className="text-xs text-[#71717a] block mb-1">Owner Guild</label>
                <select
                  value={editGuild}
                  onChange={(e) => setEditGuild(e.target.value)}
                  className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#52525b]"
                >
                  <option value="">Unset</option>
                  {guilds.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditEntry(null)}
                className="px-4 py-2 rounded-md text-sm text-[#71717a] hover:text-[#fafafa] transition"
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleEditDeathGuild}
                disabled={editSaving || !editGuild}
                className="px-4 py-2 rounded-md text-sm font-medium bg-[#18181b] border border-[#3f3f46] text-[#d4d4d8] hover:bg-[#27272a] transition disabled:opacity-50"
              >
                Set Guild
              </button>
              <button
                onClick={handleEditDeathTime}
                disabled={editSaving}
                className="px-4 py-2 rounded-md text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50"
              >
                Save Time
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit toast */}
      {editToast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in">
          <div className="px-4 py-2 rounded-lg text-sm text-[#fafafa] shadow-lg bg-[#18181b] border border-[#27272a]">
            {editToast.message}
          </div>
        </div>
      )}
    </div>
  );
}
