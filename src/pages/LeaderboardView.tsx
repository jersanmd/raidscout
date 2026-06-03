import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useLeaderboard, type LeaderboardPeriod } from "@/hooks/useAttendance";
import { useLeaderboardSnapshots, getLeaderboardResetAt } from "@/hooks/useLeaderboardSnapshots";
import { guildColor } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useServerId, useServer, useHasPermission } from "@/contexts/ServerContext";
import { useServerTimezone } from "@/hooks/useServerTimezone";
import { fetchMemberKills, type MemberBossKill, isSupabaseConfigured, fetchGuilds, adjustMemberPoints, fetchPointAdjustments, fetchPointRules, resetGuildPoints, supabase } from "@/lib/supabase";
import { useAttendance } from "@/hooks/useAttendance";
import { useMembers } from "@/hooks/useMembers";
import type { Guild, LeaderboardSnapshot, PointAdjustment } from "@/types";
import { Trophy, Medal, Crown, Users, Loader2, X, Skull, CheckCheck, History, ChevronRight, ChevronLeft, Search, Shield, Plus, Minus, Edit3, RotateCcw } from "lucide-react";
import { TableRowSkeleton } from "@/components/Skeletons";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const rankColors: Record<number, { icon: React.ReactNode; text: string; bg: string }> = {
  1: {
    icon: <Crown className="w-5 h-5 text-yellow-400" />,
    text: "text-yellow-400",
    bg: "bg-yellow-900/20 border-yellow-800",
  },
  2: {
    icon: <Medal className="w-5 h-5 text-slate-300" />,
    text: "text-slate-300",
    bg: "bg-slate-800 border-slate-700",
  },
  3: {
    icon: <Medal className="w-5 h-5 text-amber-600" />,
    text: "text-amber-500",
    bg: "bg-amber-900/20 border-amber-800",
  },
};

