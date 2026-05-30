import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useLeaderboard, type LeaderboardPeriod } from "@/hooks/useAttendance";
import { useLeaderboardSnapshots, getLastFinalized, getLeaderboardResetAt } from "@/hooks/useLeaderboardSnapshots";
import { guildColor } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId, useServer } from "@/contexts/ServerContext";
import { fetchMemberKills, type MemberBossKill, isSupabaseConfigured, fetchGuilds, adjustMemberPoints, fetchPointAdjustments, supabase } from "@/lib/supabase";
import { useAttendance } from "@/hooks/useAttendance";
import { useMembers } from "@/hooks/useMembers";
import type { Guild, LeaderboardSnapshot, PointAdjustment } from "@/types";
import { Trophy, Medal, Crown, Users, Loader2, X, Skull, CheckCheck, History, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Search, Shield, Plus, Minus, Edit3, Share2 } from "lucide-react";
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
  const lastFinalized = getLastFinalized();
  const [finalizing, setFinalizing] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [guildFilter, setGuildFilter] = useState<string>("all");
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [snapshotGuildFilter, setSnapshotGuildFilter] = useState<string>("all");

  // Attendance export state
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekAgoStr = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [exportStartDate, setExportStartDate] = useState(weekAgoStr);
  const [exportEndDate, setExportEndDate] = useState(todayStr);
  const [exportGuildFilter, setExportGuildFilter] = useState<string>("all");
  const [exportLoading, setExportLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Point adjustment modal state
  const { currentServer } = useServer();
  const isStaff = !isViewer && (currentServer?.role === "owner" || currentServer?.role === "moderator");
  const [adjustMember, setAdjustMember] = useState<{ id: string; name: string; points: number } | null>(null);
  const [adjustValue, setAdjustValue] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustHistory, setAdjustHistory] = useState<PointAdjustment[]>([]);
  const [showAdjustHistory, setShowAdjustHistory] = useState(false);

  // Fetch guilds and members for filtering
  const { data: members = [] } = useMembers();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  useEffect(() => { fetchGuilds().then(setGuilds).catch(() => setGuilds([])); }, []);

  // Build member-guild lookup
  const memberGuildMap = new Map(members.map(m => [m.id, m.guild_id]));

  // Filter by search + guild
  const filteredEntries = (() => {
    let result = entries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => e.name.toLowerCase().includes(q));
    }
    if (guildFilter !== "all") {
      result = result.filter(e => memberGuildMap.get(e.id) === guildFilter);
    }
    return result;
  })();

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
          const now = new Date();
          let periodStart: string;
          if (period === "weekly") {
            const day = now.getDay();
            const monday = new Date(now);
            monday.setDate(now.getDate() - ((day + 6) % 7));
            monday.setHours(0, 0, 0, 0);
            periodStart = monday.toISOString();
          } else if (period === "monthly") {
            periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          } else {
            periodStart = "1970-01-01T00:00:00Z";
          }
          let since = periodStart;
          try {
            const { data: snaps } = await supabase
              .from("leaderboard_snapshots")
              .select("finalized_at")
              .eq("period", period)
              .eq("server_id", serverId)
              .order("finalized_at", { ascending: false })
              .limit(1);
            if (snaps && snaps.length > 0) {
              const reset = (snaps[0] as any).finalized_at;
              if (reset > periodStart) since = reset;
            }
          } catch { /* fall back to periodStart */ }
          fetchMemberKills(entry.id, since, serverId)
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
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const buildShareText = () => {
    const periodLabel = period === "weekly" ? "This Week" : period === "monthly" ? "This Month" : "All Time";
    const lines = entries.slice(0, 20).map((e, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      return `${medal} ${e.name} — ${e.points} pts`;
    });
    return `🏆 ${currentServer?.name} Leaderboard — ${periodLabel}\n\n${lines.join("\n")}\n\n📊 raidscout.com`;
  };

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
    if (!exportStartDate || !exportEndDate || !serverId) return;
    setExportLoading(true);
    try {
      // Fetch death records in date range
      const startISO = new Date(exportStartDate).toISOString();
      const endISO = new Date(exportEndDate + "T23:59:59").toISOString();
      const { data: deaths, error: deathsErr } = await supabase
        .from("death_records")
        .select("id,boss_id,death_time")
        .eq("server_id", serverId)
        .gte("death_time", startISO)
        .lte("death_time", endISO)
        .order("death_time", { ascending: true });
      if (deathsErr) throw new Error(`Death records: ${deathsErr.message}`);
      if (!deaths?.length) { alert("No death records in this date range."); setExportLoading(false); return; }

      const deathIds = deaths.map(d => d.id);
      const bossIds = [...new Set(deaths.map(d => d.boss_id))];

      // Fetch bosses
      const { data: bosses, error: bossesErr } = await supabase
        .from("bosses")
        .select("id,name,boss_points")
        .in("id", bossIds);
      if (bossesErr) throw new Error(`Bosses: ${bossesErr.message}`);
      const bossMap = new Map((bosses || []).map(b => [b.id, b]));

      // Fetch attendance records
      const { data: attRecords, error: attErr } = await supabase
        .from("attendance_records")
        .select("death_record_id,member_id")
        .in("death_record_id", deathIds);
      if (attErr) throw new Error(`Attendance: ${attErr.message}`);

      // Fetch ALL members with guild
      const { data: allMembers, error: memErr } = await supabase
        .from("members")
        .select("id,name,guild_id")
        .eq("server_id", serverId);
      if (memErr) throw new Error(`Members: ${memErr.message}`);
      const memberMap = new Map((allMembers || []).map(m => [m.id, m]));

      // Filter members by guild
      const guildMemberIds = new Set(
        exportGuildFilter === "all"
          ? (allMembers || []).map((m: any) => m.id)
          : (allMembers || []).filter((m: any) => m.guild_id === exportGuildFilter).map((m: any) => m.id)
      );

      // Build per-death attendance: death_id → Set<member_id>
      const deathBossMap = new Map(deaths.map((d: any) => [d.id, d]));
      const deathAttendees = new Map<string, Set<string>>();
      const allAttendedMembers = new Set<string>();

      for (const att of attRecords || []) {
        if (!guildMemberIds.has(att.member_id)) continue;
        if (!deathBossMap.has(att.death_record_id)) continue;
        if (!deathAttendees.has(att.death_record_id)) deathAttendees.set(att.death_record_id, new Set());
        deathAttendees.get(att.death_record_id)!.add(att.member_id);
        allAttendedMembers.add(att.member_id);
      }

      // Sort members alphabetically
      const sortedMembers = [...allAttendedMembers].sort((a, b) => {
        const ma = memberMap.get(a);
        const mb = memberMap.get(b);
        return (ma?.name || "").localeCompare(mb?.name || "");
      });

      // Compute player totals
      const memberTotals = new Map<string, number>();
      for (const [deathId, memberSet] of deathAttendees) {
        const death = deathBossMap.get(deathId);
        const boss = bossMap.get(death?.boss_id);
        const pts = (boss as any)?.boss_points || 0;
        for (const mid of memberSet) {
          memberTotals.set(mid, (memberTotals.get(mid) || 0) + pts);
        }
      }

      // Build data rows: one per death
      const dataRows: any[][] = [];
      const timeFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      for (const death of deaths) {
        const attendees = deathAttendees.get(death.id);
        if (!attendees || attendees.size === 0) continue;
        const boss = bossMap.get(death.boss_id);
        const row: any[] = [
          attendees.size,
          timeFmt.format(new Date(death.death_time)),
          boss?.name || "?",
        ];
        for (const mid of sortedMembers) {
          row.push(attendees.has(mid) ? ((boss as any)?.boss_points || 0) : 0);
        }
        dataRows.push(row);
      }

      // Build Excel with SheetJS
      const numCols = 3 + sortedMembers.length;

      // Build styled HTML table (Excel opens .xls HTML natively with full styling)
      const playerColors = ["#7C3AED", "#059669", "#D97706", "#0891B2", "#DB2777", "#4F46E5", "#E11D48", "#0D9488", "#EA580C", "#65A30D"];
      const playerColor = (idx: number) => playerColors[idx % playerColors.length];
      const darkBg = "#1E293B";
      const darkerBg = "#0F172A";

      let html = `<html><head><meta charset="utf-8"><style>
        table { border-collapse: collapse; font-family: -apple-system, sans-serif; font-size: 11px; }
        th, td { padding: 6px 10px; border: 1px solid #334155; text-align: center; }
        .hdr { background: ${darkBg}; color: #fff; font-weight: bold; }
        .boss { font-weight: bold; color: #F87171; text-align: left; }
        .dt { text-align: center; color: #E2E8F0; }
        .even { background: ${darkBg}; color: #E2E8F0; }
        .odd { background: ${darkerBg}; color: #E2E8F0; }
        .pts-yes { font-weight: bold; color: #FBBF24; }
        .pts-no { color: #475569; }
        .shdr { background: #1E293B; color: #94A3B8; font-weight: bold; }
        .rnk { text-align: center; color: #94A3B8; }
        .nm { color: #E2E8F0; text-align: left; }
        .num { text-align: center; color: #FBBF24; font-weight: bold; }
</style></head><body><table>`;

      // Build ranking data
      const sortedRanking = [...memberTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .filter(([, pts]) => pts > 0);

      // Row 0: Player name headers + ranking header
      html += `<tr><th class="hdr"></th><th class="hdr"></th><th class="hdr"></th>`;
      sortedMembers.forEach((mid, i) => {
        html += `<th class="hdr" style="background:${playerColor(i)}">${memberMap.get(mid)?.name || "?"}</th>`;
      });
      html += `<th class="hdr" style="background:#1E293B;min-width:16px"></th><th class="hdr" colspan="3" style="background:#7C3AED">🏆 Ranking</th></tr>`;

      // Row 1: Labels + totals + ranking sub-header
      html += `<tr><th class="hdr">P</th><th class="hdr">Date & Time</th><th class="hdr">Boss</th>`;
      sortedMembers.forEach((mid, i) => {
        html += `<th class="hdr" style="background:${playerColor(i)};font-size:14px">${memberTotals.get(mid) || 0}</th>`;
      });
      html += `<th class="hdr" style="background:#1E293B"></th><th class="shdr">#</th><th class="shdr" style="text-align:left">Player</th><th class="shdr">Pts</th></tr>`;

      // Data rows + ranking side by side
      const maxR = Math.max(dataRows.length, sortedRanking.length);
      for (let ri = 0; ri < maxR; ri++) {
        const cls = ri % 2 === 0 ? "even" : "odd";
        html += `<tr>`;
        if (ri < dataRows.length) {
          const row = dataRows[ri];
          html += `<td class="${cls}">${row[0]}</td><td class="dt ${cls}">${row[1]}</td><td class="boss ${cls}">${row[2]}</td>`;
          for (let c = 3; c < numCols; c++) {
            const val = row[c] || 0;
            html += `<td class="${cls} ${val > 0 ? 'pts-yes' : 'pts-no'}">${val}</td>`;
          }
        } else {
          html += `<td class="${cls}"></td><td class="${cls}"></td><td class="${cls}"></td>`;
          for (let c = 3; c < numCols; c++) html += `<td class="${cls}"></td>`;
        }
        html += `<td class="${cls}"></td>`;
        if (ri < sortedRanking.length) {
          const [mid, pts] = sortedRanking[ri];
          const name = memberMap.get(mid)?.name || "?";
          const medal = ri === 0 ? "🥇" : ri === 1 ? "🥈" : ri === 2 ? "🥉" : `${ri + 1}`;
          html += `<td class="rnk ${cls}">${medal}</td><td class="nm ${cls}">${name}</td><td class="num ${cls}">${pts}</td>`;
        } else {
          html += `<td class="${cls}"></td><td class="${cls}"></td><td class="${cls}"></td>`;
        }
        html += `</tr>`;
      }

      html += `</table></body></html>`;

      const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-${exportStartDate}_to_${exportEndDate}.xls`;
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
              {period === "all" ? "" : period === "weekly" ? " · This Week" : " · This Month"}
              {" · "}Points per boss set in Settings
            </p>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="flex items-center gap-2">
            {isStaff && (
              <button
                onClick={async () => {
                  setShowAdjustHistory(true);
                  if (serverId) {
                    try {
                      setAdjustHistory(await fetchPointAdjustments(serverId));
                    } catch { setAdjustHistory([]); }
                  }
                }}
                className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition"
              >
                <Edit3 className="w-3 h-3" />
                Point History
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
              >
                <Share2 className="w-3.5 h-3.5" /> Share
              </button>
              {showShareMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowShareMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-1">
                    <button
                      onClick={() => {
                        const text = buildShareText();
                        setShowShareMenu(false);
                        try {
                          (navigator as any).share?.({ title: `${currentServer?.name} Leaderboard`, text });
                        } catch {
                          navigator.clipboard.writeText(text);
                        }
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition"
                    >
                      <Share2 className="w-3.5 h-3.5" /> Share via...
                    </button>
                    <button
                      onClick={() => {
                        const text = buildShareText();
                        setShowShareMenu(false);
                        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://www.raidscout.com")}&quote=${encodeURIComponent(text)}`;
                        window.open(url, "_blank", "width=600,height=400");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      Facebook
                    </button>
                    <button
                      onClick={() => {
                        const text = buildShareText();
                        setShowShareMenu(false);
                        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                        window.open(url, "_blank", "width=600,height=400");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      X / Twitter
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(buildShareText());
                        setShowShareMenu(false);
                        setCopiedShare(true);
                        setTimeout(() => setCopiedShare(false), 2000);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition"
                    >
                      <CheckCheck className="w-3.5 h-3.5" /> Copy Text
                    </button>
                  </div>
                </>
              )}
            </div>
            {!isViewer && (
            <button
              onClick={() => setShowFinalizeConfirm(true)}
              disabled={finalizing}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition disabled:opacity-50"
            >
              {finalizing ? (
                <span className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
              ) : (
                <CheckCheck className="w-3.5 h-3.5" />
              )}
              Finalize
            </button>
            )}
          </div>
        )}
      </div>

      {/* Last finalized info + past results */}
      {lastFinalized && (
        <p className="text-xs text-slate-600">
          Last finalized: {new Date(lastFinalized.date).toLocaleString()} ({lastFinalized.period})
        </p>
      )}
      {snapshots.length > 0 && (
        <button
          onClick={() => setShowSnapshots(true)}
          className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition"
        >
          <History className="w-3.5 h-3.5" />
          Previous Results ({snapshots.length})
        </button>
      )}

      {/* Period tabs */}
      <div className="flex bg-slate-800 rounded-lg p-0.5">
        {(["weekly", "monthly", "all"] as LeaderboardPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
              period === p
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {p === "all" ? "All Time" : p === "weekly" ? "This Week" : "This Month"}
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
          {/* Search + Guild filter */}
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

          {/* Attendance Export toggle — hidden from viewers */}
          {!isViewer && (<>
          <button
            onClick={() => setShowExport(!showExport)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition"
          >
            {showExport ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Export Attendance
          </button>

          {showExport && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">



            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-slate-500">Start</label>
                <input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs outline-none focus:ring-2 focus:ring-amber-500 transition"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-slate-500">End</label>
                <input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs outline-none focus:ring-2 focus:ring-amber-500 transition"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-slate-500">Guild</label>
                <select
                  value={exportGuildFilter}
                  onChange={(e) => setExportGuildFilter(e.target.value)}
                  className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs outline-none focus:ring-2 focus:ring-amber-500 transition"
                >
                  <option value="all">All Guilds</option>
                  {guilds.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleExportAttendance}
                disabled={exportLoading || !exportStartDate || !exportEndDate}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-500 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {exportLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Export Excel
              </button>
            </div>
            <p className="text-[10px] text-slate-600">
              Exports a pivot table: rows = bosses, columns = players, cells = total points. Opens in Excel / Google Sheets.
            </p>
          </div>
          )}
          </> )}

          <div className="space-y-2">
          {filteredEntries.map((entry, index) => {
            const rank = index + 1;
            const style = rankColors[rank];

            const handleClick = async () => {
              setSelectedMember({ id: entry.id, name: entry.name });
              setKillsLoading(true);
              try {
                // Calculate period start, accounting for last finalized snapshot reset
                const now = new Date();
                let periodStart: string;
                if (period === "weekly") {
                  const day = now.getDay();
                  const monday = new Date(now);
                  monday.setDate(now.getDate() - ((day + 6) % 7));
                  monday.setHours(0, 0, 0, 0);
                  periodStart = monday.toISOString();
                } else if (period === "monthly") {
                  periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                } else {
                  periodStart = "1970-01-01T00:00:00Z";
                }

                // Use same reset logic as the leaderboard query
                let since = periodStart;
                const { data: snaps } = await supabase
                  .from("leaderboard_snapshots")
                  .select("finalized_at")
                  .eq("period", period)
                  .eq("server_id", serverId)
                  .order("finalized_at", { ascending: false })
                  .limit(1);
                if (snaps && snaps.length > 0) {
                  const reset = (snaps[0] as any).finalized_at;
                  if (reset > periodStart) since = reset;
                }

                if (configured) {
                  setMemberKills(await fetchMemberKills(entry.id, since, serverId));
                }
              } catch {
                setMemberKills([]);
              } finally {
                setKillsLoading(false);
              }
            };

            return (
              <div
                key={entry.id}
                onClick={handleClick}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
                role="button"
                tabIndex={0}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl border transition cursor-pointer hover:border-slate-500 ${
                  style?.bg ?? "bg-slate-900/50 border-slate-800/50"
                }`}
              >
                {/* Rank */}
                <div className="flex items-center justify-center w-9 h-9 shrink-0">
                  {style ? (
                    style.icon
                  ) : (
                    <span className="text-sm font-bold text-slate-500">#{rank}</span>
                  )}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${style?.text ?? "text-white"}`}>
                      {entry.name}
                    </span>
                    {(() => {
                      const gid = memberGuildMap.get(entry.id);
                      if (!gid) return null;
                      const guild = guilds.find(g => g.id === gid);
                      if (!guild) return null;
                      const c = guildColor(guild.name);
                      return (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
                          <Shield className="w-2.5 h-2.5 inline mr-0.5" />{guild.name}
                        </span>
                      );
                    })()}
                  </div>
                  {entry.last_attended && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      Last: {formatDate(entry.last_attended)}
                    </p>
                  )}
                </div>

                {/* Points */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-lg font-bold text-white tabular-nums">
                    {entry.points}
                  </span>
                  <span className="text-xs text-slate-500">
                    pt{entry.points !== 1 ? "s" : ""}
                  </span>
                  {isStaff && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAdjustMember({ id: entry.id, name: entry.name, points: entry.points });
                        setAdjustValue(0);
                        setAdjustReason("");
                        setAdjustError(null);
                      }}
                      className="p-0.5 rounded text-slate-600 hover:text-amber-400 hover:bg-amber-900/20 transition"
                      title="Adjust points"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* Previous Results modal */}
      {showSnapshots && snapshots.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSnapshots(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                Previous Results ({snapshots.length})
              </h3>
              <button onClick={() => setShowSnapshots(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3 flex-1">
              {snapshots.map((snap) => {
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

                const periodLabel =
                  snap.period === "all_time" ? "All Time" : snap.period === "weekly" ? `Previous #${snapshots.length - snapshots.indexOf(snap)}` : "Monthly";

                return (
                  <button
                    key={snap.id}
                    onClick={() => { setShowSnapshots(false); setSnapshotGuildFilter("all"); loadSnapshot(snap.id); }}
                    className="w-full flex items-start gap-3 px-4 py-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition text-left"
                  >
                    <History className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">
                          {periodLabel}
                        </span>
                        <span className="text-xs text-slate-500">{snap.ranking_count} ranked</span>
                      </div>
                      <p className="text-sm text-slate-200">
                        {fmt(periodStart)} → {fmt(finalized)}
                      </p>
                      {snap.top_name && (
                        <p className="text-xs text-amber-400/80 truncate">
                          🥇 {snap.top_name} · {snap.top_points} pt{snap.top_points !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 mt-0.5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
                <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { clearViewing(); setShowSnapshots(true); }}
                      className="text-slate-400 hover:text-white p-1 transition"
                      title="Back to list"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h3 className="text-white font-bold text-sm">Finalized Results</h3>
                      <p className="text-xs text-slate-500">
                        {fmt(periodStart)} → {fmt(finalized)}
                        {" · "}
                        {viewingSnapshot.period === "all_time" ? "" : "Previous"}
                      </p>
                    </div>
                  </div>
                  <button onClick={clearViewing} className="text-slate-400 hover:text-white p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto p-3 space-y-1 flex-1">
                  {/* Guild filter */}
                  {guilds.length > 0 && (
                    <div className="mb-2">
                      <select
                        value={snapshotGuildFilter}
                        onChange={(e) => setSnapshotGuildFilter(e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
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
                      return <p className="text-slate-500 text-sm text-center py-8">No rankings for this guild.</p>;
                    }
                    return filtered.map((r) => {
                      const style = rankColors[r.rank];
                      return (
                        <div
                          key={r.memberId}
                          className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border ${
                            style?.bg ?? "bg-slate-900/50 border-slate-800/50"
                          }`}
                        >
                          <div className="flex items-center justify-center w-7 h-7 shrink-0">
                            {style ? style.icon : <span className="text-xs font-bold text-slate-500">#{r.rank}</span>}
                          </div>
                          <span className={`flex-1 text-sm font-semibold ${style?.text ?? "text-white"}`}>{r.memberName}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <Trophy className="w-2.5 h-2.5 text-amber-500" />
                            <span className="text-xs font-bold text-white tabular-nums">{r.points}</span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                {viewingSnapshot.rankings.length > 0 && (
                  <div className="p-3 border-t border-slate-800 shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => {
                        const text = buildSnapshotShareText(viewingSnapshot);
                        navigator.clipboard.writeText(text);
                        setCopiedShare(true);
                        setTimeout(() => setCopiedShare(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                    >
                      {copiedShare ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <CheckCheck className="w-3.5 h-3.5" />}
                      {copiedShare ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => {
                        const text = buildSnapshotShareText(viewingSnapshot);
                        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://www.raidscout.com")}&quote=${encodeURIComponent(text)}`;
                        window.open(url, "_blank", "width=600,height=400");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/30 transition"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      Facebook
                    </button>
                    <button
                      onClick={() => {
                        const text = buildSnapshotShareText(viewingSnapshot);
                        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                        window.open(url, "_blank", "width=600,height=400");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
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
        open={showFinalizeConfirm}
        title="Finalize Leaderboard"
        message={`This will save the current rankings as a snapshot and reset the ${period === "all" ? "all-time" : period === "weekly" ? "weekly" : "monthly"} leaderboard. This cannot be undone.`}
        confirmLabel="Finalize"
        variant="warning"
        loading={finalizing}
        onConfirm={async () => {
          setFinalizing(true);
          setShowFinalizeConfirm(false);
          const rankings = entries.map((e, i) => ({
            rank: i + 1,
            memberId: e.id,
            memberName: e.name,
            points: e.points,
          }));
          const resetAt = getLeaderboardResetAt(serverId, currentServer?.created_at);
          const now = new Date();
          let periodStart: string;
          if (resetAt) {
            periodStart = resetAt;
          } else {
            // First finalization (week 0): capture from server creation onward
            periodStart = currentServer?.created_at ?? new Date(0).toISOString();
          }
          await finalizeResults(
            period === "all" ? "all_time" : period === "weekly" ? "weekly" : "monthly",
            rankings,
            periodStart
          );
          setFinalizing(false);
        }}
        onCancel={() => setShowFinalizeConfirm(false)}
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
