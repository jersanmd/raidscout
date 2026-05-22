import { useState, useMemo, useEffect } from "react";
import { type HistoryEntry } from "@/lib/history";
import { fetchHistoryFromSupabase, deleteDeathRecord, isSupabaseConfigured, editDeathTime } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import { useQueryClient } from "@tanstack/react-query";
import { ParticipantModal } from "@/components/ParticipantModal";
import { Clock, Trash2, Skull, Repeat, Timer, Users, Loader2, Pencil, X, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

export function HistoryView() {
  const [supabaseHistory, setSupabaseHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const configured = isSupabaseConfigured();

  // Fetch from Supabase only
  useEffect(() => {
    if (!configured || (!user && !isViewer) || !serverId) {
      setSupabaseHistory([]);
      setLoading(!configured || (!user && !isViewer) ? false : !serverId);
      return;
    }
    setLoading(true);
    fetchHistoryFromSupabase(serverId)
      .then(setSupabaseHistory)
      .catch(() => setSupabaseHistory([]))
      .finally(() => setLoading(false));
  }, [configured, user, isViewer, serverId]);

  const history = supabaseHistory;

  const [showClearConfirm, setShowClearConfirm] = useState(false);
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
      const [datePart, timePart] = editDate.split("T");
      const [y, m, d] = datePart.split("-").map(Number);
      const [hh, mm] = timePart.split(":").map(Number);
      const newTime = new Date(y, m - 1, d, hh, mm);
      await editDeathTime(editEntry.deathRecordId, newTime);
      queryClient.invalidateQueries({ queryKey: ["death_records"] });
      // Refresh local history
      if (serverId) {
        fetchHistoryFromSupabase(serverId).then(setSupabaseHistory).catch(() => {});
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

  const handleClear = () => {
    setSupabaseHistory([]);
    setShowClearConfirm(false);
  };

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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <Clock className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-white">Death History</h2>
        </div>
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search boss name..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 transition"
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
        {history.length > 0 && !isViewer && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

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
                      {!isViewer && entry.deathRecordId && (
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(entry);
                            }}
                            className="text-slate-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100 shrink-0 p-1"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Clear confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowClearConfirm(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xs shadow-2xl p-4 space-y-4">
            <p className="text-white text-sm text-center">
              Clear all {history.length} history entries?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                className="flex-1 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete single entry confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xs shadow-2xl p-4 space-y-4">
            <p className="text-white text-sm text-center">
              Delete <span className="font-semibold text-red-400">{deleteTarget.bossName}</span> entry? This will also remove all participant records for this kill.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm flex items-center justify-center gap-1.5"
              >
                {deleting ? (
                  <span className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete
              </button>
            </div>
          </div>
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
          readOnly={false}
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