export function LeaderboardView() {
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const { data: entries = [], isLoading } = useLeaderboard(period);
  const { user, isViewer } = useAuth();
  const { toast } = useToast();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  // Selected member for kill history modal
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string } | null>(null);
  const [memberKills, setMemberKills] = useState<MemberBossKill[]>([]);
  const [killsLoading, setKillsLoading] = useState(false);

  // Participant modal (when clicking a boss in kill history)
  const [participantDeathId, setParticipantDeathId] = useState<string | null>(null);
  const [participantBossName, setParticipantBossName] = useState("");
  const [participantDeathTime, setParticipantDeathTime] = useState("");

  // Leaderboard snapshots
  const { snapshots, finalizeResults, viewingSnapshot, loadSnapshot, clearViewing } =
    useLeaderboardSnapshots();
  const [finalizing, setFinalizing] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [guildFilter, setGuildFilter] = useState<string>("all");
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [snapshotGuildFilter, setSnapshotGuildFilter] = useState<string>("all");

  // Attendance export state
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekAgoStr = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [showExport, setShowExport] = useState<string | null>(null);
  const [exportStartDate, setExportStartDate] = useState(weekAgoStr);
  const [exportEndDate, setExportEndDate] = useState(todayStr);
  const [exportLoading, setExportLoading] = useState(false);

  // Point adjustment modal state
  const { currentServer } = useServer();
  const serverTimezone = useServerTimezone();
  const canAdjustPoints = useHasPermission("can_adjust_points");
  const canExportAttendance = useHasPermission("can_export_attendance");
  const isStaff = !isViewer && (currentServer?.role === "owner" || currentServer?.role === "moderator");
  const [carouselPage, setCarouselPage] = useState(0);
  const [adjustMember, setAdjustMember] = useState<{ id: string; name: string; points: number } | null>(null);
  const [adjustValue, setAdjustValue] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustHistory, setAdjustHistory] = useState<PointAdjustment[]>([]);
  const [showAdjustHistory, setShowAdjustHistory] = useState<string | null>(null);

  // Fetch guilds and members for filtering
  const { data: members = [] } = useMembers();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  useEffect(() => {
    if (!currentServer?.id) return;
    fetchGuilds(currentServer.id).then(setGuilds).catch(() => setGuilds([]));
  }, [currentServer?.id]);

  // Build member-guild lookup
  const memberGuildMap = new Map(members.map(m => [m.id, m.guild_id]));
  const memberGuildNameMap = new Map(members.map(m => { const g = guilds.find(g => g.id === m.guild_id); return [m.id, g?.name ?? null] as const; }));

  const filteredEntries = (() => { let r = entries; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter(e => e.name.toLowerCase().includes(q)); } return r; })();

  const guildGroups = (() => { const g = new Map<string | null, typeof entries>(); for (const e of filteredEntries) { const n = memberGuildNameMap.get(e.id) ?? null; if (!g.has(n)) g.set(n, []); g.get(n)!.push(e); } return [...g.entries()].sort(([a],[b]) => a === null ? 1 : b === null ? -1 : a.localeCompare(b)); })();

  useEffect(() => { if (!serverId) return; const s = localStorage.getItem(`raidscout-carousel-${serverId}`); if (s) setCarouselPage(parseInt(s, 10)); }, [serverId]);
  useEffect(() => { if (serverId) localStorage.setItem(`raidscout-carousel-${serverId}`, String(carouselPage)); }, [carouselPage, serverId]);
  useEffect(() => { setCarouselPage(p => p >= guildGroups.length && guildGroups.length > 0 ? guildGroups.length - 1 : p); }, [guildGroups.length]);

  // Auto-open member from URL param (linked from History page)
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    const memberName = searchParams.get("member");
    if (memberName && entries.length > 0) {
      const entry = entries.find((e) => e.name.toLowerCase() === memberName.toLowerCase());
      if (entry) {
        setSelectedMember({ id: entry.id, name: entry.name });
        setKillsLoading(true);
        // Calculate period start, accounting for last finalized snapshot reset
        (async () => {
          let since = "1970-01-01T00:00:00Z";
          try { const { data: snaps } = await supabase.from("leaderboard_snapshots").select("finalized_at").eq("period", period).eq("server_id", serverId).order("finalized_at", { ascending: false }).limit(1); if (snaps && snaps.length > 0) since = (snaps[0] as any).finalized_at; } catch {}
          fetchMemberKills(entry.id, since, serverId, serverTimezone)
            .then(setMemberKills)
            .catch(() => setMemberKills([]))
            .finally(() => setKillsLoading(false));
        })();
        // Clear the param so it doesn't re-trigger
        searchParams.delete("member");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [entries]);

  // ── Realtime: refresh leaderboard when any boss is killed ──
  useEffect(() => {
    if (!configured || !serverId) return;

    const channel = supabase
      .channel(`leaderboard-live-${serverId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "death_records", filter: `server_id=eq.${serverId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("Leaderboard realtime channel error");
        }
      });

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [configured, serverId, queryClient]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "Never";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={4} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const buildSnapshotShareText = (snap: LeaderboardSnapshot) => {
    const periodLabel = snap.period === "weekly" ? "Weekly" : snap.period === "monthly" ? "Monthly" : "All Time";
    const lines = snap.rankings.slice(0, 20).map((r, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      return `${medal} ${r.memberName} — ${r.points} pts`;
    });
    return `🏆 ${currentServer?.name} — ${periodLabel} Results\n\n${lines.join("\n")}\n\n📊 raidscout.com`;
  };

  // ── Attendance Export ─────────────────────────────────────

  const handleExportAttendance = async () => {
    if (!exportStartDate || !exportEndDate || !serverId || !showExport) return;
    const guildName = showExport;
    setExportLoading(true);
    try {
      const guild = guilds.find(g => g.name === guildName);
      if (!guild) { alert("Guild not found."); setExportLoading(false); return; }

      const startISO = new Date(exportStartDate).toISOString();
      const endISO = new Date(exportEndDate + "T23:59:59").toISOString();

      // Fetch members of this guild
      const { data: guildMembers } = await supabase
        .from("members")
        .select("id,name")
        .eq("guild_id", guild.id)
        .eq("server_id", serverId);
      if (!guildMembers?.length) { alert("No members in this guild."); setExportLoading(false); return; }
      const memberMap = new Map(guildMembers.map((m: any) => [m.id, m.name]));
      const memberIds = guildMembers.map((m: any) => m.id);

      // Fetch death records owned by this guild in date range
      const { data: deaths, error: deathsErr } = await supabase
        .from("death_records")
        .select("id,boss_id,death_time,party_leaders")
        .eq("server_id", serverId)
        .eq("owner_guild_id", guild.id)
        .gte("death_time", startISO)
        .lte("death_time", endISO)
        .order("death_time", { ascending: true });
      if (deathsErr) throw new Error(`Death records: ${deathsErr.message}`);
      if (!deaths?.length) { alert("No death records in this date range for " + guildName + "."); setExportLoading(false); return; }

      const deathIds = deaths.map((d: any) => d.id);
      const bossIds = [...new Set(deaths.map((d: any) => d.boss_id))];

      // Fetch bosses
      const { data: bosses } = await supabase
        .from("bosses")
        .select("id,name,boss_points")
        .in("id", bossIds);
      const bossMap = new Map((bosses || []).map((b: any) => [b.id, b]));

      // Fetch attendance records for these deaths, filtered to guild members
      const { data: attRecords } = await supabase
        .from("attendance_records")
        .select("death_record_id,member_id")
        .in("death_record_id", deathIds)
        .in("member_id", memberIds);

      // Build per-death attendance
      const deathAttendees = new Map<string, Set<string>>();
      for (const att of (attRecords || [])) {
        if (!deathAttendees.has(att.death_record_id)) deathAttendees.set(att.death_record_id, new Set());
        deathAttendees.get(att.death_record_id)!.add(att.member_id);
      }

      // Sort members alphabetically
      const sortedMembers = memberIds.sort((a, b) => (memberMap.get(a) || "").localeCompare(memberMap.get(b) || ""));

      // Build Excel-compatible HTML table
      let html = `<html><head><meta charset="utf-8"><style>
        table { border-collapse: collapse; font-family: -apple-system, sans-serif; font-size: 11px; }
        th, td { padding: 6px 10px; border: 1px solid #334155; text-align: center; }
        .hdr { background: #1E293B; color: #fff; font-weight: bold; }
        .boss { font-weight: bold; color: #F87171; text-align: left; }
        .even { background: #1E293B; color: #E2E8F0; }
        .odd { background: #0F172A; color: #E2E8F0; }
        .pts-yes { font-weight: bold; color: #FBBF24; }
        .pts-no { color: #475569; }
</style></head><body><table>`;

      // Header row
      html += `<tr><th class="hdr">#</th><th class="hdr">Date</th><th class="hdr">Time</th><th class="hdr boss" style="text-align:left">Boss</th><th class="hdr">Party Leader</th>`;
      sortedMembers.forEach((mid, i) => {
        html += `<th class="hdr" style="background:${["#7C3AED","#059669","#D97706","#0891B2","#DB2777","#4F46E5"][i % 6]}">${memberMap.get(mid) || "?"}</th>`;
      });
      html += `</tr>`;

      // Data rows
      const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: serverTimezone, month: "short", day: "numeric", year: "numeric" });
      const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: serverTimezone, hour: "2-digit", minute: "2-digit" });
      deaths.forEach((death: any, ri) => {
        const attendees = deathAttendees.get(death.id);
        if (!attendees || attendees.size === 0) return;
        const boss = bossMap.get(death.boss_id);
        const cls = ri % 2 === 0 ? "even" : "odd";
        const pl = (death.party_leaders || {}) as Record<string, string>;
        const leaderName = pl[guild.id] ? (memberMap.get(pl[guild.id]) || "") : "";
        html += `<tr><td class="${cls}">${attendees.size}</td><td class="${cls}">${dateFmt.format(new Date(death.death_time))}</td><td class="${cls}">${timeFmt.format(new Date(death.death_time))}</td><td class="boss ${cls}">${boss?.name || "?"}</td><td class="${cls}">${leaderName}</td>`;
        sortedMembers.forEach(mid => {
          html += `<td class="${cls} ${attendees.has(mid) ? 'pts-yes' : 'pts-no'}">${attendees.has(mid) ? (boss?.boss_points || 0) : 0}</td>`;
        });
        html += `</tr>`;
      });

      html += `</table></body></html>`;

      const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${guildName}-attendance-${exportStartDate}_to_${exportEndDate}.xls`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Check console for details.");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Leaderboard</h2>
            <p className="text-sm text-slate-400">
              {entries.length} member{entries.length !== 1 ? "s" : ""}
              {period === "all" ? "" : " · Since Reset"}
              {" · "}Points per boss set in Settings
            </p>
          </div>
        </div>
      </div>

      {/* Period tabs */}
      <div className="flex bg-slate-800 rounded-lg p-0.5">
        {(["weekly", "all"] as LeaderboardPeriod[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${period === p ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}>
            {p === "all" ? "All Time" : "Since Reset"}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-lg">No members yet</p>
          <p className="text-slate-600 text-sm mt-1">
            Record a boss death with attendees to start the leaderboard.
          </p>
        </div>
      ) : (
        <>
          {/* Search + Guild filter — always visible */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search member..."
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {guilds.length > 0 && (
              <select
                value={guildFilter}
                onChange={(e) => setGuildFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
              >
                <option value="all">All Guilds</option>
                {guilds.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
          </div>

          {guildGroups.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-lg">No members found</p>
              <p className="text-slate-600 text-sm mt-1">
                {searchQuery ? "Try adjusting your search." : "Record a boss death with attendees to start the leaderboard."}
              </p>
            </div>
          ) : (
            <>
            {/* Per-guild Export Attendance panel */}
            <div className={`transition-all duration-300 ease-out overflow-hidden ${showExport ? "max-h-48 opacity-100 mb-3" : "max-h-0 opacity-0"}`}>
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-300">
                    Export <span className="text-amber-400">{showExport}</span> Attendance
                  </p>
                  <button onClick={() => setShowExport(null)} className="text-slate-500 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-slate-500">Start</label>
                    <input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs outline-none focus:ring-2 focus:ring-amber-500 transition" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-slate-500">End</label>
                    <input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs outline-none focus:ring-2 focus:ring-amber-500 transition" />
                  </div>
                  <button onClick={() => handleExportAttendance()} disabled={exportLoading || !exportStartDate || !exportEndDate} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-500 transition disabled:opacity-50 flex items-center gap-1.5">
                    {exportLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Export Excel
                  </button>
                </div>
                <p className="text-[10px] text-slate-600">Exports a pivot table: rows = bosses, columns = players, cells = points. Opens in Excel / Google Sheets.</p>
              </div>
            </div>
            <div className="relative">
              {guildGroups.length > 1 && (<>
                <button onClick={() => setCarouselPage(p => p === 0 ? guildGroups.length - 1 : p - 1)} className="absolute left-0 top-0 bottom-0 z-10 px-1 flex items-center bg-slate-900/40 hover:bg-slate-900/60 transition -ml-1 rounded-l-xl">
                  <ChevronLeft className="w-5 h-5 text-slate-300" />
                </button>
                <button onClick={() => setCarouselPage(p => p >= guildGroups.length - 1 ? 0 : p + 1)} className="absolute right-0 top-0 bottom-0 z-10 px-1 flex items-center bg-slate-900/40 hover:bg-slate-900/60 transition -mr-1 rounded-r-xl">
                  <ChevronRight className="w-5 h-5 text-slate-300" />
                </button>
              </>)}
              <div className="overflow-hidden px-8">
                <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${carouselPage * 100}%)` }}>
                  {guildGroups.map(([guildName, guildEntries]) => {
                    const gColor = guildName ? guildColor(guildName) : { bg: "bg-slate-800", text: "text-slate-300", border: "border-slate-700" };
                    const guildSnapCount = guildName ? snapshots.filter(s => (s as any).period?.startsWith("weekly:") && (s as any).period.includes(guildName)).length : 0;
                    return (
                      <div key={guildName ?? "__unguilded__"} className="w-full flex-shrink-0 px-2">
                        <div className={`rounded-xl border ${gColor.border} ${gColor.bg} overflow-hidden`}>
                          {/* Guild header */}
                          <div className={`px-3 py-2 border-b ${gColor.border} flex items-center gap-2 flex-wrap`}>
                            <Shield className="w-4 h-4 shrink-0" />
                            <span className={`text-sm font-semibold ${gColor.text} truncate`}>{guildName ?? "Unguilded"}</span>
                            <span className="text-[10px] text-slate-500">{guildEntries.length}</span>
                            {guildName && (
                              <button onClick={(e) => { e.stopPropagation(); setShowSnapshots(guildName); }} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-amber-400 transition flex items-center gap-1" title={`${guildName} history (${guildSnapCount} results)`}>
                                <History className="w-3 h-3" />History{guildSnapCount > 0 ? ` (${guildSnapCount})` : ""}
                              </button>
                            )}
                            {isStaff && guildName && (
                              <button onClick={async (e) => { e.stopPropagation(); setShowAdjustHistory(guildName); if (serverId) { try { setAdjustHistory(await fetchPointAdjustments(serverId)); } catch { setAdjustHistory([]); } } }} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-purple-400 hover:text-purple-300 transition" title={`${guildName} point history`}>
                                Points
                              </button>
                            )}
                            {canExportAttendance && guildName && (
                              <button onClick={(e) => { e.stopPropagation(); setShowExport(showExport === guildName ? null : guildName); }} className={`text-[10px] px-2 py-0.5 rounded border transition flex items-center gap-1 ${showExport === guildName ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-amber-400"}`} title={`Export ${guildName} attendance`}>
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export
                              </button>
                            )}
                            {isStaff && guildName && (
                              <button onClick={(e) => { e.stopPropagation(); setShowFinalizeConfirm(guildName); }} className="ml-auto text-[10px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition" title={`Finalize ${guildName} rankings`}>
                                Finalize
                              </button>
                            )}
                            {isStaff && guildName && (
                              <button onClick={(e) => { e.stopPropagation(); setShowResetConfirm(guildName); }} className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition flex items-center gap-1" title={`Reset all ${guildName} points`}>
                                <RotateCcw className="w-3 h-3" />Reset
                              </button>
                            )}
                          </div>
                          {/* Member rows */}
                          <div className="divide-y divide-slate-800/50">
                            {guildEntries.map((entry, i) => {
                              const rank = i + 1;
                              const style = rankColors[rank];
                              return (
                                <div
                                  key={entry.id}
                                  onClick={async () => {
                                    setSelectedMember({ id: entry.id, name: entry.name });
                                    setKillsLoading(true);
                                    try {
                                      let since = "1970-01-01T00:00:00Z";
                                      if (period !== "all") {
                                        const { data: snaps } = await supabase
                                          .from("leaderboard_snapshots")
                                          .select("finalized_at")
                                          .eq("period", period)
                                          .eq("server_id", serverId)
                                          .order("finalized_at", { ascending: false })
                                          .limit(1);
                                        if (snaps && snaps.length > 0) {
                                          since = (snaps[0] as any).finalized_at;
                                        } else if (guildName) {
                                          const { data: settings } = await supabase
                                            .from("app_settings")
                                            .select("value")
                                            .eq("server_id", serverId)
                                            .eq("key", `leaderboard_reset_at:${guildName}`)
                                            .maybeSingle();
                                          if (settings) since = (settings as any).value;
                                        }
                                      }
                                      if (configured) setMemberKills(await fetchMemberKills(entry.id, since, serverId, serverTimezone));
                                    } catch { setMemberKills([]); }
                                    finally { setKillsLoading(false); }
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 transition"
                                >
                                  <div className="flex items-center justify-center w-6 h-6 shrink-0">
                                    {style ? <span className="scale-75">{style.icon}</span> : <span className="text-xs font-bold text-slate-500">{rank}</span>}
                                  </div>
                                  <span className="text-sm text-slate-200 flex-1 truncate">{entry.name}</span>
                                  <span className="text-xs font-mono text-slate-400">{entry.points}pt</span>
                                  {canAdjustPoints && (
                                    <button onClick={(e) => { e.stopPropagation(); setAdjustMember({ id: entry.id, name: entry.name, points: entry.points }); setAdjustValue(0); setAdjustReason(""); setAdjustError(null); }} className="p-0.5 rounded text-slate-600 hover:text-amber-400 transition" title="Adjust points">
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {guildGroups.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {guildGroups.map((_, i) => (
                  <button key={i} onClick={() => setCarouselPage(i)} className={`w-2 h-2 rounded-full transition ${i === carouselPage ? "bg-amber-400" : "bg-slate-600 hover:bg-slate-500"}`} />
                ))}
              </div>
            )}
            </>
          )}
        </>
      )}

      {/* Previous Results modal */}
      {showSnapshots !== null && snapshots.length > 0 && (() => {
        const guildSnaps = showSnapshots === "__all__"
          ? snapshots
          : snapshots.filter(s => (s as any).period?.startsWith("weekly:") && (s as any).period.includes(showSnapshots));
        if (guildSnaps.length === 0) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60" onClick={() => setShowSnapshots(null)} />
              <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xs shadow-2xl p-6 text-center">
                <History className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No finalized history for {showSnapshots} yet.</p>
                <button onClick={() => setShowSnapshots(null)} className="mt-3 text-xs text-amber-400 hover:text-amber-300 transition">Close</button>
              </div>
            </div>
          );
        }
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSnapshots(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-slate-800 shrink-0">
              <h3 className="text-white font-bold text-xs flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-amber-400" />
                {showSnapshots === "__all__" ? "All" : showSnapshots} History ({guildSnaps.length})
              </h3>
              <button onClick={() => setShowSnapshots(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-2 space-y-1.5 flex-1">
              {guildSnaps.map((snap, idx) => {
                const finalized = new Date(snap.finalized_at);
                const periodStart = new Date((snap as any).period_start || finalized);
                if (!(snap as any).period_start) {
                  if (snap.period === "weekly") periodStart.setDate(periodStart.getDate() - 7);
                  else if (snap.period === "monthly") periodStart.setMonth(periodStart.getMonth() - 1);
                  else periodStart.setTime(0);
                }
                const fmt = (d: Date) =>
                  snap.period === "all_time"
                    ? "All time"
                    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

                const periodLabel = snap.period === "all_time"
                  ? "All Time"
                  : snap.period.startsWith("weekly:")
                    ? `Previous #${guildSnaps.length - idx}`
                    : "Monthly";

                return (
                  <button
                    key={snap.id}
                    onClick={() => { setShowSnapshots(null); setSnapshotGuildFilter("all"); loadSnapshot(snap.id); }}
                    className="w-full flex items-start gap-2 px-2.5 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition text-left"
                  >
                    <History className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">
                          {periodLabel}
                        </span>
                        <span className="text-[10px] text-slate-500">{snap.ranking_count} ranked</span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        {fmt(periodStart)} → {fmt(finalized)}
                      </p>
                      {snap.top_name && (
                        <p className="text-[10px] text-amber-400/80 truncate">
                          🥇 {snap.top_name} · {snap.top_points} pt{snap.top_points !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 mt-0.5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Viewing snapshot modal */}
      {viewingSnapshot && (
        (() => {
          const finalized = new Date(viewingSnapshot.finalized_at);
          const periodStart = new Date(
            (viewingSnapshot as any).period_start || viewingSnapshot.finalized_at
          );
          if (!(viewingSnapshot as any).period_start) {
            if (viewingSnapshot.period === "weekly") periodStart.setDate(periodStart.getDate() - 7);
            else if (viewingSnapshot.period === "monthly") periodStart.setMonth(periodStart.getMonth() - 1);
            else periodStart.setTime(0);
          }
          const fmt = (d: Date) =>
            viewingSnapshot.period === "all_time"
              ? "All time"
              : d.toLocaleDateString(undefined, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                });
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" key="snap-modal">
              <div className="absolute inset-0 bg-black/60" onClick={clearViewing} />
              <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-3 border-b border-slate-800 shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { clearViewing(); setShowSnapshots("__all__"); }}
                      className="text-slate-400 hover:text-white p-1 transition"
                      title="Back to list"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h3 className="text-white font-bold text-xs">Finalized Results</h3>
                      <p className="text-[10px] text-slate-500">
                        {fmt(periodStart)} → {fmt(finalized)}
                        {" · "}
                        {viewingSnapshot.period === "all_time" ? "" : "Previous"}
                      </p>
                    </div>
                  </div>
                  <button onClick={clearViewing} className="text-slate-400 hover:text-white p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="overflow-y-auto p-2 space-y-0.5 flex-1">
                  {/* Guild filter */}
                  {guilds.length > 0 && (
                    <div className="mb-1.5">
                      <select
                        value={snapshotGuildFilter}
                        onChange={(e) => setSnapshotGuildFilter(e.target.value)}
                        className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white text-[11px] focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                      >
                        <option value="all">All Guilds</option>
                        {guilds.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {(() => {
                    const filtered = snapshotGuildFilter === "all"
                      ? viewingSnapshot.rankings
                      : viewingSnapshot.rankings.filter(r => memberGuildMap.get(r.memberId) === snapshotGuildFilter);
                    if (filtered.length === 0) {
                      return <p className="text-slate-500 text-xs text-center py-4">No rankings for this guild.</p>;
                    }
                    return filtered.map((r) => {
                      const style = rankColors[r.rank];
                      return (
                        <div
                          key={r.memberId}
                          className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border ${
                            style?.bg ?? "bg-slate-900/50 border-slate-800/50"
                          }`}
                        >
                          <div className="flex items-center justify-center w-5 h-5 shrink-0">
                            {style ? <span className="scale-75">{style.icon}</span> : <span className="text-[10px] font-bold text-slate-500">#{r.rank}</span>}
                          </div>
                          <span className={`flex-1 text-xs font-semibold ${style?.text ?? "text-white"}`}>{r.memberName}</span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Trophy className="w-2.5 h-2.5 text-amber-500" />
                            <span className="text-[10px] font-bold text-white tabular-nums">{r.points}</span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                {viewingSnapshot.rankings.length > 0 && (
                  <div className="p-2 border-t border-slate-800 shrink-0 flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => {
                        const text = buildSnapshotShareText(viewingSnapshot);
                        navigator.clipboard.writeText(text);
                        setCopiedShare(true);
                        setTimeout(() => setCopiedShare(false), 2000);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                    >
                      {copiedShare ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <CheckCheck className="w-3 h-3" />}
                      {copiedShare ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => {
                        const text = buildSnapshotShareText(viewingSnapshot);
                        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://www.raidscout.com")}&quote=${encodeURIComponent(text)}`;
                        window.open(url, "_blank", "width=600,height=400");
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/30 transition"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      FB
                    </button>
                    <button
                      onClick={() => {
                        const text = buildSnapshotShareText(viewingSnapshot);
                        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                        window.open(url, "_blank", "width=600,height=400");
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      X
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}

      {/* Kill history modal */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedMember(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xs shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-white">{selectedMember.name}</h3>
                <p className="text-[10px] text-slate-500">Boss kill history</p>
              </div>
              <button onClick={() => setSelectedMember(null)} className="text-slate-400 hover:text-white transition p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {killsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
                </div>
              ) : memberKills.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  No boss kills recorded yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {memberKills.map((kill, i) => (
                    <button
                      key={i}
                      onClick={() => { setParticipantDeathId(kill.death_record_id); setParticipantBossName(kill.boss_name); setParticipantDeathTime(kill.killed_at); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition text-left"
                    >
                      <Skull className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="text-sm text-slate-200">{kill.boss_name}</span>
                      <span className="text-[10px] text-amber-400 font-medium ml-auto mr-2">+{kill.points ?? 1}</span>
                      <span className="text-[10px] text-slate-600">
                        {new Date(kill.killed_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Participant modal (when clicking a boss in kill history) */}
      {participantDeathId && (
        <ParticipantModalInline
          deathRecordId={participantDeathId}
          bossName={participantBossName}
          deathTime={participantDeathTime}
          onClose={() => { setParticipantDeathId(null); setParticipantBossName(""); setParticipantDeathTime(""); }}
        />
      )}

      {/* Point adjustment modal */}
      {adjustMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAdjustMember(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">Adjust Points</h3>
                <p className="text-xs text-slate-400">{adjustMember.name} · Current: {adjustMember.points} pt{adjustMember.points !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => setAdjustMember(null)} className="text-slate-400 hover:text-white transition p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Quick buttons */}
              <div className="flex gap-2">
                {[-3, -1, 1, 3, 5].map(v => (
                  <button
                    key={v}
                    onClick={() => setAdjustValue(v)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
                      adjustValue === v
                        ? (v > 0 ? "bg-emerald-900/40 border border-emerald-700 text-emerald-400" : "bg-red-900/40 border border-red-700 text-red-400")
                        : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
                    }`}
                  >
                    {v > 0 ? `+${v}` : v}
                  </button>
                ))}
              </div>

              {/* Custom value */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Custom value</label>
                <input
                  type="number"
                  value={adjustValue}
                  onChange={(e) => setAdjustValue(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="e.g. -2 or 5"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="e.g. Not following instructions"
                />
              </div>

              {adjustError && (
                <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{adjustError}</p>
              )}

              {/* New total preview */}
              <div className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-400">New total</span>
                <span className={`text-sm font-bold tabular-nums ${adjustMember.points + adjustValue > adjustMember.points ? "text-emerald-400" : adjustMember.points + adjustValue < adjustMember.points ? "text-red-400" : "text-white"}`}>
                  {adjustMember.points + adjustValue} pt{(adjustMember.points + adjustValue) !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setAdjustMember(null)}
                  className="flex-1 py-2 rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!serverId || adjustValue === 0) return;
                    setAdjustLoading(true);
                    setAdjustError(null);
                    try {
                      await adjustMemberPoints(adjustMember.id, serverId, adjustValue, adjustReason);
                      // Refresh leaderboard
                      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
                      setAdjustMember(null);
                    } catch (err: any) {
                      setAdjustError(err?.message ?? "Failed to adjust points");
                    } finally {
                      setAdjustLoading(false);
                    }
                  }}
                  disabled={adjustValue === 0 || adjustLoading}
                  className={`flex-1 py-2 rounded-lg font-medium text-sm transition disabled:opacity-40 ${
                    adjustValue > 0
                      ? "bg-emerald-900/30 border border-emerald-800 text-emerald-400 hover:bg-emerald-900/50"
                      : adjustValue < 0
                        ? "bg-red-900/30 border border-red-800 text-red-400 hover:bg-red-900/50"
                        : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {adjustLoading ? (
                    <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin mx-auto" />
                  ) : adjustValue > 0 ? (
                    `Add ${adjustValue} pt${adjustValue !== 1 ? "s" : ""}`
                  ) : (
                    `Deduct ${Math.abs(adjustValue)} pt${Math.abs(adjustValue) !== 1 ? "s" : ""}`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Point adjustment history modal */}
      {showAdjustHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAdjustHistory(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-purple-400" />
                Point Adjustments History
              </h3>
              <button onClick={() => setShowAdjustHistory(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2 flex-1">
              {adjustHistory.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No adjustments yet.</p>
              ) : (
                adjustHistory.map((adj) => (
                  <div key={adj.id} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                      adj.points > 0 ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"
                    }`}>
                      {adj.points > 0 ? `+${adj.points}` : adj.points}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium">{adj.member_name}</span>
                      </div>
                      {adj.reason && (
                        <p className="text-xs text-slate-400 mt-0.5">{adj.reason}</p>
                      )}
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        by {adj.adjusted_by_name} · {new Date(adj.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!showFinalizeConfirm}
        title={`Finalize ${showFinalizeConfirm === "__global__" ? "Leaderboard" : showFinalizeConfirm ?? ""}`}
        message={showFinalizeConfirm === "__global__" ? `Save rankings as a snapshot and reset the ${period === "all" ? "all-time" : "weekly"} leaderboard.` : "Save current rankings for this guild as a snapshot and reset their points."}
        confirmLabel="Finalize"
        variant="warning"
        loading={finalizing}
        onConfirm={async () => {
          setFinalizing(true);
          const guildName = showFinalizeConfirm!;
          setShowFinalizeConfirm(null);
          try {
            let rankings;
            if (guildName === "__global__") {
              rankings = entries.map((e, i) => ({ rank: i + 1, memberId: e.id, memberName: e.name, points: e.points }));
              await finalizeResults(period === "all" ? "all_time" : "weekly", rankings, new Date().toISOString());
            } else {
              const guildEntries = guildGroups.find(([n]) => n === guildName)?.[1] ?? [];
              rankings = guildEntries.map((e, i) => ({ rank: i + 1, memberId: e.id, memberName: e.name, points: e.points }));
              await finalizeResults(`weekly:${guildName}`, rankings, new Date().toISOString());
            }
            toast("success", `${guildName === "__global__" ? "Leaderboard" : guildName} finalized`);
          } catch { toast("error", "Failed to finalize"); }
          finally { setFinalizing(false); }
        }}
        onCancel={() => setShowFinalizeConfirm(null)}
      />

      <ConfirmDialog
        open={!!showResetConfirm}
        title={`Reset ${showResetConfirm ?? ""} Points`}
        message="Permanently delete ALL attendance and point adjustments for this guild. All-time scores gone. Finalize History preserved."
        confirmLabel="Reset All Points"
        confirmText={showResetConfirm ?? ""}
        variant="danger"
        loading={resetLoading}
        onConfirm={async () => {
          setResetLoading(true);
          const guildName = showResetConfirm!;
          setShowResetConfirm(null);
          try { const gid = guilds.find(g => g.name === guildName)?.id; if (gid && serverId) { await resetGuildPoints(gid, serverId); queryClient.invalidateQueries({ queryKey: ["leaderboard"] }); } }
          catch {}
          finally { setResetLoading(false); }
        }}
        onCancel={() => setShowResetConfirm(null)}
      />
    </div>
  );
}

function ParticipantModalInline({
  deathRecordId,
  bossName,
  deathTime,
  onClose,
}: {
  deathRecordId: string;
  bossName: string;
  deathTime: string;
  onClose: () => void;
}) {
  const { data: attendance = [], isLoading } = useAttendance(deathRecordId);
  const { data: members = [] } = useMembers();
  const memberMap = new Map(members.map((m) => [m.id, m.name]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xs shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white">{bossName}</h3>
            <p className="text-[10px] text-slate-500">{new Date(deathTime).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
            </div>
          ) : attendance.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No participants recorded.</p>
          ) : (
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2">
                Participants ({attendance.length})
              </p>
              <div className="space-y-1">
                {attendance.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50">
                    <Users className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="text-sm text-slate-200">{memberMap.get(a.member_id) ?? "Unknown"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
