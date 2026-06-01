import { useState, useMemo, useEffect, useCallback } from "react";
import { type HistoryEntry } from "@/lib/history";
import { fetchHistoryFromSupabase, deleteDeathRecord, isSupabaseConfigured, editDeathTime } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId, useHasPermission } from "@/contexts/ServerContext";
import { useQueryClient } from "@tanstack/react-query";
import { ParticipantModal } from "@/components/ParticipantModal";
import { Clock, Trash2, Skull, Repeat, Timer, Users, Loader2, Pencil, X, Search, Shield } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { guildColor } from "@/lib/constants";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split("T")[0];

export function HistoryView() {
  const [supabaseHistory, setSupabaseHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const canEditDeathRecords = useHasPermission("can_edit_death_records");
  const configured = isSupabaseConfigured();

  // Date range — default last 7 days
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "custom">("7d");
  const [dateFrom, setDateFrom] = useState(() => daysAgo(7));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const handleDatePreset = (preset: "7d" | "30d" | "custom") => {
    setDateRange(preset);
    if (preset === "7d") { setDateFrom(daysAgo(7)); setDateTo(new Date().toISOString().split("T")[0]); }
    else if (preset === "30d") { setDateFrom(daysAgo(30)); setDateTo(new Date().toISOString().split("T")[0]); }
  };

  const fetchHistory = useCallback((since?: string, until?: string) => {
    if (!configured || (!user && !isViewer) || !serverId) {
      setSupabaseHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchHistoryFromSupabase(serverId, since, until)
      .then(setSupabaseHistory)
      .catch(() => setSupabaseHistory([]))
      .finally(() => setLoading(false));
  }, [configured, user, isViewer, serverId]);

  // Fetch with date range
  useEffect(() => {
    const since = dateFrom ? new Date(dateFrom + "T00:00:00Z").toISOString() : undefined;
    const until = dateTo ? new Date(dateTo + "T23:59:59Z").toISOString() : undefined;
    fetchHistory(since, until);
  }, [fetchHistory, dateFrom, dateTo]);

  const history = supabaseHistory;

  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  // Edit death time
  const [editEntry, setEditEntry] = useState<HistoryEntry | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editToast, setEditToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

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
      queryClient.invalidateQueries({ queryKey: ["death_records"] });
      // Refresh local history
      if (serverId) {
        const since = dateFrom ? new Date(dateFrom + "T00:00:00Z").toISOString() : undefined;
        const until = dateTo ? new Date(dateTo + "T23:59:59Z").toISOString() : undefined;
        fetchHistory(since, until);
      }
      setEditToast({ type: "success", message: "Death time updated!" });
      setEditEntry(null);
    } catch (err: any) {
      setEditToast({ type: "error", message: err?.message ?? "Failed to update death time" });
    } finally {
      setEditSaving(false);
    }
  };

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchText, setSearchText] = useState("");

  // Auto-open participant modal from URL (linked from Leaderboard)
  useEffect(() => {
    const boss = searchParams.get("boss");
    if (boss && history.length > 0) {
      const entry = history.find(
        (e) => e.bossName.toLowerCase() === boss.toLowerCase() && e.deathRecordId
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
    return history.filter(e => e.bossName.toLowerCase().includes(q));
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
      setSupabaseHistory(prev => prev.filter(e => e.id !== deleteTarget.id));
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

  return (
    <div className="max-w-[90rem] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <Clock className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-white">Death History</h2>
        </div>
        <div className="flex items-center gap-2 order-3 sm:order-none w-full sm:w-auto mt-2 sm:mt-0">
          <div className="relative flex-1 sm:flex-initial sm:w-48 lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search boss name..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 transition"
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(["7d", "30d", "custom"] as const).map(p => (
            <button
              key={p}
              onClick={() => handleDatePreset(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                dateRange === p
                  ? "bg-blue-900/20 border-blue-800 text-blue-400"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
              }`}
            >
              {p === "7d" ? "Last 7d" : p === "30d" ? "Last Month" : "Custom"}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range picker */}
      {dateRange === "custom" && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-16">
          <Skull className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-lg">No history yet</p>
          <p className="text-slate-600 text-sm mt-1">
            Mark a boss as died to start recording your hunt history.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-lg">No results for "{searchText}"</p>
          <button onClick={() => setSearchText("")} className="text-sm text-blue-400 hover:text-blue-300 mt-1 transition">
            Clear search
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.label}>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                {group.label}
              </h3>

              <div className="space-y-1">
                {group.entries.map((entry) => {
                  const deathDate = new Date(entry.deathTime);
                  const respawnDate = new Date(entry.respawnTime);
                  const diffMs = respawnDate.getTime() - deathDate.getTime();
                  const diffH = Math.round(diffMs / 3600_000);

                  return (
                    <div
                      key={entry.id}
                      onClick={() => entry.deathRecordId && setSelectedEntry(entry)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-800/50 transition group ${
                        entry.deathRecordId
                          ? "cursor-pointer hover:border-slate-600 hover:bg-slate-900/80"
                          : ""
                      }`}
                      title={entry.deathRecordId ? "Click to see participants" : ""}
                    >
                      {/* Icon */}
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                          entry.spawnType === "fixed_schedule"
                            ? "bg-blue-900/20 text-blue-400"
                            : "bg-orange-900/20 text-orange-400"
                        }`}
                      >
                        {entry.spawnType === "fixed_schedule" ? (
                          <Repeat className="w-4 h-4" />
                        ) : (
                          <Timer className="w-4 h-4" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium text-sm">
                            {entry.bossName}
                          </span>
                          {entry.ownerGuildName && (() => {
                            const c = guildColor(entry.ownerGuildName!);
                            return (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 border ${c.bg} ${c.text} ${c.border}`}>
                                <Shield className="w-2.5 h-2.5" />
                                {entry.ownerGuildName}
                              </span>
                            );
                          })()}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                            {entry.spawnType === "fixed_schedule" ? "Schedule" : `+${diffH}h`}
                          </span>
                          {entry.deathRecordId && (
                            <Users className="w-3 h-3 text-slate-600" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span>
                            Killed: {formatDate(entry.deathTime)} {formatTime(entry.deathTime)}
                          </span>
                          <span>â†’</span>
                          <span className="text-slate-400">
                            Spawns: {formatDate(entry.respawnTime)} {formatTime(entry.respawnTime)}
                          </span>
                        </div>
                      </div>
                      {/* Edit + Delete buttons */}
                      {!isViewer && canEditDeathRecords && entry.deathRecordId && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const dt = new Date(entry.deathTime);
                              const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                              setEditDate(local);
                              setEditEntry(entry);
                            }}
                            className="text-slate-600 hover:text-blue-400 transition opacity-0 group-hover:opacity-100 shrink-0 p-1"
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
      )}

      {/* Participant modal */}
      {selectedEntry && selectedEntry.deathRecordId && (
        <ParticipantModal
          deathRecordId={selectedEntry.deathRecordId}
          bossName={selectedEntry.bossName}
          deathTime={selectedEntry.deathTime}
          onClose={() => setSelectedEntry(null)}
          navigate={navigate}
          readOnly={isViewer}
        />
      )}

      {/* Edit death time modal */}
      {editEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditEntry(null)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Edit Death Time</h3>
              <button onClick={() => setEditEntry(null)} className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-3">
              Change the death time for <span className="text-white font-medium">{editEntry.bossName}</span>
            </p>
            <input
              type="datetime-local"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditEntry(null)}
                className="px-4 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-700 transition"
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleEditDeathTime}
                disabled={editSaving}
                className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit toast */}
      {editToast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in">
          <div className={`px-4 py-2 rounded-lg text-sm text-white shadow-lg ${editToast.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
            {editToast.message}
          </div>
        </div>
      )}
    </div>
  );
}
