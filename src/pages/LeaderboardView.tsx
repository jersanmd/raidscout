import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useLeaderboard, type LeaderboardPeriod } from "@/hooks/useAttendance";
import { useLeaderboardSnapshots, getLastFinalized, getLeaderboardResetAt } from "@/hooks/useLeaderboardSnapshots";
import { guildColor } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId, useServer } from "@/contexts/ServerContext";
import { fetchMemberKills, type MemberBossKill, isSupabaseConfigured, fetchGuilds, adjustMemberPoints, fetchPointAdjustments } from "@/lib/supabase";
import { useAttendance } from "@/hooks/useAttendance";
import { useMembers } from "@/hooks/useMembers";
import type { Guild, PointAdjustment } from "@/types";
import { shouldAutoFinalize, setLastAutoFinalize, getMondayISO } from "@/hooks/useAutoFinalize";
import { Trophy, Medal, Crown, Users, Loader2, X, Skull, CheckCheck, History, ChevronRight, ChevronLeft, Search, Shield, Plus, Minus, Edit3 } from "lucide-react";
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
        // calculate period start for filtering
        const now = new Date();
        let since: string | undefined;
        if (period === "weekly") {
          const day = now.getDay();
          const monday = new Date(now);
          monday.setDate(now.getDate() - ((day + 6) % 7));
          monday.setHours(0, 0, 0, 0);
          since = monday.toISOString();
        } else if (period === "monthly") {
          since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        }
        fetchMemberKills(entry.id, since, serverId).then(setMemberKills).catch(() => setMemberKills([])).finally(() => setKillsLoading(false));
        // Clear the param so it doesn't re-trigger
        searchParams.delete("member");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [entries]);

  // ── Auto-finalize every Monday at midnight ──
  useEffect(() => {
    const check = async () => {
      if (!shouldAutoFinalize(serverId) || entries.length === 0) return;

      const rankings = entries.map((e, i) => ({
        rank: i + 1,
        memberId: e.id,
        memberName: e.name,
        points: e.points,
      }));

      const periodStart = getLeaderboardResetAt(serverId) || getMondayISO(new Date());
      await finalizeResults("weekly", rankings, periodStart);
      setLastAutoFinalize(serverId, getMondayISO(new Date()));
    };

    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [entries, finalizeResults, serverId]);

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
              {" · "}1 point per boss attended
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
          Weekly Results ({snapshots.length})
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

          <div className="space-y-2">
          {filteredEntries.map((entry, index) => {
            const rank = index + 1;
            const style = rankColors[rank];

            const handleClick = async () => {
              setSelectedMember({ id: entry.id, name: entry.name });
              setKillsLoading(true);
              try {
                // Calculate period start for filtering
                const now = new Date();
                let since: string | undefined;
                if (period === "weekly") {
                  const day = now.getDay();
                  const monday = new Date(now);
                  monday.setDate(now.getDate() - ((day + 6) % 7));
                  monday.setHours(0, 0, 0, 0);
                  since = monday.toISOString();
                } else if (period === "monthly") {
                  since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
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

      {/* Weekly Results modal */}
      {showSnapshots && snapshots.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSnapshots(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                Weekly Results ({snapshots.length})
              </h3>
              <button onClick={() => setShowSnapshots(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2 flex-1">
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

                return (
                  <button
                    key={snap.id}
                    onClick={() => { setShowSnapshots(false); loadSnapshot(snap.id); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition text-left"
                  >
                    <History className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-300">{fmt(periodStart)} → {fmt(finalized)}</span>
                        {snap.top_name && (
                          <span className="text-xs text-amber-400 truncate">#1 {snap.top_name} · {snap.top_points}pt{snap.top_points !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {snap.period === "all_time" ? "" : snap.period === "weekly" ? "Weekly" : "Monthly"}
                        {" · "}{snap.ranking_count} ranked
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
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
                        {viewingSnapshot.period === "all_time" ? "" : viewingSnapshot.period === "weekly" ? "Weekly" : "Monthly"}
                      </p>
                    </div>
                  </div>
                  <button onClick={clearViewing} className="text-slate-400 hover:text-white p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto p-4 space-y-2 flex-1">
                  {viewingSnapshot.rankings.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-8">No rankings at that time.</p>
                  ) : (
                    viewingSnapshot.rankings.map((r) => {
                      const style = rankColors[r.rank];
                      return (
                        <div
                          key={r.memberId}
                          className={`flex items-center gap-4 px-4 py-3 rounded-xl border ${
                            style?.bg ?? "bg-slate-900/50 border-slate-800/50"
                          }`}
                        >
                          <div className="flex items-center justify-center w-9 h-9 shrink-0">
                            {style ? style.icon : <span className="text-sm font-bold text-slate-500">#{r.rank}</span>}
                          </div>
                          <span className={`flex-1 font-semibold ${style?.text ?? "text-white"}`}>{r.memberName}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <Trophy className="w-3 h-3 text-amber-500" />
                            <span className="text-sm font-bold text-white tabular-nums">{r.points}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
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
                      <span className="text-[10px] text-slate-600 ml-auto">
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
          const resetAt = getLeaderboardResetAt(serverId);
          const now = new Date();
          let periodStart: string;
          if (resetAt) {
            periodStart = resetAt;
          } else if (period === "weekly") {
            const d = new Date(now);
            d.setDate(d.getDate() - 7);
            periodStart = d.toISOString();
          } else if (period === "monthly") {
            const d = new Date(now);
            d.setMonth(d.getMonth() - 1);
            periodStart = d.toISOString();
          } else {
            periodStart = new Date(0).toISOString();
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
